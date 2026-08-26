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
        { name: 'viewport', content: 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-title', content: 'pic·blog' },
        /*
         * apple-mobile-web-app-capable 은 넣지 않는다 — 폐기된 메타이고
         * standalone 은 manifest 의 display 가 담당한다.
         *
         * ⚠ 한때 이 메타를 「상단바가 흐려 보이는 원인」으로 지목했는데 틀렸다.
         *   실제 원인은 iOS 의 투명도 설정이었다 (README 의 「iOS PWA 상단 흐림」).
         *   제거는 여전히 옳지만 그건 별개 이유다.
         */
        { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
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
      /*
       * 빌드마다 바뀌는 표식. 실행 중인 앱이 자기 값과 서버의 값을 비교해
       * 새 배포를 알아챈다 (app/composables/useAppUpdate.ts).
       * 서비스워커를 쓰지 않으므로 오프라인 캐시가 낡을 일은 없다 —
       * 낡는 건 「이미 열려 있는 페이지」뿐이고, 그건 새로고침으로 끝난다.
       */
      buildId: process.env.NUXT_PUBLIC_BUILD_ID || Date.now().toString(36),
      mapboxToken: '',
      mapboxStyle: 'mapbox://styles/mapbox/dark-v11',
    },
  },
  // Mapbox 토큰 URL 제한이 http://localhost:4600 이다 — 127.0.0.1 로 붙으면 Referer 가 안 맞아 타일이 403 난다
  devServer: { port: 4600, host: 'localhost' },
  typescript: { strict: true, typeCheck: false },
})
