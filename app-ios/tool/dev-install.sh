#!/usr/bin/env bash
#
# 폰에 «개발용» 껍데기를 따로 설치한다 — 로컬 dev 서버를 바라본다.
#
# 운영용(win.jundevlog.picblog)과 번들 id 가 달라 두 앱이 나란히 산다. 홈 화면에서는
# 이름으로 구분한다: 「pic-blog」 / 「pic-blog dev」.
#
# 왜 필요한가: 웹만 고쳐도 폰에서 보려면 운영에 배포해야 했다. 키보드처럼 «기기에서만»
# 재현되는 문제는 그 왕복이 한 번에 몇 분씩 든다. 이 껍데기는 맥의 dev 서버를 직접 본다.
#
#   사용:  pnpm dev --host 0.0.0.0   (맥에서 먼저 띄운다)
#          app-ios/tool/dev-install.sh
#
# 🔴 http 로 맥을 부르는데도 ATS 예외가 필요 없는 이유는 «.local» 이름을 쓰기 때문이다.
#    Info.plist 의 NSAllowsLocalNetworking 이 정확히 그 경우를 연다. 192.168.x.x 같은
#    사설 IP 는 그 예외에 들지 않으므로(링크로컬이 아니다) 여기서는 쓰지 않는다.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${PORT:-4600}"
HOST="${HOST:-$(scutil --get LocalHostName).local}"
SITE="${SITE:-http://${HOST}:${PORT}}"
BUNDLE_ID="${BUNDLE_ID:-win.jundevlog.picblog.dev}"
APP_NAME="${APP_NAME:-pic-blog dev}"

echo "▸ 대상   $SITE"
echo "▸ 번들   $BUNDLE_ID  («${APP_NAME}»)"

# dev 서버가 실제로 살아 있는지 먼저 본다 — 안 그러면 앱이 빈 화면으로 뜨고 이유를 모른다
if ! curl -fsS -o /dev/null --max-time 5 "$SITE/api/health"; then
  echo "✗ $SITE 가 응답하지 않습니다. 맥에서 먼저: pnpm dev --host 0.0.0.0" >&2
  exit 1
fi

# 폰 찾기 — 여러 대면 DEVICE 로 지정한다
# 🔴 열 위치로 자르면 안 된다 — 기기 «이름»에 공백이 있어 열이 밀린다
#    (「iPhone 15 Pro」 때문에 실제로 "Pro" 를 기기 id 로 잡았다). UUID 모양으로 찾는다.
DEVICE="${DEVICE:-$(xcrun devicectl list devices 2>/dev/null \
  | awk '/iPhone/ && /available/ {
      for (i = 1; i <= NF; i++) if ($i ~ /^[0-9A-F]{8}-[0-9A-F]{4}-/) { print $i; exit }
    }')}"
if [ -z "$DEVICE" ]; then
  echo "✗ 연결된 아이폰을 못 찾았습니다. xcrun devicectl list devices 로 확인하세요." >&2
  exit 1
fi
echo "▸ 기기   $DEVICE"

# 1) Dart 쪽 define 과 Xcode 설정만 만든다 (--config-only 는 빌드하지 않는다)
flutter build ios --release --config-only --dart-define="SITE=$SITE"

# 2) 번들 id·이름은 여기서 덮어쓴다. 명령줄 빌드 설정이 xcconfig 보다 우선한다.
#    -allowProvisioningUpdates 가 새 번들 id 의 프로비저닝 프로파일을 알아서 만든다.
xcodebuild -workspace ios/Runner.xcworkspace -scheme Runner \
  -configuration Release -destination "generic/platform=iOS" \
  -derivedDataPath build/dev-dd \
  -allowProvisioningUpdates \
  APP_BUNDLE_ID="$BUNDLE_ID" \
  APP_DISPLAY_NAME="$APP_NAME" \
  build

APP="build/dev-dd/Build/Products/Release-iphoneos/Runner.app"
[ -d "$APP" ] || { echo "✗ 빌드 산출물이 없습니다: $APP" >&2; exit 1; }

# 심어진 값이 의도대로인지 확인하고 넘어간다 — 잘못된 대상을 조용히 설치하지 않는다
echo "▸ 확인   id=$(defaults read "$PWD/$APP/Info" CFBundleIdentifier)  이름=$(defaults read "$PWD/$APP/Info" CFBundleDisplayName)"
if grep -rl --binary-files=text -F "$SITE" "$APP" >/dev/null 2>&1; then
  echo "▸ 확인   번들 안에 $SITE 가 들어 있습니다"
else
  echo "✗ 번들에 $SITE 가 없습니다 — 엉뚱한 대상을 설치할 뻔했습니다" >&2
  exit 1
fi

xcrun devicectl device install app --device "$DEVICE" "$APP"
echo "✓ 설치 완료 — 홈 화면의 «${APP_NAME}» 을 여세요"
