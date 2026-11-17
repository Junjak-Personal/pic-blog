import { expect, test } from '@playwright/test'
import type { PostSummary } from '../../shared/types/db.ts'
import { absoluteSiteUrl, postDescription, PUBLIC_ROBOTS, SITE_DESCRIPTION, SITE_TITLE } from '../../shared/utils/seo.ts'
import { EDITOR_PASSWORD, photoPath, SEED } from './seed-data.ts'

const SITE_URL = 'https://pic-blog.jun-devlog.win'
const canonicalTag = (path: string) => `<link rel="canonical" href="${absoluteSiteUrl(path, SITE_URL)}">`

test.describe('검색엔진이 받는 최초 HTML 과 사이트맵', () => {
  test('홈에 설명·대표 URL·사이트 구조와 실제 공개 글 링크가 실린다', async ({ request }) => {
    const response = await request.get('/?utm_source=seo-test', { headers: { 'X-Forwarded-Host': 'untrusted.example' } })
    expect(response.status()).toBe(200)
    const html = await response.text()
    expect(html).toContain(`<title>${SITE_TITLE}</title>`)
    expect(html).toContain(`<meta name="description" content="${SITE_DESCRIPTION}">`)
    expect(html).toContain(canonicalTag('/'))
    expect(html).toContain(`<meta name="robots" content="${PUBLIC_ROBOTS}">`)
    expect(html).toContain('"@type":"WebSite"')
    expect(html).toContain(`<a href="/p/${SEED.public.slug}"`)
    expect(html).not.toContain(`/p/${SEED.private.slug}`)
    expect(html.match(/rel="canonical"/g)).toHaveLength(1)
    expect(html.match(/<h1\b/g)).toHaveLength(1)
  })

  test('공개 글은 고유 설명·공유 이미지·구조화 데이터를 서버에서 렌더링한다', async ({ request }) => {
    const posts = await (await request.get('/api/posts')).json() as PostSummary[]
    const post = posts.find((item) => item.slug === SEED.public.slug)!
    const response = await request.get(`/p/${post.slug}?utm_source=seo-test`)
    expect(response.status()).toBe(200)
    const html = await response.text()
    const description = postDescription(post)
    expect(html).toContain(`<title>${post.title} · pic·blog</title>`)
    expect(html).toContain(`<meta name="description" content="${description}">`)
    expect(html).toContain(`<meta name="twitter:description" content="${description}">`)
    expect(html).toContain(canonicalTag(`/p/${post.slug}`))
    expect(html).toContain(`<meta property="og:image" content="${absoluteSiteUrl(photoPath(SEED.public, 'display'), SITE_URL)}">`)
    expect(html).toContain('"@type":"BlogPosting"')
    expect(html).toContain(`"dateCreated":"${post.created_at}"`)
    expect(html.match(/name="robots"/g)).toHaveLength(1)
    expect(html).toContain(`<meta name="robots" content="${PUBLIC_ROBOTS}">`)
  })

  test('비공개·없는 글은 검색에서 제외하고 실제 403·404 로 응답한다', async ({ request }) => {
    for (const [slug, status] of [[SEED.private.slug, 403], ['seo-missing-record', 404]] as const) {
      const response = await request.get(`/p/${slug}`)
      expect(response.status()).toBe(status)
      const html = await response.text()
      expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
      expect(html).not.toContain('application/ld+json')
      expect(html).not.toContain('rel="canonical"')
      expect(html).not.toContain(photoPath(SEED.private, 'display'))
    }
  })

  test('편집·인증 화면과 API 에 검색 제외 HTTP 헤더가 붙는다', async ({ request }) => {
    for (const path of ['/editor', '/editor/new', '/oauth/consent', '/api/posts']) {
      const response = await request.get(path)
      expect(response.headers()['x-robots-tag']).toBe('noindex, nofollow')
      if (!path.startsWith('/api/')) {
        expect(await response.text()).toContain('<meta name="robots" content="noindex, nofollow">')
      }
    }
  })

  test('로그인해도 사이트맵과 비공개 글의 검색·공유 정보에 비공개 기록을 싣지 않는다', async ({ request }) => {
    const login = await request.post('/api/auth/login', { data: { password: EDITOR_PASSWORD } })
    expect(login.ok()).toBe(true)
    const posts = await (await request.get('/api/posts')).json() as PostSummary[]
    expect(posts.some((post) => post.slug === SEED.private.slug)).toBe(true)

    const robots = await request.get('/robots.txt')
    expect(robots.status()).toBe(200)
    expect(await robots.text()).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
    expect(await robots.text()).not.toContain('Disallow: /editor')

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()['content-type']).toContain('application/xml')
    expect(sitemap.headers()['cache-control']).toBe('no-store')
    const xml = await sitemap.text()
    expect(xml).toContain(`<loc>${SITE_URL}/</loc>`)
    expect(xml).toContain(`<loc>${SITE_URL}/p/${SEED.public.slug}</loc>`)
    expect(xml).toContain(`<image:loc>${absoluteSiteUrl(photoPath(SEED.public, 'display'), SITE_URL)}</image:loc>`)
    expect(xml.match(/<url>/g)).toHaveLength(2)
    for (const post of [SEED.private, SEED.editable, SEED.days]) expect(xml).not.toContain(post.slug)

    const privatePage = await request.get(`/p/${SEED.private.slug}`)
    expect(privatePage.status()).toBe(200)
    const html = await privatePage.text()
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">')
    expect(html).not.toContain('application/ld+json')
    expect(html).not.toContain(`<meta property="og:title" content="${SEED.private.title}">`)
    expect(html).not.toContain(`<meta property="og:image" content="${absoluteSiteUrl(photoPath(SEED.private, 'display'), SITE_URL)}">`)
  })
})
