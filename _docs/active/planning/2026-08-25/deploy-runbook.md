---
title: pic-blog 배포 런북 (junserver)
status: planning
created: 2026-08-26
owner: jhyoon
---

# pic-blog 배포 런북 (junserver)

컨테이너 1개 + 호스트 볼륨 1개가 전부다. 설계문서 §9 의 실행 절차판.

```
[맥] rsync 소스  →  [junserver] docker compose up -d --build  →  127.0.0.1:4600
                                                                      ↑
                                              Cloudflare Tunnel (대시보드 관리형)
                                              pic-blog.jun-devlog.win → localhost:4600
```

| 항목 | 값 |
|---|---|
| ssh alias | `junserver` (LAN) / `junserver-ext` (집 밖) |
| 원격 디렉토리 | `~/apps/pic-blog` (`REMOTE_DIR` 로 변경 가능) |
| 포트 | `127.0.0.1:4600` — 루프백 전용. 8000/7000 은 nivoca 가 점유 중 |
| 볼륨 | `~/apps/pic-blog/data` → `/app/data` (SQLite + 사진) |
| 이미지 | `pic-blog:latest`, `node:22-slim` 2-stage |
| 헬스체크 | `GET /api/health` → `{"ok":true,...}` |

---

## 0. 최초 1회만 하는 것

1. **`.env.prd` 를 채운다** (로컬. gitignore 되어 있고 배포 때 scp 로 올라간다)

   | 키 | 만드는 법 |
   |---|---|
   | `NUXT_PUBLIC_MAPBOX_TOKEN` | Mapbox 대시보드. **URL 제한을 `pic-blog.jun-devlog.win` 로 건 pk 토큰** |
   | `NUXT_PUBLIC_MAPBOX_STYLE` | `mapbox://styles/junjak/...` |
   | `NUXT_SESSION_PASSWORD` | `openssl rand -base64 32` (32자 이상) |
   | `NUXT_ADMIN_PASSWORD_HASH` | `node scripts/hash-password.mjs '<비밀번호>'` |

2. **⚠ `$` 가 들어간 값은 반드시 작은따옴표로 감싼다.**

   ```dotenv
   # 틀림 — compose 가 $scrypt / $n 을 변수로 읽어 빈 문자열로 치환한다. 해시가 망가져
   # 로그인이 항상 실패하는데, 로그에는 아무것도 안 남는다.
   NUXT_ADMIN_PASSWORD_HASH=$scrypt$n=16384,r=8,p=1$....

   # 맞음
   NUXT_ADMIN_PASSWORD_HASH='$scrypt$n=16384,r=8,p=1$....'
   ```

   `scripts/deploy.sh` 가 배포 전에 이걸 검사해서 막는다. 검사에 걸리면 따옴표만 씌우면 된다.

3. **Cloudflare Tunnel ingress 확인.** `pic-blog.jun-devlog.win → http://localhost:4600` 이
   **junserver(N100) 터널**에 등록되어 있어야 한다 (2026-08-25 확인 완료, 설계문서 §9.2).
   집에 커넥터가 두 대(raspi/N100) 떠 있어서, 규칙이 raspi 쪽에 들어가면 N100 에 아무리 띄워도
   502 만 난다.

---

## 1. 배포

```bash
cd /Users/jun/develop/playground/pic-blog
./scripts/deploy.sh              # LAN
./scripts/deploy.sh junserver-ext  # 집 밖
```

스크립트가 하는 일 (순서대로):

1. `.env.prd` 필수 4개 키가 비어 있지 않은지 + `$` 따옴표 + 세션키 32자 검사 → 하나라도 걸리면 **중단**
2. `rsync -az --delete` 로 소스 전송 (`data/`, `.env*`, `node_modules`, `.output` 제외)
3. `.env.prd` 만 별도 `scp`
4. `ssh ... DOCKER_BUILDKIT=0 APP_UID=$(id -u) APP_GID=$(id -g) docker compose up -d --build`
5. `curl -sf https://pic-blog.jun-devlog.win/api/health` 를 최대 15회(약 60초) 재시도

**이미지는 서버에서 빌드한다.** 맥은 arm64, junserver 는 x86_64 이고 junserver 에는 `buildx` 가
없어서 multi-platform 빌드가 불가능하다. 로컬에서 만든 이미지를 올리는 경로는 존재하지 않는다.

### 사람이 직접 확인해야 하는 것 (스크립트가 못 하는 것)

- `/api/health` 200 은 **프로세스가 떴다**는 뜻이지 로그인이 된다는 뜻이 아니다.
  배포 후 `https://pic-blog.jun-devlog.win/editor/new` 에서 **비밀번호 로그인을 한 번 해본다.**
  (해시가 망가지는 실패 모드가 여기서만 드러난다)
- 지도 타일이 보이는지. 안 보이면 Mapbox 토큰의 URL 제한이 도메인과 맞는지 본다 (403).
- 배포 전 백업 (§3).

---

## 2. 롤백

컨테이너만 되돌리면 되는 경우 (코드 문제):

```bash
ssh junserver
cd ~/apps/pic-blog
docker images pic-blog            # 이전 이미지 ID 확인
docker compose down
docker tag <이전_이미지_ID> pic-blog:latest
DOCKER_BUILDKIT=0 APP_UID=$(id -u) APP_GID=$(id -g) docker compose up -d --no-build
curl -sf http://127.0.0.1:4600/api/health
```

> `docker compose up --build` 를 하면 다시 새 소스로 빌드해버린다. 롤백에는 `--no-build` 를 붙인다.

이전 이미지가 이미 지워졌다면 **로컬에서 되돌리고 다시 배포하는 게 빠르다** (`git checkout <커밋>`
→ `./scripts/deploy.sh`).

데이터까지 되돌려야 하는 경우 → §3 의 복구 절차.

---

## 3. 백업 / 복구

SQLite 파일 1개 + 사진 디렉토리가 전부다.

```bash
# 백업 (서버에서). 컨테이너를 세울 필요 없다 — WAL 파일까지 같이 복사한다.
ssh junserver
cd ~/apps/pic-blog
cp data/pic-blog.db     ~/backup/pic-blog-$(date +%Y%m%d).db
cp data/pic-blog.db-wal ~/backup/pic-blog-$(date +%Y%m%d).db-wal   # 있으면
tar czf ~/backup/pic-blog-photos-$(date +%Y%m%d).tar.gz data/photos
```

- **WAL 모드라 `.db` 만 복사하면 최근 쓰기가 빠질 수 있다.** `-wal` 을 같이 복사하거나,
  확실히 하려면 컨테이너를 잠깐 내리고(`docker compose stop`) 복사한다.
- 볼륨 파일은 배포 계정 소유다 (compose 의 `user:` 가 `id -u` 로 맞춰준다). `sudo` 불필요.
- 복구는 역순: `docker compose stop` → 파일 덮어쓰기 → `docker compose start`.

로컬로 받아오기:

```bash
scp junserver:~/apps/pic-blog/data/pic-blog.db ./data/pic-blog.db
```

---

## 4. 자주 보는 문제

| 증상 | 먼저 볼 것 |
|---|---|
| 502 / 연결 안 됨 | `ssh junserver 'docker compose ps'` → 컨테이너가 떠 있나. 떠 있으면 `journalctl -u cloudflared -n 50` |
| 로그인만 실패 | `.env.prd` 의 scrypt 해시 따옴표 (§0-2). 컨테이너 안 값 확인: `docker compose exec pic-blog printenv NUXT_ADMIN_PASSWORD_HASH` |
| 지도만 회색 | Mapbox 토큰 URL 제한 / `NUXT_PUBLIC_MAPBOX_STYLE` 오타 |
| 사진 업로드 후 사라짐 | 볼륨 마운트 확인: `docker compose exec pic-blog ls /app/data/photos` |
| `EACCES` 로 기동 실패 | `data/` 소유자와 `APP_UID` 불일치. `ls -ln ~/apps/pic-blog/data` 로 uid 확인 후 `chown -R $(id -u):$(id -g) data` |
| 빌드 중 `Could not find any Python` | Dockerfile 의 `python3 make g++` 설치 단계가 빠졌다 — better-sqlite3 가 소스 컴파일로 떨어질 때 필요하다 |
| `docker compose` 명령 없음 | 구버전이면 `docker-compose` 로 바꿔 실행한다 (junserver 의 compose 버전 **미확인**) |

로그:

```bash
ssh junserver 'cd ~/apps/pic-blog && docker compose logs -f --tail=100'
```

---

## 5. 주의사항 (하지 말 것)

- **`cloudflared tunnel delete` 절대 금지.** 터널이 raspi 와 공유물이라 같이 죽는다.
  터널 자체를 건드릴 일은 이 배포에 없다.
- **Cloudflare Tunnel 은 대시보드 관리형(remotely-managed)이다.** 서버에는
  `/etc/cloudflared/token` 만 있고 **ingress 규칙은 Cloudflare 대시보드에만 존재한다.**
  라우팅이 이상할 때 서버의 설정 파일을 뒤지지 마라. 없다. 로그만 `journalctl -u cloudflared`.
- **포트 8000 / 7000 을 건드리지 마라.** nivoca-api prd/stg 가 쓰고 있다. pic-blog 는 4600 고정.
- **`rsync --delete` 는 `data/` 를 제외한다.** 제외된 경로는 삭제 대상에서도 빠지므로 서버의
  DB·사진은 배포로 지워지지 않는다. 이 exclude 를 지우면 **사진이 전부 날아간다.**
- **`.env.local` 을 서버에 올리지 마라.** URL 제한 없는 Mapbox 토큰이 들어 있다.
  `.dockerignore` / rsync exclude 가 `.env*` 를 막고, `.env.prd` 만 명시적으로 올린다.
- **서버에 sharp / libvips / HEIC 디코더를 설치하지 마라.** 이미지 처리는 전부 클라이언트다
  (설계문서 §5). 서버는 바이트를 디스크에 쓰기만 한다.
- **`docker system prune -a` 조심.** 다른 서비스 이미지까지 지운다. 롤백용 이전 이미지도 사라진다.
