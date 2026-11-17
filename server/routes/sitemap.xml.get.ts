import { absoluteSiteUrl } from '#shared/utils/seo'

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export default defineEventHandler((event) => {
  const { siteUrl } = useRuntimeConfig(event).public
  // 세션과 관계없이 공개 기록만 읽는다. 비공개로 바꾼 기록이 공유 캐시에 남는 것도 막는다.
  const posts = listPosts(false)
  const urls = posts.map((post) => {
    const location = escapeXml(absoluteSiteUrl(`/p/${encodeURIComponent(post.slug)}`, siteUrl))
    // 사진 삭제는 post.updated_at 을 갱신하지 않으므로 부정확한 lastmod 는 내보내지 않는다.
    const cover = post.cover_display ?? post.cover_thumb
    const image = cover ? `<image:image><image:loc>${escapeXml(absoluteSiteUrl(cover, siteUrl))}</image:loc></image:image>` : ''
    return `<url><loc>${location}</loc>${image}</url>`
  })

  setHeaders(event, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    `<url><loc>${escapeXml(absoluteSiteUrl('/', siteUrl))}</loc></url>`,
    ...urls,
    '</urlset>',
  ].join('\n')
})
