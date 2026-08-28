---
title: pic-blog 디자인 레퍼런스 — 아트보드에서 가져온 값과 규칙
status: reference
topic: design-system
kind: spec
scope: frontend
created: 2026-08-26
updated: 2026-08-29
owner: jhyoon
related:
  - _docs/reference/product-spec/2026-08-25-product-spec.md
---
# 디자인 레퍼런스

아트보드 원본(`_workspace/deisgn/`)은 **추적하지 않는다** — 11MB짜리 캔버스 산출물이라
레포에 넣을 이유가 없다. 대신 구현이 실제로 가져간 값과 규칙만 여기에 남긴다.
값의 SSOT 는 언제나 아래 「사는 곳」의 코드다. 이 문서는 지도지 원본이 아니다.

원본 위치(로컬):
- `_workspace/deisgn/pic-blog 화면.dc.html` — 아트보드 1b~1g
- `_workspace/deisgn/data.js` — 클러스터링 알고리즘 원본
- `_workspace/deisgn/pic-map.js` — 지도 렌더 원본 (Leaflet)
- `_docs/reference/product-spec/2026-08-25-product-spec.md` — 설계 SSOT (추적함)

충돌 시 우선순위: **정보 구조·알고리즘·제약 → 설계문서 / 레이아웃·비주얼·인터랙션 → 아트보드**

---

## 1. 이식하지 않은 것

| 원본 | 이유 |
|---|---|
| `support.js` | Claude Design 캔버스 런타임. 읽지도 이식하지도 않는다. |
| `{{ }}` · `data-dc-*` | 캔버스 템플릿 문법. Vue 로 다시 쓴다. |
| Leaflet 지도 코드 | 구현은 Mapbox GL JS v3. 비주얼 의도만 가져오고 코드는 새로 썼다. |

🔴 Leaflet 은 `[lat, lng]`, Mapbox 는 `[lng, lat]`. 순서를 틀리면 지구 반대편에 찍히는데
에러가 안 난다. 지도로 나가는 좌표는 전부 `shared/utils/geo.ts` 의 `toLngLat()` 를 지난다.

---

## 2. 알고리즘 — `data.js` → `shared/utils/cluster.ts`

두 함수를 비트 단위로 이식했고 네 반경 전부에서 개수·장수·퍼짐·갭·중심이 원본과 일치함을 확인했다.

| 값 | 사는 곳 |
|---|---|
| `GAP_MINUTES = 90` | `shared/utils/cluster.ts` |
| `RADII = [20, 50, 100, 200]` | 〃 |
| `DEFAULT_RADIUS = 50` | 〃 |

- `clusterAt(R)` — 최초 업로드. 스트리밍하며 합류할 때마다 중심을 갱신한다.
- `assignTo(R)` — 사진 추가(1f). **기존 중심은 불변**이고 반경 밖 사진끼리만 다시 묶는다.

포인트 앵커는 생성 후 움직이지 않는다(설계문서 §4.2). 병합·분할 UI 는 없고 업로드 반경으로만 갈린다.

회귀 검사: `node --experimental-strip-types shared/utils/__checks.ts`

## 3. 산포 — `shared/utils/scatter.ts`

시드 LCG → 지터 격자 → 타원 완화 6패스. **`Math.random()` 금지** — 같은 포인트는 항상 같은 배치여야 한다.

| 값 | 사는 곳 |
|---|---|
| `FIELD_DESKTOP = { w: 716, h: 632 }` | `shared/utils/scatter.ts` |
| `FIELD_MOBILE = { w: 390, h: 430 }` | 〃 |

## 4. 팔레트 · 타이포 (아트보드 1d)

전부 `app/assets/css/tokens.css` 에 CSS 변수로 있다. 다크 단일 테마이고 라이트 테마는 없다.

주의 두 가지:
- `--font-display` 의 Bricolage Grotesque 에는 **한글 글리프가 없다.** 한글은 Pretendard 로
  떨어뜨린다 — 플랫폼마다 다른 `system-ui` 대신 디자인된 얼굴을 쓰려고 명시했다.
- `--route`(#FFB454)는 **팔레트 밖 난색이다.** 아트보드는 동선을 `--acc`(세이지)로 그렸지만
  마커 테두리와 같은 색이라 구분이 안 됐다. SSOT 는 `app/utils/route-style.ts`.

## 5. 지도 (아트보드 1b·1g → Mapbox v3)

| 의도 | 구현 |
|---|---|
| 번호 마커가 라벨 위에 | `mapboxgl.Marker(element)` — DOM 오버레이라 항상 모든 레이어 위 |
| 촬영 시각 순 파선 동선 | GeoJSON `LineString` + `line` 2장 (글로우 + 본선), `app/utils/route-style.ts` |
| 축소 시 번호 접기 | `DOT_ZOOM = 11`, 활성 마커는 축소돼도 번호 유지 |

🔴 커스텀 스타일이 `mapbox/standard` + night 프리셋이다. 나중에 추가한 레이어에
**`*-emissive-strength: 1`** 을 주지 않으면 야간 앰비언트에 눌려 `line-color`/`circle-color` 에
무슨 색을 넣든 거의 검게 깔린다. 동선·사진 점·공백선 전부 지정해뒀다.

v3 는 낮은 줌에서 지구본으로 바뀌므로 `projection: 'mercator'` 로 고정한다.

## 6. 이미지 파이프라인 (설계문서 §5.3)

| 값 | 사는 곳 |
|---|---|
| `DISPLAY_MAX = 2048` · `THUMB_MAX = 400` | `app/utils/resize.ts` |

- 원본은 보관하지 않는다.
- 🔴 `createImageBitmap(file, { imageOrientation: 'from-image' })` — 이 옵션이 없으면
  canvas 가 EXIF Orientation 을 무시해서 아이폰 세로 사진이 전부 눕는다.
- 출력 포맷은 `outputExt()` 가 브라우저당 한 번 판정한다. **iOS Safari 는 canvas WebP
  인코딩을 지원하지 않아**(MDN BCD `api.HTMLCanvasElement.toBlob.type_parameter_webp`:
  safari/safari_ios `false`) 아이폰 업로드는 JPEG 로 떨어진다. 사진마다 갈리면
  `.webp` 로 이름 붙은 jpeg 이 나오고 서버가 확장자로 content-type 을 정하므로 깨진다.

## 7. UI 규칙 (전역 규칙과 아트보드의 교집합)

- 모든 버튼은 배경이나 테두리를 갖는다. 텍스트만 있는 버튼은 금지 — 아이콘 전용 ghost 만 예외.
- 모바일(≤900px)에서 부가 동작은 `OverflowMenu.vue`(Reka `DropdownMenu`)로 접는다.
  주 동작 하나만 남긴다. 컴포넌트가 표시 분기를 직접 갖는다 — `DropdownMenuRoot` 가
  렌더리스라 밖에서 준 class 는 루트에 안 붙고 버려진다.
- 터치 타깃 44px.
- 검색은 Enter·버튼으로만 실행한다(타이핑마다 아님).
