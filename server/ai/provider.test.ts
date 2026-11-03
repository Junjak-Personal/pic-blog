import type { PhotoAiGroup } from '../../shared/types/photo-ai'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeProvider, readThumbnail } from './provider'
import type { PhotoSnapshot } from './plan'

const dirs: string[]=[]
const root=()=>{const path=mkdtempSync(join(tmpdir(),'pic-ai-'));dirs.push(path);return path}
afterEach(()=>{for(const dir of dirs)rmSync(dir,{recursive:true,force:true});dirs.length=0})
const jpeg=Buffer.from([0xff,0xd8,0xff,0xe0,0,0,0,0])
const snapshot: PhotoSnapshot = {
  post:{id:1,slug:'trip',title:'SECRET POST TITLE',summary:'SECRET SUMMARY',cover_photo_id:null,started_at:null,ended_at:null,is_public:0,cluster_radius:null,day_settings:'[]',created_at:'x',updated_at:'x'},
  points:[],photos:[
    {id:1,point_id:1,display_path:'secret-name.jpg',thumb_path:'trip/1_thumb.jpg',w:400,h:400,lat:37.1234567,lng:127.1234567,shot_at:'2026-01-01T12:10:59',camera:'SECRET CAMERA',f_number:null,exposure:null,iso:null,order_index:0},
    {id:2,point_id:2,display_path:'locked.jpg',thumb_path:'locked.jpg',w:400,h:400,lat:37,lng:127,shot_at:null,camera:null,f_number:null,exposure:null,iso:null,order_index:0},
  ],
}
const request={requestId:'test',context:'산책',sendImages:false,protectedPointIds:[2]}
const result=()=>new Response(JSON.stringify({ stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({groups:[]})}],usage:{input_tokens:10,output_tokens:5} }),{status:200})

describe('bounded Claude provider',()=>{
  it('sends only explicitly disclosed editable metadata and protects secrets',async()=>{
    let sent=''
    const fetcher=vi.fn(async(url: string | URL | Request,options?: RequestInit)=>{
      expect(url).toBe('https://api.anthropic.com/v1/messages')
      expect(options?.redirect).toBe('error')
      sent=String(options?.body)
      return result()
    })
    const provider=claudeProvider({apiKey:'FAKE-UNIT-TEST-KEY',model:'test-model'},root(),fetcher)
    const output=await provider(snapshot,request,new AbortController().signal)
    expect(output.inputTokens).toBe(10)
    expect(sent).not.toContain('SECRET')
    expect(sent).not.toContain('FAKE-UNIT-TEST-KEY')
    expect(sent).not.toContain('locked.jpg')
    expect(sent).not.toContain('37.1234567')
    expect(sent).toContain('37.1235')
    expect(sent).not.toContain('12:10:59')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('uses thumbnail bytes only after explicit image opt-in',async()=>{
    const dir=root();mkdirSync(join(dir,'trip'));writeFileSync(join(dir,'trip/1_thumb.jpg'),jpeg)
    let body=''
    const fetcher=async(_url:string|URL|Request,options?:RequestInit)=>{body=String(options?.body);return result()}
    const provider=claudeProvider({apiKey:'FAKE',model:'test'},dir,fetcher)
    await provider(snapshot,{...request,sendImages:true},new AbortController().signal)
    expect(body).toContain(jpeg.toString('base64'))
    expect(body).not.toContain('locked.jpg')
  })
  it('never follows provider redirects or retries an error',async()=>{
    const fetcher=vi.fn(async()=>new Response('sensitive provider error',{status:429}))
    await expect(claudeProvider({apiKey:'FAKE',model:'test'},root(),fetcher)(snapshot,request,new AbortController().signal)).rejects.toThrow('서비스 요청에 실패')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('retains usage for truncated or invalid JSON completion for failed attempt accounting',async()=>{
    const fetcher=async()=>new Response(JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'{'}],usage:{input_tokens:10,output_tokens:6000}}))
    expect(await claudeProvider({apiKey:'FAKE',model:'test'},root(),fetcher)(snapshot,request,new AbortController().signal)).toEqual({result:null,inputTokens:10,outputTokens:6000})
  })
  it('limits the streamed response and ignores provider error details',async()=>{
    const fetcher=async()=>new Response('x'.repeat(128_001))
    await expect(claudeProvider({apiKey:'FAKE',model:'test'},root(),fetcher)(snapshot,request,new AbortController().signal)).rejects.toThrow('너무 큽니다')
  })
  it('rejects traversal, symlinks, directories and oversized thumbnail files',()=>{
    const dir=root();mkdirSync(join(dir,'trip'));writeFileSync(join(dir,'outside.jpg'),jpeg)
    symlinkSync(join(dir,'outside.jpg'),join(dir,'trip/link.jpg'))
    writeFileSync(join(dir,'trip/huge.jpg'),Buffer.alloc(512_001))
    for(const path of ['../outside.jpg',join(dir,'outside.jpg'),'trip/link.jpg','trip','trip/huge.jpg'])expect(()=>readThumbnail(dir,path)).toThrow()
    symlinkSync(join(dir,'trip'),join(dir,'linkdir'))
    expect(()=>readThumbnail(dir,'linkdir/huge.jpg')).toThrow()
  })
})


describe('image-grounded enrichment provider',()=>{
  it('consolidates summaries with at most fifteen cover images and never transmits original titles',async()=>{
    const dir=root();mkdirSync(join(dir,'trip'))
    const photos=Array.from({length:20},(_,i)=>({...snapshot.photos[0]!,id:i+1,thumb_path:`trip/${i+1}.jpg`}))
    for(const photo of photos)writeFileSync(join(dir,photo.thumb_path),jpeg)
    const groups:PhotoAiGroup[]=photos.map(photo=>({pointId:1,photoIds:[photo.id],title:'SECRET ORIGINAL TITLE',reason:'사진 분석 근거',enrichment:{coverPhotoId:photo.id,body:'정원과 길이 보인다.',place:{status:'unidentified'}}}))
    let sent=''
    const provider=claudeProvider({apiKey:'FAKE',model:'test'},dir,async(_url,options)=>{sent=String(options?.body);return result()})
    await provider({...snapshot,photos},{...request,mode:'enrich',sendImages:true,protectedPointIds:[]},new AbortController().signal,groups)
    expect(sent.match(/"type":"image"/g)).toHaveLength(15)
    expect(sent).toContain('allowedCoverPhotoIds')
    expect(sent).toContain('1-2 concise sentences')
    expect(sent).toContain('at most 220 characters')
    expect(sent).toContain('no exhaustive catalogs')
    expect(sent).toContain('GPS alone')
    expect(sent).toContain('batchSummaries')
    expect(sent).not.toContain('SECRET')
    expect(sent).not.toContain('FAKE')
  })
})
