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

        /*
         * 링크를 보냈을 때 뜨는 카드. 없으면 메신저·슬랙이 주소만 그대로 보여준다.
         * 기록 상세는 자기 커버 사진으로 이걸 덮어쓴다 (app/pages/p/[slug].vue).
         *
         * 🔴 og:image 는 «절대 URL» 이어야 한다. 크롤러는 페이지의 출처를 모르므로
         *    /icons/... 같은 상대 경로를 못 받는다. 기본값은 배포 주소로 박고,
         *    상세 화면은 useRequestURL() 로 실제 출처를 붙인다.
         */
        { property: 'og:site_name', content: 'pic·blog' },
        { property: 'og:type', content: 'website' },
        { property: 'og:locale', content: 'ko_KR' },
        { property: 'og:title', content: 'pic·blog — 사진 좌표 기반 여행 로그' },
        { property: 'og:description', content: '사진의 GPS 로 지도 위에 동선을 그립니다.' },
        { property: 'og:image', content: 'https://pic-blog.jun-devlog.win/icons/icon-512.png' },
        { name: 'twitter:card', content: 'summary_large_image' },
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
    session: {
      name: 'pic-blog-session',
      password: '',
      /*
       * 🔴 이 값이 없으면 쿠키에 Expires 가 안 붙어 «브라우저 세션 쿠키»가 된다.
       *    봉인 자체는 ttl 0(무기한)이라 서버는 멀쩡하다고 보는 토큰을 브라우저가
       *    버리고 있었다 — 폰에서 홈화면 앱이 메모리에서 내려갈 때마다 재로그인.
       *
       * h3 는 이 값 하나로 쿠키 Expires 와 봉인 ttl 을 «둘 다» 건다. 만료는 로그인
       * 시각(session.createdAt) 기준 «절대» 시각이고 갱신이 없다 — 쓰는 중이어도
       * 30일 뒤에 한 번 끊긴다. 쓰기 경로의 유일한 인증이라 무기한으로 두지 않는다.
       */
      maxAge: 60 * 60 * 24 * 30,
      cookie: {
        /*
         * 🔴 개발일 때만 Secure 를 푼다. 운영은 반드시 켜져 있어야 한다 —
         *    이 쿠키가 쓰기 경로의 유일한 인증이다.
         *
         * h3 의 useSession 기본값이 secure: true 인데, Secure 쿠키는 «신뢰 출처»에만
         * 저장된다. http://localhost 는 신뢰 출처로 쳐주지만 http://192.168.x.x 는
         * 아니라서, 폰에서 개발 서버(--host 0.0.0.0)에 붙으면 로그인이 200 으로
         * 성공해도 브라우저가 쿠키를 버린다 — 곧바로 잠금 화면으로 되돌아온다.
         * 네이티브 껍데기를 실기에서 확인하려면 그 경로가 열려 있어야 한다.
         *
         * 값은 «빌드 시점»에 굳는다. nuxt build 는 NODE_ENV=production 이므로
         * 배포되는 이미지에는 언제나 true 가 들어간다.
         */
        secure: process.env.NODE_ENV === 'production',
      },
    },
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
