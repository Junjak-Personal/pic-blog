# BuildKit 없이 빌드된다 (junserver 는 buildx 가 없고 DOCKER_BUILDKIT=0 고정 — 설계문서 §9.1).
# 그래서 --mount=type=cache / heredoc / COPY --link / --platform 을 일절 쓰지 않는다.
#
# Node 22 LTS 로 고정: 로컬은 24 지만 better-sqlite3(네이티브 애드온)의 prebuild 가 가장 넓게
# 깔린 라인이 LTS 다. 빌드/런타임 스테이지가 **같은 태그**라 glibc·N-API ABI 가 자동으로 맞는다.

FROM node:22-slim AS build
WORKDIR /app

# better-sqlite3 의 install 스크립트는 prebuild 내려받기에 실패하면 node-gyp 컴파일로 떨어진다.
# (실측: 툴체인 없이 빌드하면 "Could not find any Python installation" 으로 install 이 죽는다)
# 배포가 GitHub 릴리스 응답에 좌우되지 않도록 툴체인을 둔다 — 이 스테이지는 최종 이미지에 안 남는다.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

RUN npm i -g pnpm@11

# 의존성 레이어를 소스와 분리한다. 소스만 바뀐 배포는 이 레이어를 캐시로 건너뛴다.
# nuxt.config.ts / tsconfig.json 은 postinstall 의 `nuxt prepare` 가 읽는다.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nuxt.config.ts tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# 네이티브 애드온이 산출물에서 실제로 "로드되는지" 확인한다. 파일 존재만으로는 부족하다 —
# 아키텍처/glibc 가 어긋나면 로드 시점에 죽는다. 런타임에 죽는 대신 여기서 빌드를 깨뜨린다.
RUN cd .output/server \
 && node -e "const D=require('better-sqlite3'); new D(':memory:').prepare('select 1').get()"


FROM node:22-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
# 컨테이너 내부는 0.0.0.0 으로 열어야 도커 포트 매핑이 도달한다.
# 외부 노출 제한(127.0.0.1)은 compose 의 포트 바인딩이 담당한다 — 여기서 127.0.0.1 로
# 묶으면 호스트에서 접속 자체가 안 된다.
ENV HOST=0.0.0.0
ENV PORT=4600
# SQLite 파일 + 사진 디렉토리. 호스트 ./data 가 여기 마운트된다.
ENV NUXT_DATA_DIR=/app/data

COPY --from=build /app/.output ./.output
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 루트로 시작해 볼륨 소유권만 맞추고 곧바로 node(uid 1000)로 강등한다.
# USER node 로 고정하면 호스트 소유 볼륨에서 EACCES 로 죽는다 (엔트리포인트 주석 참조).
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

EXPOSE 4600
CMD ["node", ".output/server/index.mjs"]
