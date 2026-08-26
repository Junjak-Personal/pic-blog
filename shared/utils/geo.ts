/** 하버사인 거리 (km). data.js 의 km() 을 그대로 옮긴 것. 인자는 [lat, lng] 순서다. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]) {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLon = ((b[1] - a[1]) * Math.PI) / 180
  const la1 = (a[0] * Math.PI) / 180
  const la2 = (b[0] * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function distanceM(a: readonly [number, number], b: readonly [number, number]) {
  return distanceKm(a, b) * 1000
}

/**
 * 🔴 좌표 순서 반전 지점. DB/EXIF 는 lat/lng, Mapbox GL JS 는 GeoJSON 규약이라 [lng, lat] 다.
 * 지도에 좌표를 넘기는 모든 곳은 반드시 이 함수를 통과시킨다 — 놓치면 마커가 지구 반대편에 찍힌다.
 */
export function toLngLat(p: { lat: number; lng: number }): [number, number] {
  return [p.lng, p.lat]
}

/** [[west, south], [east, north]] — Mapbox fitBounds 형식. */
export function boundsOf(
  items: ReadonlyArray<{ lat: number; lng: number }>,
): [[number, number], [number, number]] | null {
  if (!items.length) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const it of items) {
    if (it.lng < w) w = it.lng
    if (it.lng > e) e = it.lng
    if (it.lat < s) s = it.lat
    if (it.lat > n) n = it.lat
  }
  return [
    [w, s],
    [e, n],
  ]
}

export function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}
