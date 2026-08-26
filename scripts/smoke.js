/**
 * 배포 후 스모크 — Aside 브라우저로 공개 화면을 실제로 열어 확인한다.
 *
 *   aside repl "$(cat scripts/smoke.js)"
 *
 * CI 의 헬스체크(/api/health 200)는 프로세스가 살아 있다는 것만 말해준다.
 * 화면이 깨져도 초록이 뜨므로, 사람이 보는 것들을 여기서 따로 본다.
 *
 * 결정적 자동화(aside repl)를 쓴다 — 에이전트 세션(aside exec)은 판단이 매번
 * 달라져 회귀 검증에 못 쓴다.
 */
const BASE = 'https://pic-blog.jun-devlog.win'
const fails = []
const ok = (cond, label, detail) => {
  if (cond) console.log(`  ok   ${label}`)
  else { fails.push(label); console.log(`  FAIL ${label}${detail ? '  → ' + detail : ''}`) }
}

// ── 공개 목록
const home = await openTab(BASE + '/')
const h = await home.evaluate(() => {
  const cs = getComputedStyle(document.documentElement)
  return {
    title: document.title,
    posts: document.querySelectorAll('a[href^="/p/"]').length,
    manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href') ?? null,
    appleIcon: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href') ?? null,
    // 레거시 메타가 다시 들어오면 standalone 상단이 뭉개진다 — 회귀 감시
    legacyCapable: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]'),
    topInset: cs.getPropertyValue('--top-inset').trim(),
    footerGithub: !!document.querySelector('footer a[href*="github.com"]'),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    firstPost: document.querySelector('a[href^="/p/"]')?.getAttribute('href') ?? null,
  }
})

console.log('[홈]')
ok(h.title.includes('pic'), '타이틀', h.title)
ok(h.posts > 0, '공개 기록 노출', `${h.posts}건`)
ok(h.manifest === '/manifest.webmanifest', 'manifest 링크', h.manifest)
ok(!!h.appleIcon, 'apple-touch-icon', h.appleIcon)
ok(!h.legacyCapable, '레거시 apple-mobile-web-app-capable 없음')
ok(h.topInset === '0px', '데스크탑에서 상단 여유분 0', h.topInset)
ok(h.footerGithub, '푸터 깃허브 링크')
ok(!h.overflowX, '가로 넘침 없음')

// ── 자산이 실제로 200 인가 (링크만 있고 404 인 경우를 잡는다)
for (const path of ['/manifest.webmanifest', '/icons/apple-touch-icon.png', '/icons/icon-512.png']) {
  const r = await home.evaluate(async (p) => (await fetch(p)).status, path)
  ok(r === 200, `자산 ${path}`, String(r))
}

// ── 기록 상세
if (h.firstPost) {
  const post = await openTab(BASE + h.firstPost)
  const d = await post.evaluate(() => ({
    points: document.querySelectorAll('.rail li, .rail [role=listitem]').length,
    map: !!document.querySelector('.mapboxgl-canvas'),
    overflowX: document.documentElement.scrollWidth > innerWidth,
  }))
  console.log('[기록 상세] ' + h.firstPost)
  ok(d.points > 0, '포인트 목록', `${d.points}개`)
  ok(d.map, '지도 캔버스')
  ok(!d.overflowX, '가로 넘침 없음')
}

// ── 편집은 잠겨 있어야 한다
const editor = await openTab(BASE + '/editor')
const locked = await editor.evaluate(() => !!document.querySelector('input[type=password]'))
console.log('[편집 게이트]')
ok(locked, '비밀번호로 잠김')

console.log(fails.length ? `\n실패 ${fails.length}건: ${fails.join(', ')}` : '\n전부 통과')
