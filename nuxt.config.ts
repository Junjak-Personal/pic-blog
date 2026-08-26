export default defineNuxtConfig({
  compatibilityDate: '2026-08-26',
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils', 'reka-ui/nuxt'],
  css: ['~/assets/css/tokens.css', '~/assets/css/base.css', '~/assets/css/map.css', '~/assets/css/menu.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      link: [
        { rel: 'manifest', href: '/manifest.webmanifest' },
        // iOS 는 manifest 의 icons 를 홈 화면에 쓰지 않는다 — apple-touch-icon 이 따로 필요하다
        { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png', sizes: '180x180' },
        { rel: 'icon', href: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
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
      meta: [
        { name: 'theme-color', content: '#040408' },
        // viewport-fit=cover 가 없으면 env(safe-area-inset-*) 가 전부 0 이라
        // 하단 CTA 가 홈 인디케이터에 깔린다 (BottomCta.vue 참고)
        // user-scalable=no 는 Safari 브라우저에서는 접근성 때문에 무시되고(정상),
        // 홈 화면에 추가한 standalone 모드에서만 먹는다 — 앱처럼 쓸 때만 확대가 잠긴다.
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no' },
        // iOS 는 아직 manifest 의 display 만으로는 부족한 버전이 있어 레거시 키를 같이 둔다
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-title', content: 'pic·blog' },
        // black-translucent 는 콘텐츠가 상태바 밑으로 들어가 상단바가 겹친다 — black 으로 둔다
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black' },
        { name: 'mobile-web-app-capable', content: 'yes' },
      ],
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
