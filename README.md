# pic·blog

사진의 EXIF GPS 로 포인트를 만들고, 촬영 시각 순으로 동선을 잇는 개인 여행 기록.

읽기는 링크만으로 열리고, 쓰기는 비밀번호 하나로 잠긴다. 사용자 계정은 없다.

- 운영: https://pic-blog.jun-devlog.win
- 설계 SSOT: `_docs/active/planning/2026-08-25/2026-08-25-pic-blog-design.md`
- 디자인에서 가져온 값·규칙: `_docs/reference/design-reference.md`

## 어떻게 도는가

```
사진 선택 → EXIF 스캔 → 반경으로 묶기 → 매니페스트 POST → 사진마다 [리사이즈 → PUT]
            (클라이언트)   (클라이언트)      (서버 재계산)      (한 장씩, 해제)
```

**이미지 처리는 전부 브라우저에서 한다.** 서버에는 sharp/libvips 가 없고, 받은 바이트를
디스크에 쓰기만 한다. 그래서 서버가 가볍고 HEIC 디코더 같은 걸 붙일 일이 없다.

원본은 보관하지 않는다 — display(2048px)와 thumb(400px)만 남는다.

포인트 좌표는 **한 번 정해지면 움직이지 않는다.** 사진이 나중에 붙어도 중심을 다시
계산하지 않는다. 포인트를 다시 묶는 유일한 방법은 편집 1단계에서 반경을 바꾸는 것이고,
그건 포인트의 이름·태그·본문을 지우므로 사라질 항목을 이름까지 보여주고 확인받는다.

좌표·촬영 시각·포인트 순서는 측량값이라 화면에서 편집할 수 없다.

## 스택

| | |
|---|---|
| 앱 | Nuxt 4 (`app/` srcDir, `shared/` 공용) |
| DB | SQLite 파일 하나 · better-sqlite3 · WAL |
| 지도 | Mapbox GL JS v3 + 커스텀 스타일 |
| 인증 | nuxt-auth-utils (비밀번호 1개, scrypt) |
| 컴포넌트 | Reka UI (headless) |
| 배포 | Docker · plain `docker run` · Cloudflare Tunnel |

프로세스 하나 + 파일 하나로 끝난다. 외부 DB·큐·오브젝트 스토리지가 없다.

## 로컬

```bash
pnpm install
pnpm dev            # .env.local 을 읽는다 · http://localhost:4600
```

| 명령 | |
|---|---|
| `pnpm typecheck` | vue-tsc |
| `pnpm build` | 프로덕션 빌드 |
| `node --experimental-strip-types shared/utils/__checks.ts` | 클러스터링·산포·좌표·EXIF 포맷 회귀 검사 |
| `aside repl "$(cat scripts/smoke.js)"` | 배포 후 스모크 (운영을 실제로 열어 확인) |

## 환경변수

`.env.local`(개발) / `.env.prd`(배포). 둘 다 gitignore 되어 있고 `.env.example` 이 키 목록이다.

| 키 | |
|---|---|
| `NUXT_PUBLIC_MAPBOX_TOKEN` | `pk.` 토큰. 번들에 실리므로 URL 제한을 건다 |
| `NUXT_PUBLIC_MAPBOX_STYLE` | Studio 커스텀 스타일 |
| `NUXT_SESSION_PASSWORD` | 세션 쿠키 서명 키 (32자 이상) |
| `NUXT_ADMIN_PASSWORD_HASH` | 편집 비밀번호 scrypt 해시 — 평문 금지 |
| `NUXT_DATA_DIR` | SQLite·사진 디렉토리 |

```bash
node scripts/hash-password.mjs '<비밀번호>'   # 해시 생성 (stdin 도 가능)
```

## 배포

`main` 에 push 하면 자동으로 나간다 (`.github/workflows/deploy.yml`).

```
verify (ubuntu)      install → typecheck → 알고리즘 검사 → build
deploy (self-hosted) docker build → 컨테이너 교체 → 헬스체크
```

빌드가 실패하면 옛 컨테이너가 그대로 서비스한다. 시크릿은 GitHub Secrets,
비민감 설정은 Variables 에 있다.

수동 배포(러너나 GitHub 이 죽었을 때):

```bash
./scripts/deploy.sh junserver-ext
```

### 데이터

```
{NUXT_DATA_DIR}/pic-blog.db
{NUXT_DATA_DIR}/photos/{post_slug}/{photo_id}_{display|thumb}.{ext}
```

운영은 `/home/junja/apps/pic-blog/data` 에 있고 컨테이너에 볼륨으로 붙는다.
**러너 작업공간이 아니라 이 고정 경로여야 한다** — 워크스페이스 아래에 두면
다음 체크아웃에서 DB 와 사진이 날아간다.

## 문제 해결

### iOS PWA 상단 — 흐림과 «터치 안 먹음»

홈 화면에 추가한 앱에서 상단바 글자가 뿌옇게 보이고, **그 근처 버튼이 눌리지 않는다.**
같은 페이지를 Safari 로 열면 둘 다 멀쩡하다.

iOS standalone 은 상태바 아래에 반투명 밴드를 그리는데, **그 밴드가 터치까지 가져간다.**
웹뷰 상단 약 40px 안에 있는 버튼은 눌러도 반응하지 않는다.

- **터치**는 앱에서 대응한다 — `tokens.css` 의 `--top-inset` 이 헤더 콘텐츠를 밴드 밖으로
  내린다. iOS standalone 에서만 걸린다. 🔴 **지우지 마라.** 흐림이 안 보인다고 지우면
  버튼이 죽는다 (한 번 그랬다).
- **흐림**은 기기 설정이다 — **설정 → 손쉬운 사용 → 디스플레이 및 텍스트 크기 →
  투명도 줄이기**를 켜면 옅어진다. 이걸 켜도 터치를 먹는 것은 그대로다.

앱을 완전히 종료(앱 스위처에서 위로 밀기)했다 다시 열면 렌더가 갱신된다.
