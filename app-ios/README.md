# pic·blog 껍데기 (iOS)

웹앱(`pic-blog`)을 WKWebView 로 감싼 것뿐이다. 화면은 전부 웹이고, 이 앱이 하는 일은
사진첩에서 원본을 꺼내 웹에 넘기는 브리지 하나다. 설계 배경은
`_docs/complete/native-shell/` 에 있다.

## 두 벌이 나란히 산다

| | 번들 id | 홈 화면 이름 | 바라보는 곳 |
|---|---|---|---|
| 운영 | `win.jundevlog.picblog` | pic-blog | `https://pic-blog.jun-devlog.win` |
| 개발 | `win.jundevlog.picblog.dev` | pic-blog dev | 맥의 dev 서버 |

**웹만 고쳤다면 껍데기를 다시 만들 필요가 없다** — 웹을 배포하면 앱이 다음에 열 때
받아간다. 다시 빌드해야 하는 것은 브리지 계약(`window.picblogNative` 의 인자·반환 «모양»),
Dart/Swift, 아이콘·스플래시, 대상 URL 이 바뀔 때뿐이다.

## 개발용 설치

키보드처럼 «기기에서만» 재현되는 문제를 운영 배포 왕복 없이 보려고 둔 것이다.

```bash
pnpm dev --host 0.0.0.0      # 맥에서 먼저 (레포 루트)
app-ios/tool/dev-install.sh  # 폰에 설치
```

스크립트가 대상 서버 응답·기기·번들 안의 URL 을 먼저 확인하고 설치한다. 기본값은
`PORT` · `HOST` · `SITE` · `BUNDLE_ID` · `APP_NAME` · `DEVICE` 환경변수로 바꾼다.

맥을 `.local` 이름으로 부르는 이유는 `Info.plist` 의 `NSAllowsLocalNetworking` 이 정확히
그 경우만 열어주기 때문이다 — `192.168.x.x` 같은 사설 IP 는 그 예외에 들지 않는다.

## 운영 빌드

```bash
flutter build ios --release   # SITE 기본값이 운영 URL 이다 (lib/main.dart)
```
