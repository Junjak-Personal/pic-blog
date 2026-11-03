import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SCHEMA } from '../utils/db'
import { loadSnapshot, PhotoAiService } from './service'
import { parseRequest, protectedIds, validateGroups, photoBatches } from './plan'
import type { AiProvider, AiProviderResult } from './provider'

const databases: Database.Database[] = []
afterEach(() => { for (const db of databases) db.close(); databases.length = 0 })
function setup(daily = 20) {
  const db = new Database(':memory:')
  databases.push(db)
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  db.prepare('INSERT INTO post (id,slug,title,created_at,updated_at) VALUES (1,?,?,?,?)').run('trip','여행','2026-01-01','2026-01-01')
  db.prepare('INSERT INTO post (id,slug,title,created_at,updated_at) VALUES (2,?,?,?,?)').run('other','다른 여행','2026-01-01','2026-01-01')
  for (let id=1; id<=3; id++) db.prepare('INSERT INTO point (id,post_id,lat,lng,title,body,first_shot_at,order_index) VALUES (?,1,37,127,?,?,?,?)')
    .run(id,id === 3 ? '내가 쓴 제목' : null,id === 3 ? '지켜야 할 본문' : null,`2026-01-01T0${id}:00:00`,id-1)
  db.prepare('INSERT INTO point (id,post_id,lat,lng,order_index) VALUES (9,2,38,128,0)').run()
  for (let id=1; id<=3; id++) db.prepare('INSERT INTO photo (id,point_id,display_path,thumb_path,w,h,lat,lng,shot_at,order_index) VALUES (?,?,?, ?,400,400,37,127,?,0)')
    .run(id,id,`trip/${id}_display.jpg`,`trip/${id}_thumb.jpg`,`2026-01-01T0${id}:00:00`)
  db.prepare('UPDATE post SET cover_photo_id = 1 WHERE id = 1').run()
  const service = new PhotoAiService(db,'test-model',daily)
  return { db,service }
}
const request = () => ({ requestId: randomUUID(),context:'산책',sendImages:false,protectedPointIds:[] })
const response = (): AiProviderResult => ({ result:{ groups:[{ pointId:null,photoIds:[1,2],title:'함께 걸은 길',reason:'가까운 위치와 시각' }] },inputTokens:100,outputTokens:50 })
const provider: AiProvider = async () => response()

describe('photo AI isolated SQLite workflow',() => {
  it('previews without mutation, protects manual content, applies atomically, restores original IDs and photos',async () => {
    const {db,service} = setup()
    const before = loadSnapshot(db,'trip')
    const plan = await service.propose('trip',request(),provider)
    expect(plan.status).toBe('ready')
    expect(plan.protectedPointIds).toEqual([3])
    expect(loadSnapshot(db,'trip')).toEqual(before)
    expect(service.apply('trip',plan.id).status).toBe('applied')
    const applied = loadSnapshot(db,'trip')
    expect(applied.points).toHaveLength(2)
    expect(applied.points.find(p=>p.id===3)?.body).toBe('지켜야 할 본문')
    expect(applied.photos.map(p=>[p.id,p.lat,p.lng])).toEqual(before.photos.map(p=>[p.id,p.lat,p.lng]))
    expect(applied.post.cover_photo_id).toBe(1)
    expect(service.apply('trip',plan.id).status).toBe('applied')
    expect(service.undo('trip',plan.id).status).toBe('undone')
    const restored = loadSnapshot(db,'trip')
    expect(restored.points).toEqual(before.points)
    expect(restored.photos).toEqual(before.photos)
    expect(service.undo('trip',plan.id).status).toBe('undone')
  })

  it('rejects edits with identical timestamp when data changed since preview',async () => {
    const {db,service} = setup()
    const plan = await service.propose('trip',request(),provider)
    db.prepare('UPDATE point SET body = ? WHERE id = 1').run('동시에 쓴 글')
    expect(()=>service.apply('trip',plan.id)).toThrow('기록이 변경')
    expect(loadSnapshot(db,'trip').points).toHaveLength(3)
  })

  it('rejects undo after intervening edits without losing the newer data',async () => {
    const {db,service} = setup()
    const plan = await service.propose('trip',request(),provider)
    service.apply('trip',plan.id)
    db.prepare('UPDATE post SET title = ? WHERE id = 1').run('새 제목')
    expect(()=>service.undo('trip',plan.id)).toThrow('적용 후 기록이 변경')
    expect(loadSnapshot(db,'trip').post.title).toBe('새 제목')
  })

  it('scopes proposal read, cancel, apply and undo to the original post',async () => {
    const {service} = setup()
    const plan = await service.propose('trip',request(),provider)
    for (const action of ['get','cancel','apply','undo'] as const) expect(()=>service[action]('other',plan.id)).toThrow('찾을 수 없습니다')
  })

  it('deduplicates simultaneous equal requests even with different request IDs',async () => {
    const {service} = setup()
    let resolve!: (result: AiProviderResult) => void
    let calls = 0
    const first = service.propose('trip',request(),async()=>{calls++;return new Promise(r=>{resolve=r})})
    const duplicate = await service.propose('trip',request(),provider)
    expect(duplicate.status).toBe('pending')
    resolve(response())
    const ready = await first
    expect(ready.id).toBe(duplicate.id)
    expect(calls).toBe(1)
    expect(ready.usage).toEqual({ inputTokens:100,outputTokens:50,attempts:1 })
  })

  it('cancels an active request and ignores late provider results while tracking their usage',async () => {
    const {db,service} = setup()
    const req = request()
    let resolve!: (result: AiProviderResult) => void
    let signal!: AbortSignal
    const first = service.propose('trip',req,async(_s,_r,s)=>{signal=s;return new Promise(r=>{resolve=r})})
    service.cancel('trip',req.requestId)
    expect(signal.aborted).toBe(true)
    resolve(response())
    const ended = await first
    expect(ended.status).toBe('cancelled')
    expect(ended.usage.inputTokens).toBe(100)
    expect(loadSnapshot(db,'trip').points).toHaveLength(3)
    expect(()=>service.apply('trip',req.requestId)).toThrow()
  })

  it('allows at most one explicit retry and accounts for invalid output token usage',async () => {
    const {service} = setup()
    const req = request()
    let calls=0
    const bad: AiProvider = async()=>{calls++;return { ...response(),result:{groups:[]} }}
    await service.propose('trip',req,bad)
    await service.propose('trip',req,bad)
    const final = await service.propose('trip',req,bad)
    expect(calls).toBe(2)
    expect(final.status).toBe('failed')
    expect(final.usage).toEqual({ inputTokens:200,outputTokens:100,attempts:2 })
  })

  it('daily request cap counts attempts after a post is deleted',async () => {
    const {db,service} = setup(1)
    await service.propose('trip',request(),provider)
    db.prepare('UPDATE post SET cover_photo_id = NULL WHERE id = 1').run()
    db.prepare('DELETE FROM post WHERE id = 1').run()
    db.prepare('INSERT INTO photo (id,point_id,display_path,thumb_path,w,h,lat,lng,order_index) VALUES (9,9,?,?,400,400,37,127,0)').run('other/a.jpg','other/a.jpg')
    await expect(service.propose('other',request(),provider)).rejects.toThrow('한도')
  })

  it('blocks a second differing in-flight request and request ID reuse',async () => {
    const {service} = setup()
    const req = request()
    let resolve!: (result: AiProviderResult) => void
    const first = service.propose('trip',req,async()=>new Promise(r=>{resolve=r}))
    await expect(service.propose('trip',{...request(),context:'다른 맥락'},provider)).rejects.toThrow('진행 중')
    await expect(service.propose('trip',{...req,context:'다른 맥락'},provider)).rejects.toThrow('다른 내용')
    resolve(response()); await first
  })

  it('ignores a stale attempt completion while retry is pending and keeps the retry cancellation controller',async () => {
    const {db,service} = setup()
    const req = request()
    let finishFirst!: (result: AiProviderResult) => void
    let finishSecond!: (result: AiProviderResult) => void
    let secondSignal!: AbortSignal
    const first = service.propose('trip',req,async()=>new Promise(r=>{finishFirst=r}))
    db.prepare('UPDATE photo_ai_request SET updated_at = ? WHERE id = ?').run('2020-01-01',req.requestId)
    const second = service.propose('trip',req,async(_s,_r,signal)=>{secondSignal=signal;return new Promise(r=>{finishSecond=r})})
    finishFirst(response())
    expect((await first).status).toBe('pending')
    expect(service.get('trip',req.requestId).usage.attempts).toBe(2)
    service.cancel('trip',req.requestId)
    expect(secondSignal.aborted).toBe(true)
    finishSecond(response())
    const ended=await second
    expect(ended.status).toBe('cancelled')
    expect(ended.usage.inputTokens).toBe(200)
  })

  it('recovers stale pending work after restart without an unbounded retry',async () => {
    const {db,service} = setup()
    const req = request()
    let resolve!: (result: AiProviderResult) => void
    const first = service.propose('trip',req,async()=>new Promise(r=>{resolve=r}))
    db.prepare('UPDATE photo_ai_request SET updated_at = ? WHERE id = ?').run('2020-01-01',req.requestId)
    expect(service.get('trip',req.requestId).status).toBe('failed')
    // A result arriving after recovery cannot revive failed work.
    resolve(response()); expect((await first).status).toBe('failed')
    expect((await service.propose('trip',req,provider)).usage.attempts).toBe(2)
  })
})

describe('untrusted AI plans',() => {
  it('defaults to protecting all groups, also locks manual content and uncertain coordinates',() => {
    const {db} = setup()
    db.prepare('UPDATE photo SET lat = 0,lng = 0 WHERE id = 2').run()
    const snap=loadSnapshot(db,'trip')
    expect(protectedIds(snap,[])).toEqual([2,3])
    const { protectedPointIds: _omit,...req }=request()
    expect(parseRequest(req,snap).protectedPointIds).toEqual([1,2,3])
  })
  it.each([
    [{ pointId:null,photoIds:[1,1,2],title:'중복',reason:'' }],
    [{ pointId:null,photoIds:[1,99],title:'남의 사진',reason:'' }],
    [{ pointId:null,photoIds:[1],title:'누락',reason:'' }],
    [{ pointId:3,photoIds:[1,2],title:'수동 제목 변경',reason:'' }],
    [{ pointId:null,photoIds:[1,2,3],title:'보호된 사진 이동',reason:'' }],
    [{ pointId:null,photoIds:[1,2],title:'',reason:'' }],
    [{ pointId:null,photoIds:[1,2],title:'a'.repeat(201),reason:'' }],
  ])('rejects unsafe plan %#',(groups) => {
    const {db}=setup()
    expect(()=>validateGroups({groups},loadSnapshot(db,'trip'),[3])).toThrow()
  })
})


function fillPhotos(db: Database.Database, selected: number) {
  const insert = db.prepare('INSERT INTO photo (id,point_id,display_path,thumb_path,w,h,lat,lng,shot_at,order_index) VALUES (?,1,?,?,400,400,37,127,?,?)')
  for (let id=4; id<=selected+1; id++) insert.run(id,`trip/${id}.jpg`,`trip/${id}_thumb.jpg`,'2026-01-01T03:00:00',id)
}
const echoProvider: AiProvider = async snapshot => ({
  result: { groups: [{ pointId: snapshot.photos[0]!.point_id, photoIds: snapshot.photos.map(p=>p.id), title: '같은 장소의 산책', reason: '사진과 시각이 이어집니다' }] },
  inputTokens: 10, outputTokens: 5,
})

describe('large photo AI jobs',() => {
  it('handles 1,000 editable photos with protected photos outside the limit, then applies and undoes without loss',async () => {
    const {db,service}=setup(1)
    fillPhotos(db,1000)
    const before=loadSnapshot(db,'trip')
    const sizes: number[]=[]
    const plan=await service.propose('trip',request(),async(s,r,signal)=>{
      sizes.push(s.photos.length)
      expect(r.protectedPointIds).toEqual([])
      expect(s.photos.some(p=>p.id===3)).toBe(false)
      return {result:{groups:s.photos.map(p=>({pointId:p.point_id,photoIds:[p.id],title:'사진 장면',reason:'서로 다른 장면'}))},inputTokens:10,outputTokens:5}
    })
    expect(plan.status).toBe('ready')
    expect(plan.groups).toHaveLength(1001)
    expect(plan.progress?.processedPhotos).toBe(1000)
    expect(plan.progress?.completedBatches).toBe(sizes.length)
    expect(sizes.every(n=>n<=40)).toBe(true)
    expect(plan.usage).toEqual({attempts:1,inputTokens:sizes.length*10,outputTokens:sizes.length*5})
    expect(db.prepare('SELECT count(*) n FROM photo_ai_attempt').get()).toEqual({n:1})
    expect(loadSnapshot(db,'trip')).toEqual(before)
    service.apply('trip',plan.id)
    const applied=loadSnapshot(db,'trip')
    expect(applied.photos).toHaveLength(1001)
    expect(applied.points.find(p=>p.id===3)?.body).toBe('지켜야 할 본문')
    expect(new Set(plan.groups.filter(g=>g.pointId!==3).map(g=>g.pointId))).toEqual(new Set([null]))
    service.undo('trip',plan.id)
    expect(loadSnapshot(db,'trip').photos).toEqual(before.photos)
    expect(loadSnapshot(db,'trip').points).toEqual(before.points)
  })

  it('rejects 1,001 selected photos before invoking a provider or charging an attempt',async () => {
    const {db,service}=setup()
    fillPhotos(db,1001)
    const mock=vi.fn(echoProvider)
    await expect(service.propose('trip',request(),mock)).rejects.toThrow('1,000장')
    expect(mock).not.toHaveBeenCalled()
    expect(db.prepare('SELECT count(*) n FROM photo_ai_attempt').get()).toEqual({n:0})
  })

  it('returns pending from start immediately and persists polling progress for another service instance',async () => {
    const {db,service}=setup()
    fillPhotos(db,80)
    let finish!: (result: AiProviderResult) => void
    let calls=0
    const pending=service.start('trip',request(),async(s,r,signal)=>{
      calls++
      if(calls===1)return echoProvider(s,r,signal)
      return new Promise(resolve=>{finish=resolve})
    })
    expect(pending.status).toBe('pending')
    await vi.waitFor(()=>expect(calls).toBe(2))
    const other=new PhotoAiService(db,'test-model')
    const progress=other.get('trip',pending.id)
    expect(progress.status).toBe('pending')
    expect(progress.progress?.completedBatches).toBe(1)
    expect(progress.progress?.processedPhotos).toBeGreaterThan(0)
    other.cancel('trip',pending.id)
    finish({result:{groups:[]},inputTokens:7,outputTokens:3})
    await vi.waitFor(()=>expect(other.get('trip',pending.id).usage.inputTokens).toBe(17))
    expect(other.get('trip',pending.id).status).toBe('cancelled')
  })

  it('retries only unfinished batches, preserving successful progress and accurate token usage',async () => {
    const {db,service}=setup()
    fillPhotos(db,80)
    const req=request()
    let calls=0
    const first=await service.propose('trip',req,async(s,r,signal)=>{
      if(++calls===2)return {...response(),result:{groups:[]}}
      return echoProvider(s,r,signal)
    })
    expect(first.status).toBe('failed')
    expect(first.progress?.completedBatches).toBe(1)
    const seen: number[]=[]
    const retry=await service.propose('trip',req,async(s,r,signal)=>{seen.push(...s.photos.map(p=>p.id));return echoProvider(s,r,signal)})
    expect(retry.status).toBe('ready')
    expect(retry.progress?.processedPhotos).toBe(80)
    expect(seen.length).toBe(80-(first.progress?.processedPhotos??0))
    expect(retry.usage.attempts).toBe(2)
    expect(retry.usage.inputTokens).toBe((retry.progress?.totalBatches??0)*10+100)
  })

  it('separates trip days and thumbnail payloads while permitting at most 40 photos per call',() => {
    const {db}=setup()
    fillPhotos(db,100)
    const s=loadSnapshot(db,'trip')
    db.prepare('UPDATE photo SET shot_at=? WHERE id>50').run('2026-01-02T01:00:00')
    const current=loadSnapshot(db,'trip')
    const req={...request(),sendImages:true,protectedPointIds:[3]}
    const compact=photoBatches(s,req,()=>100)
    expect(compact.some(b=>b.photos.length===40)).toBe(true)
    const heavy=photoBatches(current,req,()=>500_000)
    expect(heavy.every(b=>b.photos.length<=16)).toBe(true)
    expect(heavy.every(b=>new Set(b.photos.map(p=>p.shot_at?.slice(0,10))).size===1)).toBe(true)
    expect(heavy.flatMap(b=>b.photos).length).toBe(100)
  })
})


describe('background lifecycle guards',() => {
  it('keeps a multi-batch job alive beyond the old 65 second request window',async () => {
    vi.useFakeTimers()
    try {
      const {db,service}=setup()
      fillPhotos(db,80)
      const req=request()
      const waiting: Array<() => void>=[]
      const work=service.propose('trip',req,async(s,r,signal)=>{
        await new Promise<void>(resolve=>waiting.push(resolve))
        return echoProvider(s,r,signal)
      })
      for(let i=0;i<2;i++){
        await vi.advanceTimersByTimeAsync(40_000)
        expect(service.get('trip',req.requestId).status).toBe('pending')
        waiting.shift()!()
        await vi.advanceTimersByTimeAsync(0)
      }
      while(waiting.length){waiting.shift()!();await vi.advanceTimersByTimeAsync(0)}
      expect((await work).status).toBe('ready')
    } finally {vi.useRealTimers()}
  })

  it('does not let a cancelled attempt overwrite progress when its retry finishes first',async () => {
    const {db,service}=setup()
    fillPhotos(db,80)
    const req=request()
    let resolve!: (r:AiProviderResult)=>void
    const old=service.propose('trip',req,async()=>new Promise(r=>{resolve=r}))
    service.cancel('trip',req.requestId)
    const latest=await service.propose('trip',req,echoProvider)
    expect(latest.status).toBe('ready')
    resolve(response())
    const final=await old
    expect(final.status).toBe('ready')
    expect(final.groups).toEqual(latest.groups)
    expect(final.progress).toEqual(latest.progress)
    expect(final.usage.inputTokens).toBe(latest.usage.inputTokens+100)
  })
})


describe('background database faults',() => {
  it('contains a heartbeat SQLite failure, aborts the provider and persists failure when the database recovers',async () => {
    vi.useFakeTimers()
    try {
      const {db,service}=setup()
      const before=loadSnapshot(db,'trip')
      const req=request()
      let aborted=false
      const work=service.propose('trip',req,async(_snapshot,_request,signal)=>new Promise<AiProviderResult>((_resolve,reject)=>{
        signal.addEventListener('abort',()=>{aborted=true;reject(new Error('provider aborted'))},{once:true})
      }))
      const prepare=vi.spyOn(db,'prepare')
      prepare.mockImplementationOnce(()=>{throw new Error('SQLITE_BUSY: database is locked')})
      await vi.advanceTimersByTimeAsync(10_000)
      const ended=await work
      expect(aborted).toBe(true)
      expect(ended.status).toBe('failed')
      expect(loadSnapshot(db,'trip')).toEqual(before)
      const calls=prepare.mock.calls.length
      await vi.advanceTimersByTimeAsync(30_000)
      expect(prepare.mock.calls.length).toBe(calls)
      prepare.mockRestore()
    } finally {vi.useRealTimers()}
  })
})
