# Deployment

## CI/CD
- Platform: GitHub Actions
- Workflows: `.github/workflows/deploy.yml`
  - 트리거: `main` push (`_docs/**`, `**.md`, `.gitignore` 만 바뀌면 제외) · 수동 실행
  - `verify` (ubuntu, Node 24, pnpm = `packageManager`): install → typecheck → `pnpm test` → build
  - `deploy` (self-hosted `n100` = junserver): `DOCKER_BUILDKIT=0 docker build` → 컨테이너 교체 → `/api/health` 200 대기 → dangling 이미지 정리
- 🔴 `main` 에 push 하면 곧바로 운영에 나간다. push 는 사용자가 명시적으로 지시할 때만

## Environments
| Env | Branch | URL/Config |
|-----|--------|------------|
| Development | 로컬 | `http://localhost:4600` · `.env.local` · `./data` |
| Staging | 없음 | — |
| Production | `main` | `https://pic-blog.jun-devlog.win` (Cloudflare Tunnel) · 데이터 `/home/junja/apps/pic-blog/data` 볼륨 |

- 수동 배포(러너·GitHub 장애 시): `./scripts/deploy.sh junserver-ext` (rsync + 서버에서 빌드, `.env.prd` 사용)
- 런북: `_docs/reference/deploy/2026-08-26-deploy.md`

## Environment Variables
- Access pattern: `useRuntimeConfig()` (서버: `dataDir`, `adminPasswordHash`, `session`; 공개: `public.mapboxToken`, `public.mapboxStyle`, `public.buildId`)
- Config file: `.env.local`(개발) / `.env.prd`(배포), 둘 다 gitignored. 키 목록은 `.env.example`
- 키: `NUXT_PUBLIC_MAPBOX_TOKEN` · `NUXT_PUBLIC_MAPBOX_STYLE` · `NUXT_SESSION_PASSWORD`(32자+) · `NUXT_ADMIN_PASSWORD_HASH`(scrypt, 평문 금지) · `NUXT_DATA_DIR`
- 🔴 해시에 `$` 가 들어 있어 셸 스크립트 본문에 직접 박으면 깨진다 — env 로 넘기고 `"$VAR"` 로 참조 (deploy.yml 주석)

## Build Output
- Command: `pnpm build`
- Output dir: `.output/`
- Type: SSR (Nitro node-server)
- 이미지: `node:24-slim` 2단계, pnpm 은 `package.json` 의 `packageManager` 로 설치, BuildKit 전용 문법 금지 (junserver 에 buildx 없음). 빌드 단계에서 better-sqlite3 로드를 실제로 확인. 엔트리포인트가 볼륨 소유권을 맞춘 뒤 node 로 강등
- iOS 껍데기: `cd app-ios && flutter build ios --release` — 웹만 바꿨다면 다시 빌드할 필요 없다

## MCP / Claude 설정 (2026-11-02)

- `NUXT_SITE_URL`: 운영 HTTPS 출처. 미설정이면 MCP 연결은 503. Actions variable `NUXT_SITE_URL`.
- `NUXT_AI_API_KEY`: 서버 전용. Actions secret 같은 이름; 비어 있으면 생성만 503. 기존 서비스 키를 자동 탐색·복사하지 않는다.
- `NUXT_AI_MODEL`: 기본 `claude-sonnet-5-5`; Actions variable로 선택 가능. `NUXT_AI_DAILY_REQUEST_LIMIT` 기본/최대 20(런타임 수동 설정 시 낮출 수 있음).
- 직접 Docker 배포는 기존 `.env.prd` 경로로 같은 변수명을 설정한다. 이 변경에서 실제 값·원격 secret·OAuth grant를 만들지 않았다.
- OAuth 연결 `<dataDir>/oauth/{key,grants.json}`는 0600, 현재 단일 Node 프로세스 전제. 기존 DB·사진 백업 외 별도 자격 데이터다.
- AI 요청/되돌리기 스냅샷은 SQLite에 있으므로 DB 백업에 포함된다. 현재 보관 만료는 없다.
