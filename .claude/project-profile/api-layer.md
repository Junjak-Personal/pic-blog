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
| `POST /api/posts` | 필수 | 업로드 매니페스트 → 기록·포인트 생성. 묶음은 클라이언트(`clusterAt`) 것을 받고, 포인트 순서·기간만 서버가 계산한다 (일차 기준은 기본값) |
| `PATCH /api/posts/[slug]` | 필수 | 제목·요약·공개·기간·커버 |
| `DELETE /api/posts/[slug]` | 필수 | 기록 삭제 |
| `POST /api/posts/[slug]/photos` · `recluster` · `regroup` | 필수 | 사진 추가 · 재묶기(바디 `{ radius, daySettings? }` — 반경 · 일차 기준) · 사진 소속 변경 |
| `PATCH /api/points/[id]` | 필수 | 포인트 이름·태그·본문·대표·링크·소비·앵커 |
| `PUT /api/photos/[id]` · `DELETE /api/photos` | 필수 | 리사이즈된 바이트 업로드 · 사진 삭제 |
| `POST /api/auth/login` · `logout` | — | 세션 |
| `GET /api/health` · `version` | — | 헬스체크 · 빌드 id |
| `GET /photos/{slug}/{id}_{display\|thumb}.{ext}` | 비공개면 필수 | 파일 서빙 (`server/routes`) |

## MCP / 사진 AI (2026-11-02)

- `/mcp`: stateless JSON Streamable HTTP, OAuth bearer, `list_posts` / `read_post` / `update_post` / `update_point`.
- `/oauth/authorize`, `/oauth/token`, `.well-known` 발견 문서. CIMD+PKCE, 단일 편집자 승인. `server/oauth/`는 한 Node 프로세스 기준이다.
- `/api/oauth/requests/:id`, `/api/oauth/connections`: 편집 세션 필수. 변경은 정확한 Origin 검증. 승인·연결 관리 화면은 `/oauth/consent`, `/editor/ai`.
- `/api/posts/:slug/ai/proposals`, `/api/posts/:slug/ai/:id`, `/:id/{apply,undo,cancel}`: 편집 세션 필수. 변경은 JSON+Origin 검증. 계약 `shared/types/photo-ai.ts`, 화면 `/editor/organize/:slug`.
- AI 전용 테이블은 `server/ai/service.ts`의 `AI_SCHEMA`로 초기화한다. 기존 post/point/photo 열은 변경하지 않는다. 요청·스냅샷·사용량은 같은 SQLite에 저장하며 일일 시도 장부는 기록 삭제 후에도 유지한다.
- MCP 수정·AI 적용/되돌리기는 전체 기록 내용 해시로 낙관적 충돌 검사를 한다. 기존 웹 PATCH는 선택적 버전을 보내지 않으므로 이전 웹 초안이 나중에 저장되는 동작은 그대로다.

## Request Patterns
- 쓰기 핸들러는 첫 줄에 `await requireEditor(event)` (`server/utils/auth.ts`). 공개 기록 읽기는 `getUserSession`으로 판정한다. OAuth 관리·AI 제안 같은 비공개 읽기는 `requireEditor`가 필수다
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

## 사진 기록 보강 (2026-11-03)

- 기존 AI 요청의 선택적 `mode: enrich`. 생략/organize는 기존 동작이다. 보강은 썸네일 전송 필수이며 선택1,000장까지 기존 포인트를 유지한다.
- `PhotoAiGroup.enrichment`는 대표 사진·300자/1~3문장 본문·장소 후보/근거 사진을 담는다. 원래 제목/사진 행/소속/순서/앵커는 유지하고 빈 본문과 대표만 적용한다. 후보는 외부 지도 검증 결과가 아니며 제목에 자동 적용하지 않는다. 유효한 사용자 지정 여행 커버도 보존한다.
- 다중 배치 포인트를 종합하고 `enrichment_groups_json`에 체크포인트 저장. 선택1,000장 전체 분석 후 최대15개 대표 후보 비교. `?proposal=<UUID>`로 API 생성 제안을 편집 화면에서 확인한다.
- 단위125테스트 및 실제 사진54장 HTTP API 생성/적용/조회/복원 통과. 자세한 운영 근거는 `_docs/complete/product-spec/2026-11-03-photo-enrichment-plan.md`.
- enrich는 입력 포인트 ID를 필수 키로 하는 Anthropic output_config JSON Schema를 사용한다. 대표·근거 사진은 소유 ID enum으로 제한하고, 사진 소속/목록/제목은 모델이 아닌 서버가 원본에서 복원한다. 서버 소유권/길이 검증도 유지한다.
- 공급자 문법 크기 제한에 맞춰 enrich만 요청당6포인트/40사진/8MB. 장소 wire는 flat필수필드이며 공개응답은 기존union 유지. enrich fingerprint버전2로 이전 미완료 배치계획 재사용 차단; 이전ready적용/복원호환. 실제40포인트8묶음 API검증 통과.
