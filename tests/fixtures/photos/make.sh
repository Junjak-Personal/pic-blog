#!/usr/bin/env bash
# E2E·QA 용 합성 사진 픽스처. 업로드 흐름은 GPS EXIF 가 있는 사진만 받으므로(app/utils/exif.ts)
# 실제 사진 없이 그 흐름을 돌리려면 좌표·촬영 시각이 박힌 JPEG 이 필요하다.
#
# 결과 JPEG 는 커밋되어 있다 — 값을 바꿀 때만 다시 돌린다.
# 필요: macOS(sips) · exiftool · node
#
# 반경 50m(기본)로 올리면 이렇게 나와야 한다:
#   포인트 2개 — 통영 동피랑(a1·a2, 10:00·10:10) / 미륵산(b1·b2, 11:00·11:05, 약 2km 떨어짐)
#   건너뜀 1장 — x-no-gps.jpg 「위치 정보 없음」
set -euo pipefail
cd "$(dirname "$0")"

# 이름 · 색(R G B) · 위도 · 경도 · 촬영 시각. 위도·경도가 비면 GPS 를 넣지 않는다.
make_one() {
  local name=$1 r=$2 g=$3 b=$4 lat=$5 lng=$6 shot=$7
  local bmp
  bmp=$(mktemp -t picblog-fixture).bmp

  # 640×480 단색 24bit BMP — 색은 사진끼리 눈으로 구분하려는 것뿐이다
  node -e '
    const [out, r, g, b] = process.argv.slice(1)
    const w = 640, h = 480, row = w * 3, size = 54 + row * h
    const buf = Buffer.alloc(size)
    buf.write("BM", 0); buf.writeUInt32LE(size, 2); buf.writeUInt32LE(54, 10)
    buf.writeUInt32LE(40, 14); buf.writeInt32LE(w, 18); buf.writeInt32LE(h, 22)
    buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(row * h, 34)
    for (let i = 54; i < size; i += 3) { buf[i] = +b; buf[i + 1] = +g; buf[i + 2] = +r }
    require("fs").writeFileSync(out, buf)
  ' "$bmp" "$r" "$g" "$b"

  sips -s format jpeg -s formatOptions 80 "$bmp" --out "$name" >/dev/null
  rm -f "$bmp"

  local args=(-overwrite_original -q -Make=pic-blog -Model='QA fixture' "-DateTimeOriginal=$shot")
  if [ -n "$lat" ]; then
    args+=("-GPSLatitude=$lat" -GPSLatitudeRef=N "-GPSLongitude=$lng" -GPSLongitudeRef=E)
  fi
  exiftool "${args[@]}" "$name"
}

make_one a1-dongpirang.jpg 200 80 80  34.845300 128.427500 '2026:03:14 10:00:00'
make_one a2-dongpirang.jpg 200 120 80 34.845350 128.427560 '2026:03:14 10:10:00'
make_one b1-mireuksan.jpg  80 80 200  34.827800 128.420000 '2026:03:14 11:00:00'
make_one b2-mireuksan.jpg  80 120 200 34.827850 128.420060 '2026:03:14 11:05:00'
make_one x-no-gps.jpg      120 120 120 '' '' '2026:03:14 10:30:00'

ls -l ./*.jpg
