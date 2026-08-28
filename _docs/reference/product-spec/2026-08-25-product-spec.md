---
title: pic-blog — 사진 좌표 기반 여행 로그
status: reference
topic: product-spec
kind: spec
scope: fullstack
created: 2026-08-25
updated: 2026-08-29
owner: jhyoon
related:
  - _docs/reference/design-system/2026-08-26-design-system.md
  - _docs/reference/deploy/2026-08-26-deploy.md
---
# pic-blog — 사진 좌표 기반 여행 로그

사진의 EXIF GPS로 지도에 포인트를 찍고, 포인트마다 글과 사진 갤러리를 붙이는 개인용 여행 로그.
**이 문서는 컨셉 설계만 담는다. 비주얼/레이아웃은 Claude Design 산출물이 SSOT다.**

---

## 1. 확정된 사실 (추정 아님, 실측)

### 1.1 EXIF 스파이크 (2026-08-25)

iPhone 15 Pro / iOS 18.7 / Safari 에서 `<input type="file">` 로 카메라 사진 선택:

| 항목 | 결과 |
|---|---|
| 파일명 / MIME | `IMG_2046.jpeg` / `image/jpeg` — **HEIC가 아님** |
| 크기 | 5.1 MB |
| GPS | `37.763847, 128.899886` ✅ |
| DateTimeOriginal | 2026-08-23 18:35:39 ✅ |
| Make / Model | Apple iPhone 15 Pro ✅ |

**→ iOS Safari가 파일 선택 시점에 HEIC를 JPEG으로 변환하면서 EXIF를 보존한다.**

결론 두 가지:
- **웹으로 간다.** 네이티브 앱이 필요한 유일한 이유가 사라졌다.
- **HEIC 원본은 받지도 않고 쓰지도 않는다.** 브라우저 파일 입력 경로에 HEIC 원본이 도착하지
  않으며, 설령 받아도 Chrome/Firefox는 `<img>`로 HEIC를 렌더하지 못해 어차피 변환해야 한다.
  → 서버에 libheif / sharp 를 설치할 이유가 없다.

### 1.2 배포 대상 실측 (junserver, 2026-08-25)

```
호스트   junserver (N100), Ubuntu, x86_64, user junja, pubkey-only sshd
LAN      192.168.0.40   (ssh alias: junserver / 집 밖에서는 junserver-ext)
디스크   98G 중 17G 사용, 77G 가용
점유 포트 127.0.0.1:8000 (nivoca-api prd), 127.0.0.1:7000 + 192.168.0.40:7000 (stg)
4600     비어 있음 ✅
cloudflared  active ✅
컨테이너 런타임  Docker (기존 서비스 전부 Docker)
```

관련 메모리: `[[n100-access-double-nat]]`, `[[deploy-topology]]`

---

## 2. 스택

| 층 | 선택 | 근거 |
|---|---|---|
| 앱 | **Nuxt 4 (latest) 단일 프로세스** — SSR + Nitro server routes | 개인 프로젝트에 FE/BE 두 컨테이너는 낭비. 한 언어·한 배포·한 로그 |
| DB | **SQLite 파일 1개** (`better-sqlite3`) | 단일 사용자, 쓰기는 여행 후 1회. 백업이 `cp pic-blog.db` 로 끝난다 |
| 사진 | **파일시스템 디렉토리**, Nitro가 static 서빙 | S3 호환 스토리지(MinIO)는 순수 오버헤드 |
| 이미지 처리 | **없음 (클라이언트 canvas)** | §5 참조. 서버는 바이트를 디스크에 쓰기만 한다 |
| 지도 | **Mapbox GL JS v3** | 벡터 타일이라 스타일링 자유 + MapLibre로 탈출 가능. §6 |
| 인증 | **비밀번호 1개 + httpOnly 세션 쿠키** (`nuxt-auth-utils`) | 쓰는 사람이 1명인데 OAuth는 의식(ceremony) |
| 노출 | **Cloudflare Tunnel** → `pic-blog.jun-devlog.win` → `localhost:4600` | 포트포워딩 불필요. 1단계 서브도메인이라 Universal SSL 무료 |

---

## 3. 데이터 모델

```sql
CREATE TABLE post (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  summary       TEXT,
  cover_photo_id INTEGER REFERENCES photo(id),
  started_at    TEXT,           -- ISO8601, 최초 사진의 shot_at에서 파생
  ended_at      TEXT,
  is_public     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE point (
  id            INTEGER PRIMARY KEY,
  post_id       INTEGER NOT NULL REFERENCES post(id) ON DELETE CASCADE,
  lat           REAL NOT NULL,  -- 확정 중심. 저장된 뒤에는 사진이 붙어도 움직이지 않는다 (§4.2)
  lng           REAL NOT NULL,
  title         TEXT,
  body          TEXT,
  tags          TEXT NOT NULL DEFAULT '[]',  -- JSON 배열
  first_shot_at TEXT,           -- 소속 사진 중 가장 이른 shot_at. 동선 정렬 키
  order_index   INTEGER NOT NULL
);

CREATE TABLE photo (
  id            INTEGER PRIMARY KEY,
  point_id      INTEGER NOT NULL REFERENCES point(id) ON DELETE CASCADE,
  display_path  TEXT NOT NULL,  -- 2048px WebP
  thumb_path    TEXT NOT NULL,  -- 400px WebP
  w             INTEGER NOT NULL,
  h             INTEGER NOT NULL,
  lat           REAL NOT NULL,  -- 사진 고유 좌표 (앵커와 최대 반경만큼 다름)
  lng           REAL NOT NULL,
  shot_at       TEXT,
  -- 라이트박스 하단에 표시하는 EXIF 촬영값 (아트보드 1b)
  camera        TEXT,           -- 'iPhone 15 Pro'  (Make + Model)
  f_number      REAL,           -- 1.78  → 'f/1.78'
  exposure      TEXT,           -- '1/120'          (ExposureTime을 표시형으로)
  iso           INTEGER,        -- 64
  order_index   INTEGER NOT NULL
);

CREATE INDEX idx_point_post ON point(post_id, order_index);
CREATE INDEX idx_photo_point ON photo(point_id, order_index);
```

**설계 판단**

- 확정 저장된 `point.lat/lng` 는 **불변**이다. 사진이 추가될 때마다 centroid를 재계산하면
  이미 배치한 포인트가 지도 위에서 움직여서 사용자가 혼란스럽다.
  (업로드 세션 내부에서만 centroid가 갱신된다 — §4.1)
- `photo.lat/lng` 를 따로 보관한다. 포인트 중심만 남기면 원본 좌표가 소실되어, 나중에
  반경을 바꿔 재계산할 수 없다.
- **태그는 정규화하지 않는다.** `tag` / `point_tag` 두 테이블 대신 JSON 컬럼. 개인 블로그
  규모에서 `json_each()` 로 충분하다. 태그 필터가 실제로 느려지면 그때 정규화한다.

---

## 4. 클러스터링 — 두 개의 반경 (2026-08-26 디자인에 맞춰 재작성)

반경은 **서로 다른 두 시점**에 쓰이고, 규칙이 다르다. 초판은 이 구분을 하지 않아 틀렸다.
정답은 `_workspace/deisgn/data.js` 의 `clusterAt()` 과 `assigns` 다 — 그대로 이식한다.

**반경 선택지는 `[20, 50, 100, 200]m`, 기본 50m.**

### 4.1 최초 업로드 — `clusterAt(R)` : 촬영 시각 순 스트리밍

```
사진을 shot_at 오름차순 정렬
"진행 중인 클러스터" 하나만 유지한다 (전체 후보와 비교하지 않는다)

for each 사진:
    진행 중 클러스터가 있고
      거리(클러스터 중심, 사진) <= R  이고
      (사진 시각 - 클러스터 마지막 시각) <= 90분      → 합류
         └ 합류 후 클러스터 중심을 소속 사진들의 centroid 로 갱신
    아니면 → 진행 중 클러스터를 닫고 새 클러스터를 연다
```

**🔴 90분 갭 규칙**: 거리와 무관하게 90분 이상 비면 끊는다.
없으면 **같은 자리로 돌아온 다음 날이 하나의 포인트로 합쳐진다.** §4.3에서 걱정한
실패 모드를 이 규칙이 막는다.

**centroid 갱신은 이 단계에서만 일어난다.** 아직 저장된 포인트가 없는, 업로드 세션 내부의
계산이다. 확정 저장된 뒤에는 §4.2가 지배한다.

**`gap` 플래그**: 새 클러스터를 열 때 `거리 <= R` 이었다면 **끊긴 이유가 시간 공백**이라는
뜻이다. 이 플래그를 저장해서 미리보기에서 「거리로 끊김」과 「시간 공백으로 끊김」을
구분해 표시한다 (§11.6).

### 4.1.1 ⚠ centroid 드리프트 — 클러스터 실제 범위는 반경을 넘는다

중심이 합류할 때마다 이동하므로, **클러스터의 실제 퍼짐(최대 두 사진 간 거리)이 R을 초과할 수
있다.** 해변을 걸으며 20m 간격으로 찍으면 R=50m에서도 사슬처럼 이어져 한 포인트가 된다.

샘플 데이터(강릉 113장) 실측:

| 반경 | 포인트 수 | 퍼짐 > 반경 | 최대 퍼짐 |
|---|---|---|---|
| 20m | 85 | 4개 | 26m |
| 50m | 46 | **8개** | **73m** |
| 100m | 28 | 7개 | 148m |
| 200m | 17 | 5개 | 248m |

**버그가 아니라 알고리즘의 성질이다.** 90분 갭 규칙이 무한 사슬을 시간 축에서 끊어주므로
실용상 문제가 되진 않는다. 다만 **UI가 이걸 「반경 내 N m」라고 부르면 거짓말이 된다** —
R=50에서 「반경 내 73m」가 뜬다. 표기는 「퍼짐 N m」여야 한다.

### 4.2 사진 추가 (편집) — `assign(R)` : 기존 포인트 중심은 불변

```
추가한 사진 각각:
    기존 포인트 중심에서 R 안  → 그 포인트에 합류
                               └ 기존 포인트의 중심 좌표는 바뀌지 않는다
                               └ 합류한 사진은 그 포인트의 촬영 시각 순 "뒤"에 붙는다
    R 밖                       → 추가 사진끼리 다시 묶어 새 포인트를 만든다 (§4.1 규칙)
                               └ 새 포인트 이름은 추가 후 편집 모드에서 쓴다
```

**좌표 없는 사진은 어떤 반경에서도 포인트가 되지 않는다.**

### 4.3 왜 반경이 UI에 노출되는가

도심 GPS 오차는 10~30m다. 고정 반경이면 **같은 카페가 두 포인트로 갈라지거나 옆 건물이
한 포인트로 합쳐진다.** 사용자에게 아무 신호 없이 잘못된 결과가 나온다.

**해법: 포인트 병합/분할 UI를 만들지 않는다.** 대신 확정 전에 **지도 미리보기 + 반경 슬라이더**를
둔다. 값을 바꾸면 **그 자리에서 다시 계산되고 지도 뷰포트는 유지된다.**
슬라이더 하나가 병합/분할 UI 전체를 대체한다 (§7.2에서 원칙으로 굳음).

디자인은 여기에 **「반경별 결과」 비교표**를 더했다 — 20/50/100/200 각각의 합류·새 포인트
수를 한눈에 보여줘서, 슬라이더를 훑지 않고도 고를 수 있다.

## 5. 업로드 파이프라인 — 전부 클라이언트

```
1. 파일 선택 (multiple)
2. per file: exifr.gps() + exifr.parse(['DateTimeOriginal','Make','Model','FNumber','ExposureTime','ISO'])
   ├── GPS 없음 → 거부 목록에 담는다 (업로드하지 않음)
   └── GPS 있음 → 3
3. createImageBitmap(file, { imageOrientation: 'from-image' })
   → canvas 리사이즈 → display(2048px) + thumb(400px) WebP Blob
4. 클러스터링 (§4) → 지도 미리보기 + 반경 슬라이더
5. 확정 → multipart POST → 서버가 디스크 write + SQLite INSERT (단일 트랜잭션)
```

### 5.1 왜 서버가 아니라 클라이언트인가

| | 서버 리사이즈 | **클라이언트 리사이즈** |
|---|---|---|
| 업로드 대역폭 | 5.1MB/장 | **0.5MB/장 (10배 절감)** |
| N100 CPU | 사진마다 디코드+인코드 | **0** |
| 서버 의존성 | sharp / libvips 설치·빌드 | **없음** |
| Cloudflare Tunnel 100MB/req | 10~20장에서 걸림 | 사실상 무제한 |

### 5.2 필수 구현 디테일 (빠뜨리면 버그로 나타남)

- **`imageOrientation: 'from-image'` 를 반드시 준다.** canvas로 리사이즈하면 EXIF Orientation이
  소실되어 세로 사진이 눕는다. 이 옵션이 없으면 아이폰 세로 사진이 전부 회전된 채로 저장된다.
- **WebP 인코딩 폴백.** `canvas.toBlob(cb, 'image/webp', 0.8)` 이 null을 반환하거나 타입이
  다르면 `image/jpeg` q0.82 로 떨어진다. iOS 18은 WebP 인코딩을 지원하지만 폴백은 싸다.
- **shot_at 폴백 사슬**: `DateTimeOriginal` → `file.lastModified` → null.
- **촬영값(`camera`/`f_number`/`exposure`/`iso`)은 없으면 null로 두고 UI에서 그 줄만 감춘다.**
  `ExposureTime` 은 초 단위 실수(0.00833…)로 오므로 `1/120` 표시형으로 변환해 저장한다.
- **EXIF 타임존은 신뢰하지 않는다.** `DateTimeOriginal` 은 타임존 없는 로컬 시각이다. 해외
  여행 사진이 섞이면 절대 시각은 틀리지만 **상대 순서는 유지되므로 정렬에는 무해하다.**
  화면에 절대 시각을 표시할 때만 이 한계를 인지할 것.
- 리사이즈는 메인 스레드에서 순차 처리 + 진행률 표시.
  `ponytail: 200장 이상에서 체감 지연이 생기면 Worker + OffscreenCanvas 로 올린다`

### 5.3 저장 용량

| 전략 | 장당 | 60GB 수용량 |
|---|---|---|
| **파생본만 (채택)** | ~535KB (display ~500KB + thumb ~35KB) | **약 11만 장** |
| 원본까지 보관 | ~5.6MB | 약 1만 장 |

**원본은 보관하지 않는다.** 원본은 이미 iCloud에 있다. 이 서비스는 사진의 SSOT가 아니라
뷰어다. 중복 보관에 용량의 90%를 쓸 이유가 없다.

저장 레이아웃: `/data/photos/{post_slug}/{photo_id}_{display|thumb}.webp`

---

## 6. 지도 & 동선

**Mapbox GL JS v3** (2026-08-26 Google Maps에서 전환).

- 포인트 마커: 앵커 좌표. 클릭하면 해당 포인트 상세로 연결 (§11 레이아웃).
- **동선**: `point.first_shot_at` 오름차순으로 앵커를 이은 GeoJSON `LineString` 레이어.
  - `first_shot_at` 이 null인 포인트는 선에서 제외하고 지도에는 마커만 남긴다.
  - **여러 날 여행이면 숙소↔다음 목적지 사이에 긴 선이 생긴다.** 일단 하나의 연속선으로 간다.
    `ponytail: 날짜별로 선을 끊거나 색을 나누는 건, 실제로 보기 싫어진 뒤에 한다`

### 6.1 왜 Google Maps가 아닌가

| | Google Maps JS API | **Mapbox GL JS** |
|---|---|---|
| 결제 카드 | 필수 | 무료 티어 내 불필요 |
| 무료 한도 | 2025 과금 개편, 한도 불명확 | **50,000 맵 로드/월** 명시, 초과 시 1,000당 $5 |
| 지도 스타일링 | 제한적 | 벡터 타일 — 거의 무제한 |
| **탈출로** | **없음** (API가 완전히 다름) | **MapLibre GL JS가 API 호환 포크** |

마지막 행이 결정 근거다. Mapbox로 짜두면 라이센스나 가격이 나빠져도 **MapLibre(BSD-3-Clause,
토큰 불필요)로 옮기는 비용이 거의 0**이다. Google에서 빠져나오려면 지도 코드를 다시 쓴다.
「지도가 주인공」인 디자인 방향에도 벡터 타일 스타일링이 직접 유리하다.

### 6.2 라이센스 — 오픈소스가 아니다 (인지하고 쓴다)

Mapbox GL JS는 **v2.0부터 프로프라이어터리**다
([LICENSE.txt](https://github.com/mapbox/mapbox-gl-js/blob/main/LICENSE.txt)):

> licensed under the Mapbox TOS for use only with the relevant Mapbox product(s)

- 활성 Mapbox 계정 + 액세스 토큰 필수. 계정이 비활성되면 라이센스가 자동 종료된다.
- **Mapbox 제품하고만 써야 한다** — 타사 타일 소스에 물리면 TOS 위반이다.
  (그게 필요해지는 날이 MapLibre로 넘어가는 날이다.)
- v1.13 이하는 BSD-3-Clause였고, 그 마지막 버전의 포크가 MapLibre GL JS다.

**개인 블로그 트래픽에서 50k/월은 넘길 수 없는 수치이므로 실질 무료다.** 상업화하거나
트래픽이 폭증하면 그때 다시 판단한다.

### 6.3 반드시 지킬 것 두 개

1. **액세스 토큰에 URL 제한(도메인 화이트리스트)을 건다.** 토큰은 클라이언트에 노출된다.
   `pic-blog.jun-devlog.win` 만 허용. 걸지 않으면 제3자가 토큰을 도용해 계정에 과금된다.
2. **Mapbox 로고 + attribution은 제거할 수 없다** (제거하려면 유료 플랜). 지도가 화면을
   지배하는 디자인이므로 **이 두 요소가 항상 지도 위에 얹힌다는 전제로 레이아웃을 짠다.**
   나중에 발견하면 레이아웃을 고쳐야 한다.

## 7. 라우팅 & 인증

**2026-08-26 갱신**: 디자인 확정에 맞춰 `/admin/*` 을 폐기하고 **`editor` 레이아웃**으로 간다.

| 경로 | 레이아웃 | 내용 | 접근 |
|---|---|---|---|
| `/` | `default` | 포스트 목록 | 공개 |
| `/p/[slug]` | `default` | 지도 + 동선 + 포인트 + 스캐터 갤러리 | 공개 (`is_public=1`만) |
| `/editor` | `editor` | 기록 관리 (목록 · 새 기록 · 공개 여부) | **비밀번호** |
| `/editor/new` | `editor` | 새 기록 — 업로드 (§5, §11.2) | 비밀번호 |
| `/editor/[slug]` | `editor` | 포스트 · 포인트 · 사진 편집 (아트보드 1e) — 업로드의 마지막 단계이기도 하다 | 비밀번호 |

**`editor` 레이아웃 진입 조건이 비밀번호다.** 라우트 단위가 아니라 **레이아웃 단위 게이트**다 —
`editor` 레이아웃을 쓰는 모든 페이지는 세션이 없으면 비밀번호 화면으로 떨어진다.
`nuxt-auth-utils` 세션 + httpOnly 쿠키, `ADMIN_PASSWORD_HASH` env(평문 금지).

**읽기 경로(`/`, `/p/[slug]`)는 절대 잠기지 않는다.**

### 7.1 디자인 아트보드 1e와의 차이 (의도된 것)

디자인 1e는 편집을 **`/p/[slug]` 인라인 토글**(「별도 화면 없음」)로 그렸다.
**이 결정은 뒤집혔다** — 쓰기 동작 전체를 `editor` 레이아웃 아래로 모은다.

이유: 업로드 플로우의 마지막 단계가 1e 편집 화면 그 자체다(§11.2). 업로드는 별도
화면이고 편집만 인라인이면 같은 화면이 두 경로로 갈라진다. `editor` 레이아웃 하나로
모으면 비밀번호 게이트도 한 곳이고, 업로드 직후 그대로 편집으로 이어진다.

**1e에서 살리는 것**: 편집 범위 원칙(§7.2)과 「저장하지 않고 나가면 변경 건수를 묻는다」.

### 7.2 편집 범위 — 측량값은 손대지 않는다 (아트보드 1e 원칙)

| 편집 가능 | **편집 불가 (UI에서 잠근다)** |
|---|---|
| 포스트 타이틀 · 요약 | **좌표** — EXIF 원본 |
| 포인트 타이틀 · 태그 · 콘텐츠 | **촬영 시각** — EXIF 원본 |
| 사진 순서 · 삭제 · 커버 지정 · 추가 | **포인트 순서** — 촬영 시각 순 고정 |
| 공개 여부 | **포인트 병합 · 분할** — 업로드 반경으로만 진입 (§4.1) |

마지막 행이 §4.1의 결론과 맞물린다. 병합/분할 UI를 만들지 않기로 한 결정이
디자인에서 원칙으로 굳었다.

## 8. 사용자 피드백 (조용한 실패 금지)

| 상황 | 반드시 보여야 하는 것 |
|---|---|
| GPS 없는 사진 선택 | **"3장은 위치 정보가 없어 제외했습니다"** + 제외된 파일명 목록. 조용히 무시하는 것은 결함이다 |
| 전부 GPS 없음 | 업로드 버튼 비활성 + 이유 설명 (스크린샷·메신저 수신 사진은 좌표가 없다는 안내) |
| EXIF 파싱 예외 | 해당 파일만 제외하고 사유 표시. 전체 중단 금지 |
| 리사이즈 진행 중 | 진행률 (n/총장수). 대량 업로드에서 멈춘 것처럼 보이면 안 된다 |
| 업로드 실패 | 어떤 사진이 실패했는지 + 재시도. 부분 성공 상태를 감추지 않는다 |

---

## 9. 배포

```
Docker 컨테이너 1개 → 127.0.0.1:4600
  volume: ./data → /app/data   (SQLite 파일 + 사진 디렉토리)
Cloudflare Tunnel ingress: pic-blog.jun-devlog.win → http://localhost:4600
```

### 9.1 구속 조건 (메모리에서 확인됨, 위반하면 CI가 깨진다)

- **junserver에는 `docker buildx` 가 없다.** 두 워크플로 모두 `DOCKER_BUILDKIT=0` 으로 고정되어
  있다. → Dockerfile에 BuildKit 전용 기능(`--mount=type=cache`, heredoc, multi-platform)을
  **쓰면 안 된다.** 평범한 multi-stage build만 사용한다.
- Cloudflare Tunnel은 **대시보드 관리형(remotely-managed)** 이다. 서버에는
  `/etc/cloudflared/token` 뿐이고 **ingress 규칙은 Cloudflare 대시보드에만 존재한다.**
  라우팅 문제를 로컬 파일에서 찾지 말 것. 로그는 `journalctl -u cloudflared`.
- **`cloudflared tunnel delete` 는 절대 금지.** 터널이 raspi와 공유물이라 같이 죽는다.

### 9.2 터널 소속 — 검증 완료 (2026-08-25)

`pic-blog.jun-devlog.win` → `http://localhost:4600` ingress는 **junserver(N100) 터널**에
등록되어 있다. 사용자 직접 확인.

이게 왜 확인이 필요했는가 (재발 방지용 기록): 집에는 cloudflared 커넥터가 **두 대**
떠 있다 (raspi arm64 / junserver x86_64). ingress의 `localhost:4600` 은 **그 규칙이 등록된
터널의 커넥터가 도는 호스트의 localhost** 로 해석되므로, 규칙이 raspi 터널에 들어가 있으면
N100에 아무리 띄워도 도달하지 않는다. 증상은 단순 502/연결 실패라 원인이 드러나지 않는다.
2026-08-20에 이 혼동으로 실제 사고가 있었다 — 배포는 junserver에 떨어졌는데 터널은 raspi의
13일 된 컨테이너를 계속 서빙했고 CI는 초록이었다 (`[[deploy-topology]]`).

**→ 이후 새 ingress를 추가할 때마다 어느 터널인지 먼저 확인할 것.**

## 10. 스코프에서 뺀 것 (YAGNI)

| 뺀 것 | 다시 볼 조건 |
|---|---|
| 회원가입 / 멀티유저 / 피드 | 없음. 다른 제품이다 |
| 원본 사진 보관 | 원본 다운로드를 실제로 원하게 될 때 |
| 포인트 병합/분할 UI | 반경 슬라이더로 부족해질 때 (§7.2에서 원칙으로 굳음) |
| 태그 정규화 테이블 | `json_each()` 태그 필터가 느려질 때 |
| 날짜별 동선 분리 | 연속선이 실제로 보기 싫어질 때 |
| Worker 기반 리사이즈 | 200장 이상에서 체감 지연이 생길 때 |
| 오프라인 / PWA 설치 | 없음 |
| 라이트 테마 | 없음 — 다크 단일 (§11.3) |

---

## 11. 디자인 (완료, 2026-08-26)

산출물: `_workspace/deisgn/`
- `pic-blog 화면.dc.html` — 아트보드 5개
- `data.js` — 샘플 데이터 + **스캐터 배치 알고리즘**
- `pic-map.js` — 지도 컴포넌트 (Leaflet 기준, 포팅 대상)
- `icons/outline/*.svg` 26종, `uploads/*.png` 참고 스크린샷
- ⚠ `support.js` 는 Claude Design 캔버스 런타임(`dc-runtime`, generated)이다.
  **읽지도 이식하지도 않는다.** `.dc.html` 의 `{{ }}` 와 `data-dc-*` 도 캔버스 전용 문법이다.

**충돌 시 우선순위**: 정보 구조·알고리즘·제약은 이 문서, 레이아웃·비주얼·인터랙션은 디자인.

### 11.1 아트보드

| | 화면 | 비고 |
|---|---|---|
| 1a | 포스트 목록 `/` | 1440×900 + 390×844 |
| 1b | 포스트 뷰 `/p/[slug]` | 지도+목록 → 마커 선택 → 스캐터 상세 → 확대 |
| 1c | 빈 상태 · 에러 상태 5종 | 640×420 |
| 1d | 시스템 | 팔레트 · 타이포 · 마커 · 동선 · 지도 스타일 |
| 1e | 편집 모드 | §7.1 — 라우팅은 뒤집혔고 편집 범위 원칙만 살린다 |
| 1f | 사진 추가 · 배정 반경 | §4.2 — 기존 포인트 중심 불변 |
| 1g | **최초 업로드 · 클러스터 미리보기** | §4.1 — 4단계 중 3단계. 슬라이더 실동작 |

### 11.2 업로드 플로우 — 전 단계 디자인 완료 (2026-08-26)

| 단계 | 디자인 위치 |
|---|---|
| 1. 진입 — 「첫 기록 만들기」 | 1c 빈 상태 |
| 2. 사진 선택 | (표준 파일 입력) |
| 3. 검사 결과 — 「113장 통과 / 6장 제외 — 위치 정보가 없습니다」 | **1g 상단** |
| 4. **클러스터 미리보기 + 반경 슬라이더** | **1g** ✅ |
| 5. 업로드 진행률 — 「98.3% · 실패 2장 · 재시도」 | 1c |
| 6. 글 작성 · 사진 정리 | 1e = `/editor/[slug]` |

기존 기록에 사진을 추가하는 경로는 **1f** 가 따로 담당한다 (§4.2).
**갭 없음.** 두 화면 모두 슬라이더가 실제로 동작하는 상태로 그려져 있다.

### 11.3 디자인 시스템 (아트보드 1d)

**다크 단일 테마. 라이트 테마는 없다.**

```
텍스트 · 활성 마커   #E8EBE9
보조 텍스트 · 버튼    #B1C7C1
동선 · 링크          #92B2A9
데이터 · 캡션        #83A79E
표면                #040408  #0B0E12  #1E2125  #2A2A30
헤어라인             rgba(177,199,193,0.14)
```

| 역할 | 페이스 | 조달 |
|---|---|---|
| 디스플레이 | Bricolage Grotesque 600, `-0.025em` | Google Fonts |
| 본문 | Pretendard Variable + JP, 15/1.78 (KO·EN·JP) | ⚠ **Google Fonts에 없다** — jsdelivr CDN 또는 자체 호스팅 |
| 데이터 | Geist Mono 400 — 좌표·시각·거리·파일명 | Google Fonts |

**마커**: 번호 26px 원형 / 활성 `1.15×` + `#E8EBE9` 배경 + `#040408` 텍스트 / 축소 시 dot 12px
**동선**: dash `2 7` · 2.25px · `#92B2A9` · 글로우 8px @16%

### 11.4 갤러리 — 스캐터(선택) + 라이트박스(캐러셀) 2층

이 문서 초판의 「이미지 캐러셀」은 **폐기된 게 아니라 두 층으로 나뉘었다.**

**층 1 — 스캐터 필드 (선택)**
포인트 상세를 열면 사진이 **흩뿌려진 필드**로 깔린다. 가로 스트립이 아니다.
`data.js` 의 `scatter()`/`field()`/`relax()` 를 그대로 이식한다:

- **결정적(시드 기반 LCG)** — 새로고침해도 위치가 흔들리지 않는다. `Math.random()` 금지
- 지터 격자 → 타원 충돌 완화 6회
- 카드 크기가 장수에 반응 (`sqrt(면적/장수)`), 썸네일 70–88px, 카드마다 ±4° 회전
- 10장 이상이면 일부 고스트 (`opacity 0.26`, 14% 확률)
- 필드: 데스크탑 716×632 / 모바일 390×430
- 카드 좌하단에 번호, 하단 힌트 「썸네일 클릭 → 확대 · N장」

**층 2 — 라이트박스 (캐러셀)**
썸네일을 클릭하면 확대된다. **여기가 캐러셀이다.**

- 헤더: 파일명(`IMG_4790.webp`) · **`8 / 14`** · 포인트명 · 시각 · 닫기
- 좌우 `‹` `›` 로 순차 이동 (키보드 ←/→ 도 받는다)
- 이미지 하단 캡션: `2048 × 2731 WebP`
- 배경에 스캐터 필드가 흐리게 비친다

**포인트 상세 헤더/사이드(아트보드 1b)**
- 헤더: `11 월화거리` · 🕐 `2026.08.23 18:35` · 📍 `37.763847, 128.899886` · 닫기
- 사이드: 태그 칩 → 본문 문단 → **하단에 EXIF 촬영값**
  `iPhone 15 Pro · 2048px WebP` / `f/1.78 · 1/120s · ISO 64`
  → 이 값들이 `photo` 테이블의 `camera` · `f_number` · `exposure` · `iso` 다 (§3).
  업로드 시 `exifr` 로 함께 뽑아 저장한다 (§5).

### 11.5 지도 포팅 — 디자인은 Leaflet, 구현은 Mapbox GL JS

| 목업 (Leaflet) | 구현 (Mapbox GL JS v3) |
|---|---|
| OSM 래스터 + **CSS `filter` 다크 해킹** | **진짜 벡터 다크 스타일**. filter 흉내 금지 |
| DOM 오버레이 + `latLngToContainerPoint` 수동 배치 | `new mapboxgl.Marker(el)` — DOM 엘리먼트를 그대로 받는다 |
| SVG `<path>` 오버레이 동선 | GeoJSON `LineString` + `line` layer (`line-dasharray: [2,7]`), 글로우는 두 번째 layer |
| `dragging:false` 등 상호작용 OFF | **켠다.** 목업이 끈 건 아트보드라서다 |

**🔴 좌표 순서**: Leaflet `[lat,lng]` ↔ **Mapbox `[lng,lat]`**.
놓치면 에러 없이 마커가 지구 반대편에 찍힌다.

**지도 스타일 의도 (1d)**: *중성 다크 · 물이 땅보다 어둡다 · 도로 라벨 없음.*
1d에는 Google Maps JSON 형식으로 적혀 있다 — **형식이 아니라 의도를 옮긴다.**

### 11.6 반경 미리보기 — 두 화면 (1f · 1g)

**공통**: 반경 `[20 / 50 / 100 / 200]m`, 기본 50m. 값을 바꾸면 **그 자리에서 재계산되고
지도 뷰포트는 유지된다.** 「반경별 결과」 비교표로 네 값의 결과를 한눈에 보여준다.

| | 1g 최초 업로드 | 1f 사진 추가 |
|---|---|---|
| 기존 포인트 | 0개 | 13개 |
| 지표 | 사진 N장 → 포인트 M개 / **시간 공백으로 끊김 K곳** | 합류 N장 → M곳 / 새 포인트 K개 |
| 중심 규칙 각주 | 「합류할 때마다 중심이 평균 좌표로 다시 계산됩니다」 | 「기존 포인트의 중심 좌표는 바뀌지 않습니다」 |
| 지도 variant | `cluster` | `assign` |

**시간 공백 시각화** (요청해서 반영됨): `gap` 플래그가 선 것은 **거리는 반경 안인데 시간
때문에 끊긴** 클러스터다. 지도에서 별도 SVG path로 그린다 — `dasharray '1 6'`, 1.4px,
`rgba(146,178,169,.55)` — 거리로 끊긴 실선 구간과 구분된다. 마커에도 시계 표식이 붙고,
목록 항목은 「N시간 공백 뒤」로 표기된다.

없으면 **지도상 거의 같은 자리에 포인트 둘이 생기는데 이유가 안 보인다** — 사용자가
클러스터링 버그로 읽는 조용한 실패다.

## 12. 미해결

| # | 항목 | 상태 |
|---|---|---|
| 1 | Mapbox 토큰 URL 제한 설정 | 미적용 — 토큰 발급 시 즉시 (§6.3) |
| 2 | display 2048px / thumb 400px 수치 | 잠정. 실제 사진으로 육안 확인 후 확정 |

해소됨:
- ~~`pic-blog` ingress 터널 소속~~ → junserver 터널 확인 (§9.2)
- ~~코드 저장소 위치~~ → `/Users/jun/develop/playground/pic-blog`
