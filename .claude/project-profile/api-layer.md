# API Layer

## Client
- Type: framework built-in — Nuxt `useFetch` (페이지 데이터) · `$fetch` (저장·변경 동작)
- Base client: `$fetch` (ofetch)
- Base URL config: 없음 — 같은 출처 상대 경로 `/api/...`

## Generated Code
- Generator: **없음**. 서버와 클라이언트가 한 저장소라 계약 타입은 `shared/types/` 에 손으로 쓴다
  - `shared/types/db.ts` — SQLite 행 모양 (설계문서 §3 스키마와 1:1) + `PostDetail` / `PostSummary`
  - `shared/types/upload.ts` — 업로드 매니페스트 계약
- Spec source / Regen command: N/A → `contract-sync` 게이트 대상 아님. 대신 **스키마(`server/utils/db.ts`)를 바꾸면 `shared/types/db.ts` 를 같은 변경에서 고친다**
- Editable: `shared/types/*` 가 SSOT

## Endpoints (`server/api`)
| 경로 | 인증 | 용도 |
|---|---|---|
| `GET /api/posts` | 선택 | 목록. 세션이 있으면 비공개도 포함 |
| `GET /api/posts/[slug]` | 선택 | 상세. 비공개 + 무세션 → 403 + 통계만(`data.private`) |
| `POST /api/posts` | 필수 | 업로드 매니페스트 → 기록·포인트 생성 (서버가 클러스터 재계산) |
| `PATCH /api/posts/[slug]` | 필수 | 제목·요약·공개·기간·커버 |
| `DELETE /api/posts/[slug]` | 필수 | 기록 삭제 |
| `POST /api/posts/[slug]/photos` · `recluster` · `regroup` | 필수 | 사진 추가 · 반경 재클러스터 · 사진 소속 변경 |
| `PATCH /api/points/[id]` | 필수 | 포인트 이름·태그·본문·대표·링크·소비·앵커 |
| `PUT /api/photos/[id]` · `DELETE /api/photos` | 필수 | 리사이즈된 바이트 업로드 · 사진 삭제 |
| `POST /api/auth/login` · `logout` | — | 세션 |
| `GET /api/health` · `version` | — | 헬스체크 · 빌드 id |
| `GET /photos/{slug}/{id}_{display\|thumb}.{ext}` | 비공개면 필수 | 파일 서빙 (`server/routes`) |

## Request Patterns
- 쓰기 핸들러는 첫 줄에 `await requireEditor(event)` (`server/utils/auth.ts`). **읽기 경로는 절대 부르지 않는다** — `getUserSession` 으로 보기만 한다
- 바디는 `readBody` 후 `unknown` → 필드별 수동 검증. 보내지 않은 필드는 현재 값을 유지 (부분 갱신)
- 좌표·촬영 시각·포인트 순서는 측량값이라 PATCH 로 받지 않는다. 앵커도 좌표가 아니라 `'centroid' | { photoId }` 만 받는다
- DB: `useDb()` (better-sqlite3 동기 API), 여러 문장은 `db.transaction(...)`
- 스키마 변경: `SCHEMA` 의 `CREATE TABLE IF NOT EXISTS` + 부팅 시 `addColumnIfMissing()` 로 열 추가. 별도 마이그레이션 도구 없음 — 운영 DB 에는 열 추가만 안전하다

## Auth
- Token storage: httpOnly 봉인 세션 쿠키 `pic-blog-session` (nuxt-auth-utils), `maxAge` 30일 절대 만료
- Secure: `NODE_ENV === 'production'` 일 때만 (빌드 시점에 굳음)
- 비밀번호: env 에 scrypt 해시만 (`NUXT_ADMIN_PASSWORD_HASH`). 틀리면 400ms 지연 후 401
- 게이트 폼(`EditorGate.vue`)은 `method="post"` — 하이드레이션 전 제출 시 비밀번호가 URL 에 실리지 않게 하려는 것

## Error Handling
- 서버: `createError({ statusCode, statusMessage })`, 메시지는 한국어이고 화면에 그대로 쓴다 (`field: 이유` 형식, 예 `title: 비어 있습니다`)
- 클라이언트: `$fetch` 실패 시 `statusMessage` 를 꺼내 표시, 없으면 기본 문구
