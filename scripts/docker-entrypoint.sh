#!/bin/sh
# 마운트된 볼륨(호스트 ./data)은 호스트 계정 소유라 컨테이너 유저 node(uid 1000)가
# 쓰지 못한다 — 그대로 두면 첫 요청에서 EACCES 로 500 이 나고, 로그를 안 보면
# 코드 버그로 오인한다. 루트로 소유권만 맞춘 뒤 즉시 node 로 떨어진다.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p "${NUXT_DATA_DIR:-/app/data}/photos"
  chown -R node:node "${NUXT_DATA_DIR:-/app/data}"
  # setpriv 는 fork 없이 그대로 exec 한다 — node 가 PID 1 이 되어야
  # docker stop 의 SIGTERM 이 곧장 닿고 SQLite 가 깨끗이 닫힌다.
  # (runuser 는 fork 해서 root 가 PID 1 로 남는다)
  exec setpriv --reuid=node --regid=node --init-groups -- "$@"
fi

# 이미 비루트로 실행됐다면 (compose 의 user: 지정 등) 그대로 간다
exec "$@"
