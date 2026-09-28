# Project Structure

## Directory Layout
```
pic-blog/
├── app/                      # Nuxt srcDir (클라이언트)
│   ├── app.vue
│   ├── assets/css/           # tokens.css · base.css · map.css · menu.css · motion.css (nuxt.config css 배열)
│   ├── components/           # PascalCase.vue, 평면 구조 (하위 폴더 없음)
│   ├── composables/          # useXxx.ts
│   ├── layouts/              # default.vue · editor.vue
│   ├── pages/                # 파일 기반 라우팅
│   │   ├── index.vue         # 공개 기록 목록
│   │   ├── p/[slug].vue      # 기록 보기 (공개 경로)
│   │   └── editor/           # 편집 (비밀번호 게이트)
│   │       ├── index.vue · new.vue · [slug].vue · add/[slug].vue
│   ├── plugins/              # *.client.ts
│   └── utils/                # 클라이언트 전용 유틸 (exif, resize, native 브리지 …)
├── server/                   # Nitro
│   ├── api/                  # [name].<method>.ts 파일 기반 엔드포인트
│   ├── routes/photos/[...path].get.ts   # 사진 파일 서빙 (비공개 검사 포함)
│   └── utils/                # db · queries · auth · photoStore · validate · slug
├── shared/                   # 클라이언트·서버 공용 (#shared 별칭)
│   ├── types/                # db.ts (행 모양) · upload.ts (업로드 계약)
│   └── utils/                # cluster · scatter · geo · format · days · photo · extras · point-anchor · algorithms.test.ts
├── tests/
│   ├── e2e/                  # Playwright spec · seed.ts · seed-data.ts
│   └── fixtures/photos/      # GPS EXIF 합성 JPEG + make.sh
├── public/                   # manifest · icons
├── scripts/                  # deploy.sh · smoke.js · hash-password.mjs · docker-entrypoint.sh
├── app-ios/                  # Flutter WKWebView 껍데기 (lib/ · ios/ · tool/dev-install.sh)
├── data/                     # 🔴 gitignored. 로컬 SQLite + photos/ (NUXT_DATA_DIR 기본값 ./data)
├── _docs/                    # 프로젝트 문서 (색인: _docs/index.md)
├── _workspace/               # 버리는 산출물 (README.md 만 추적)
└── .claude/                  # 에이전트 소유 (프로필 · 위키 · 세션 상태)
```

## Routing Pattern
- Type: file-based (Nuxt pages + Nitro server routes)
- Pages location: `app/pages/`
- Dynamic routes: `[slug]` (기록 slug, 예: `record-20250719`)
- 서버: `server/api/<resource>/[param].<method>.ts` (예: `posts/[slug].patch.ts`, `posts/[slug]/regroup.post.ts`), 파일 서빙은 `server/routes/`
- `_modules/` 관례는 이 프로젝트에 없다 — 페이지가 composable(`useUploadFlow`, `useAddPhotosFlow`)과 컴포넌트로 로직을 뺀다

## Module Organization
- Page logic: `app/composables/useXxxFlow.ts` (업로드·사진 추가 흐름), 나머지는 페이지 `<script setup>` 안
- Shared components: `app/components/` (평면)
- Utilities: 클라이언트 전용 `app/utils/`, 공용(순수 계산) `shared/utils/`, 서버 `server/utils/`
- Types: `shared/types/` (DB 행 · 업로드 계약 — 서버와 클라이언트가 같은 파일을 쓴다)

## Naming Conventions
- Files: 컴포넌트 PascalCase, composable `useXxx.ts`, 유틸은 camelCase 가 주류이고 일부 kebab-case (`route-style.ts`, `point-anchor.ts`)
- Components: `PascalCase.vue` (예: `PointGroupBoard.vue`, `BulkPointAnchorItem.vue`)
- Stores: 스토어 라이브러리 없음 (state-management.md)
- Tests: 단위 `*.test.ts` (대상 옆, 현재 `shared/utils/`), E2E `tests/e2e/*.noauth.spec.ts` / `*.spec.ts`
