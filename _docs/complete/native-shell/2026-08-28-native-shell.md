---
title: 네이티브 껍데기 — 업로드 경로만 가져간다
status: complete
topic: native-shell
kind: findings
scope: fullstack
created: 2026-08-28
updated: 2026-08-29
owner: jhyoon
related:
  - _docs/reference/product-spec/2026-08-25-product-spec.md
---
# 네이티브 껍데기 — 업로드 경로만 가져간다

작성 2026-08-28. 웹 커밋 `0e427b4` 기준.

## 왜

아이폰에서 200장을 올리면 사진첩 화면에서 60초 넘게 조용하다. 실측으로 그 정체가 확정됐다.

| 장수 | 갤러리 대기 | 입력 | 처리량 | 우리 변환 |
|---|---|---|---|---|
| 1 | 3.5 s | 2.7 MB | 0.8 MB/s | 199 ms |
| 10 | 13.3 s | 50.9 MB | 3.8 MB/s | 204 ms |
| 200 | 91.6 s | 951.8 MB | 10.4 MB/s | 197 ms |

200장의 91.6초 중 **사람이 고른 시간이 30초**(본인 계측). 나머지 61.6초 / 951.8 MB =
**15.4 MB/s · 장당 308 ms**. 아이폰 NVMe 는 수백 MB/s 이므로 복사가 아니다 —
**HEIC → JPEG 변환**이다. 원본 2.75 MB 가 4.76 MB JPEG 으로 부풀어서 온다.

### 200장 예산 (측정 기반, 서버 전송 제외)

```
고르기(사람)   30 s
iOS 변환       62 s   ← 이걸 없애러 간다
검사          0.2 s
우리 변환      39 s
──────────────────
합계         ~131 s
```

## 기각된 대안

| | 근거 |
|---|---|
| `accept` 를 HEIC 로 열기 | 실측 기각. `image/*` · HEIC 명시 · accept 없음 셋 다 `image/jpeg` 로 왔다 |
| 카메라 포맷 「높은 호환성」 | 보관 포맷을 포기해야 함 — 본인 거부 |
| Flutter 웹뷰만 씌우기 | `webview_flutter_wkwebview` = WKWebView 그 자체. 개선 0 |
| 리사이즈를 대기 시간에 겹치기 | 200장이면 결과 212 MB 를 들고 있어야 함. 107 MB 로 탭이 죽은 전례가 있다 |
| 바이트를 base64 로 브리지 통과 | 200장 문자열 복사만 20~40초. 아끼려는 50초를 도로 씀 |

## 되는 것 — 실측으로 확인 (iOS 시뮬레이터 · 진짜 Safari)

```
UA: (iPhone; CPU iPhone OS 18_7 …) AppleWebKit/605.1.15 Version/26.5 Safari/604.1
IMG_4450.heic  2,752,805 bytes  5712×4284

exifr.gps          OK  38.36780, 141.06978
createImageBitmap  OK  5712×4284           (imageOrientation: 'from-image')
resize 2048        OK  2048×1536 → 869 KB
webp encode        NO                       ← MDN BCD 와 일치. 아이폰 출력은 항상 JPEG
```

대조군 데스크탑 크롬은 같은 파일에서 `InvalidStateError — The source image could not be
decoded`. **HEIC 디코딩은 WebKit 만 된다** — 웹 단독으로는 못 쓰고, 네이티브 껍데기 안에서만 쓴다.

## 구조 — 로직 중복 0

```
Flutter : 사진 고르기 + 원본 HEIC 를 127.0.0.1 로 노출 (Range 지원)   ← 네이티브는 이게 전부
페이지  : exifr · createImageBitmap · 리사이즈 · 클러스터 · 업로드
          지금 코드 그대로. EXIF 도 photoKey 도 한 벌로 남는다.
```

🔴 **바이트를 페이지로 «옮기면» 안 된다.** `<input type=file>` 이 주는 File 은 디스크 백업이라
200장을 들고 있어도 RAM 을 안 쓴다. `fetch().blob()` 으로 만들면 550 MB 가 메모리에 뜬다.
URL 만 넘기고 필요한 시점에만 읽는다:

- **검사** — exifr 에 URL 을 그대로 준다. exifr 가 Range 로 헤더만 읽는다.
- **업로드** — 루프 안에서 한 장씩 전체를 받아 리사이즈 → PUT → 버린다 (지금과 같다).

웹쪽 변경은 `ScannedPhoto.file: File` → `File | string`, `resizePhoto` 가 문자열이면 먼저
fetch. 그 외는 그대로다.

## 1라운드 결과 — 실기 (iPhone 15 Pro · iOS 27.0)

**핵심은 확인됐다.** 넘어온 첫 장이 `IMG_1422.HEIC` · `IMG_5429.HEIC` — 원본 HEIC 다.
iOS 변환이 실제로 사라졌고, 고른 직후 바로 앱 화면으로 돌아온다.
GPS 는 200/200 · 170/172 로 전부 헤더 256KB 에서 읽혔다.

| | 200장 · 24MP | 200장 · 48MP |
|---|---|---|
| pick (사람 + PhotoKit) | 26~53 s | — |
| 검사 (브리지 + exifr) | 4.2 s | 4.2 s |
| 변환 장당 | 391 ms | 847 ms |
| 변환 200장 | 78.2 s | 169.3 s |

변환 장당 391ms 의 내역: **브리지 208 + 디코딩 140 + 캔버스 44**.

### 🔴 그런데 지금은 거의 본전이다

```
                     웹 경로        껍데기 1라운드
iOS 변환             61.6 s         0
검사                  0.2 s         4.2 s
우리 변환            39.4 s        78.2 s   ← 두 배
────────────────────────────────────────
기계 시간           ~101 s        ~90~105 s
```

**iOS 변환 62초를 없앴는데 브리지가 42초를 도로 먹었다.** 시뮬레이터 벤치(2.75MB 왕복
75ms)를 실기 추정에 쓴 것이 잘못이었다 — 실기는 3.71MB 에 208ms 다 (56 ms/MB).

HEIC 디코딩 140ms 는 예전 JPEG 경로(디코딩+캔버스 197ms)와 사실상 같다. 즉 HEIC 를
직접 디코딩하는 것 자체는 비용이 아니었다. 비용은 «바이트를 브리지로 옮기는 것»이다.

## 2라운드 — PhotoKit 에 렌더를 시킨다 (확정)

브리지 비용이 바이트에 비례하므로, 원본을 통째로 넘기지 않고 PhotoKit 에 **2048px 로
그려 달라고** 하면 브리지·디코딩·캔버스가 한꺼번에 무너진다. 실기 실측:

| 같은 사진(48MP · 8064×6048) | 렌더 전 | 렌더 후 |
|---|---|---|
| 브리지 | 257 ms | 100 ms |
| 디코딩 | 213 ms | 15 ms |
| 캔버스 | 49 ms | 31 ms |
| **장당** | **519 ms** | **147 ms** |
| 200장 | 103.9 s | 29.4 s |

원본이 24MP 든 48MP 든 결과가 같아진다 — 렌더 결과의 크기가 같으므로.

🔴 **크기는 웹이 지시한다.** `readBlob(token, { render: DISPLAY_MAX })` 로 넘긴다. 앱이 자기
상수를 갖는 순간 「화면 크기」가 두 곳에 생기고, 한쪽만 바뀌는 날이 온다.

### 200장 예산 (실기)

```
                     웹 경로        껍데기(렌더 후)
고르기(사람)+PhotoKit  30 + 62 s      26.1 s
검사                    0.2 s          3.2 s
변환                   39.4 s         29.4 s
──────────────────────────────────────
                     ~131 s          ~59 s
```

## 피커를 두 번 갈아엎었다가 되돌아왔다

이 절이 이 문서의 핵심이다. **같은 길로 다시 가지 않기 위해** 남긴다.
코드에는 `app-ios/lib/picker_theme.dart` 머리에 이 문서로 가는 짧은 표지만 둔다.

### ① iOS 기본 피커(PHPickerViewController) — 되돌아옴

동기: Flutter 로 그린 피커가 앱의 나머지와 따로 놀아 「좀 어색하다」는 지적.

**끌어서 여러 장 선택이 없다.** SDK 헤더를 직접 확인했다 —
`$(xcrun --sdk iphoneos --show-sdk-path)/System/Library/Frameworks/PhotosUI.framework/Headers/PHPicker.h`
에 drag/pan/select-all 관련 API 가 **하나도 없다**. 시스템 UI 가 별도 프로세스에서 도니
제스처를 얹을 수도 없다. 수백 장을 하나씩 탭하게 만드는 건 이 앱의 용도에 맞지 않는다.

부수 확인: PHPicker 로도 «원본»에는 닿을 수 있다 — `PHPickerConfiguration(photoLibrary:)`
로 만들면 결과에 `assetIdentifier` 가 실리고, 그걸 PhotoKit 으로 되짚으면 된다.
itemProvider 에서 이미지를 꺼내면 그게 바로 우리가 없애려던 그 변환이다.

### ② 그리드를 웹뷰에서 직접 그리기 — 되돌아옴

동기: 앨범이 좁은 드롭다운이라 한눈에 안 들어온다. 웹에서 그리면 `tokens.css` 를 그대로
쓰니 어색할 수가 없고 앨범을 별도 페이지로 만들 수 있다.

**사진첩이 1만 장인 기기에서 스케일이 맞지 않는다.** 스크롤에 맞춰 썸네일을 브리지로
날라야 하는데, 시스템이 이미 갖고 있는 썸네일을 JPEG 으로 다시 뽑아 base64 로 옮기는
셈이다. 동시 요청이 겹치면서 그림이 찢어졌다(한 칸 안에 여러 사진의 가로 줄).
잠금으로 경쟁 자체는 막을 수 있었지만 구조가 틀렸다.

> **브리지를 건너야 하는 것은 「고른 200장」이지 「보유한 1만 장」이 아니다.**

### 남은 아쉬움은 판을 엎지 않고 해결했다

`wechat_assets_picker` 의 `DefaultAssetPickerBuilderDelegate` 를 상속해
`pathEntityListWidget` **한 메서드만** 오버라이드하고 `pickAssetsWithDelegate` 로 넘긴다
(`app-ios/lib/album_grid.dart`). 사진 그리드·끌어서 선택·미리보기는 원래 것 그대로다.

- 앨범 커버는 provider 가 이미 뽑아 둔 것을 쓴다(`pathThumbnailSize` 400px). 새로 요청하면
  앨범 수만큼 PhotoKit 을 또 두드린다 — ②가 무너진 그 이유다.
- Recents 를 맨 앞에 고정하고 나머지는 생성 역순. 여행 기록은 방금 만든 앨범을 쓰는 일이
  대부분이라 이름순이면 매번 끝까지 굴려야 했다.
- 🔴 닫혔을 때는 자리를 통째로 비운다. 크기 0 으로 접어두면 투명한 판이 남아 사진
  그리드의 탭·드래그를 먹는다.
- 🔴 테두리는 이미지 «위에» 그린다. `Container` 의 border + clipBehavior 로 하면 자식이
  바깥 둥근 사각으로 잘려 이미지 가장자리가 테두리의 안티에일리어싱을 뚫고 나온다.

## 브리지 계약 — 버전은 언제든 어긋난다

🔴 **껍데기는 기기에 설치돼 있고 웹은 따로 배포된다.** 앱을 안 지웠거나 웹만 배포했으면
둘의 버전이 다르다. 그래서 **브리지 함수의 반환 「모양」은 바꾸지 않는다.**

실제로 한 번 깨졌다: `pick` 의 반환을 배열에서 `{ photos, failed }` 로 바꾸고 앱만 새로
설치했더니, 옛 웹이 `photos.map()` 을 부르며 죽어 「사진을 가져오는 중 400/400」에서
멈췄다. 진행률이 N/N 까지 갔다가 멈추고 20장에서도 똑같았던 것이 «규모가 아니라 계약»
문제임을 말해 줬다.

새 정보는 **따로 난 창**으로 준다 — `picblogNative.lastPickFailed` 처럼. 모르는 쪽은
그냥 안 읽는다.

## 조용히 실패하지 않기 (설계문서 §8)

- `originFile` 이 실패하면 이름을 모아 「원본을 열지 못함」으로 제외 목록에 올린다.
  원본은 앱 캐시로 통째로 복사되므로 360장이면 2GB 다 — 공간 부족이 실재한다.
- 헤더에서 EXIF 를 못 찾았다고 「위치 정보 없음」이라 단정하지 않는다. 껍데기는 원본의
  앞부분만 받는데 EXIF 위치는 카메라마다 다르다. 단정 전에 전체를 한 번 더 읽는다.
- 웹 콘텐츠 프로세스가 죽으면 다시 세운다. WKWebView 는 그 경우 빈 화면을 그대로 두는데
  우리 배경이 어두워서 「검은 화면에서 안 바뀐다」로 보이고 아무도 아무 말을 하지 않는다.
  (`onWebResourceError` 의 `errorType == webContentProcessTerminated`)

## 값의 근거

| 값 | 어디 | 왜 |
|---|---|---|
| `kHeaderBytes` 128KB | `bridge.dart` | 이 값이 곧 **JS 소스 파싱량**이다 — 답이 `runJavaScript` 로 가므로 base64 가 그대로 자바스크립트 문장이 된다. 256KB 면 한 장에 약 700KB, 360장이면 250MB. 실측으로 64KB 면 EXIF 가 다 나오므로 2배 여유만 남겼다 |
| `MAX_PER_SELECTION` 500 | `app/utils/exif.ts` | 예전 근거(「조용한 구간을 짧게」)는 틀렸다 — 상한은 파일이 «도착한 뒤에» 자르므로 그 구간을 못 줄인다. 브라우저 경로에서 200장을 고르면 iOS 가 200장을 다 변환한 다음 넘기고 우리가 150장을 버렸다 |
| `isIdleTimerDisabled` | `AppDelegate.swift` | 취향이 아니라 중단 위험. 업로드가 몇 분씩 걸리는데 화면이 꺼지면 iOS 가 앱을 재워 전송이 멈춘다 |
| 세션 쿠키 `secure` 개발 해제 | `nuxt.config.ts` | h3 기본값이 `true` 인데 Secure 쿠키는 신뢰 출처에만 저장된다. 폰에서 개발 서버(`--host 0.0.0.0`)에 붙으면 로그인이 200 으로 성공해도 쿠키가 버려진다. 값은 빌드 시점에 굳고 `nuxt build` 는 `NODE_ENV=production` 이라 배포 이미지에는 언제나 `true` (산출물로 확인) |

## 실행 메모

- 실기: `flutter build ios --release` 뒤
  `xcrun devicectl device install app --device <UDID> build/ios/iphoneos/Runner.app`.
  `flutter run` 은 설치는 되는데 런처가 못 붙어 실패하는 일이 잦다 — 설치/실행을
  devicectl 로 나누는 편이 빠르고 확실하다.
- `--dart-define=SITE=<url>` 로 대상 전환. 없으면 운영을 본다.
- `flutter devices` 가 폰을 놓치면 `--device-timeout 30` (기본 스캔이 짧다).
  무선 연결에서는 설치가 자주 실패한다 — 유선으로 붙인다.
- 서명: 팀 `7D92AXK55P` · 번들 `win.jundevlog.picblog` · 자동 서명.
- 시뮬레이터(iPhone 17 Pro `68B53922-...`)는 **기능 확인 전용**이다. 하드웨어 미디어
  파이프라인이 없어 **시간 숫자는 쓰면 안 된다** — 실제로 한 번 그 숫자로 추정했다가 틀렸다.
