export default defineNuxtConfig({
  compatibilityDate: '2026-08-26',
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils', 'reka-ui/nuxt'],
  css: ['~/assets/css/tokens.css', '~/assets/css/base.css', '~/assets/css/map.css', '~/assets/css/menu.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,500;12..96,600;12..96,700&family=Geist+Mono:wght@400;500;600&display=swap',
        },
        // Pretendard is not on Google Fonts — jsdelivr CDN (design doc §11.3)
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
        },
        {
          rel: 'stylesheet',
          href: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp-dynamic-subset.min.css',
        },
      ],
      meta: [{ name: 'theme-color', content: '#040408' }],
    },
  },
  nitro: {
    // better-sqlite3 is a native addon — keep it external so Nitro does not try to bundle the .node
    externals: { inline: [], external: ['better-sqlite3'] },
  },
  runtimeConfig: {
    dataDir: './data',
    adminPasswordHash: '',
    session: { name: 'pic-blog-session', password: '' },
    public: {
      mapboxToken: '',
      mapboxStyle: 'mapbox://styles/mapbox/dark-v11',
    },
  },
  // Mapbox 토큰 URL 제한이 http://localhost:4600 이다 — 127.0.0.1 로 붙으면 Referer 가 안 맞아 타일이 403 난다
  devServer: { port: 4600, host: 'localhost' },
  typescript: { strict: true, typeCheck: false },
})
