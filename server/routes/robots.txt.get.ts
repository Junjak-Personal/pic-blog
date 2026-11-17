import { absoluteSiteUrl } from '#shared/utils/seo'

export default defineEventHandler((event) => {
  const { siteUrl } = useRuntimeConfig(event).public
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  // noindex 를 읽을 수 있도록 크롤링은 열고, 검색 제외는 페이지와 HTTP 헤더로 지정한다.
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteSiteUrl('/sitemap.xml', siteUrl)}\n`
})
