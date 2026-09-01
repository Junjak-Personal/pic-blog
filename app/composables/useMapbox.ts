/**
 * Mapbox GL JS v3 부트스트랩.
 *
 * 실패 판정이 이 파일의 핵심이다. 스타일 로드 중에는 비치명적 에러(스프라이트·타일 404 등)가
 * 여러 개 나오는 게 정상이라, 아무 에러에나 폴백으로 떨어뜨리면 멀쩡한 지도가 죽는다.
 * 반대로 아예 판정하지 않으면 1c 「지도를 불러올 수 없습니다」 폴백이 영영 안 뜬다.
 *
 * 판정 규칙:
 *   - 토큰이 없다                      → 즉시 failed
 *   - 스타일/토큰 인증 실패 (401·403)  → 즉시 failed
 *   - LOAD_TIMEOUT 안에 load 이벤트 없음 → failed
 *   - 그 외 에러                        → 로그만 남기고 지도는 계속 간다
 */
import mapboxgl from 'mapbox-gl'

export type MapStatus = 'loading' | 'ready' | 'failed'

const LOAD_TIMEOUT = 12_000

export interface UseMapboxOptions {
  container: Ref<HTMLElement | null>
  /** [[west, south], [east, north]] — Mapbox 규약. boundsOf() 를 통과시킨 값만 넘긴다. */
  bounds: Ref<[[number, number], [number, number]] | null>
  padding?: { top: number; right: number; bottom: number; left: number }
  interactive?: boolean
  /**
   * Mapbox 로고·attribution 위치. 무료 플랜에서 제거할 수 없으므로 (설계문서 §6.3)
   * 화면 하단을 상세 시트가 덮는 레이아웃에서는 top-left 로 옮겨야 가려지지 않는다.
   */
  controlPosition?: 'top-left' | 'bottom-right'
  /**
   * 축척 막대(「200 m」)를 단다. 위도에 따라 같은 줌도 실제 거리가 달라지므로,
   * 「이 지도에서 지금 1px 이 몇 m 인가」는 줌 숫자가 아니라 이것이 말해준다.
   */
  scale?: boolean
  /**
   * Mapbox v3 는 저줌에서 globe 투영으로 전환한다. 넓은 범위를 낮고 넓은 띠에 담는
   * 목록 지도(아트보드 1a)는 지구본이 되어버리므로 mercator 로 고정한다.
   */
  projection?: 'globe' | 'mercator'
  /** fitBounds 상한. 좁은 띠에서는 낮춰 잡아야 마커가 뭉치지 않는다. */
  maxZoom?: number
  /**
   * 컨테이너 크기가 바뀔 때마다 다시 fit 한다.
   * 개요용 지도(목록 상단 띠)는 늘 「전부 보이는」 상태가 맞다. 상세 지도처럼 사용자가
   * 직접 확대·이동하는 화면에서는 켜면 안 된다 — 조작한 시야를 도로 되돌려 버린다.
   */
  refitOnResize?: boolean
}

/** AJAX 실패는 status 를 달고 온다. 라이브러리 타입 밖이라 경계에서 좁힌다. */
function httpStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('status' in err)) return null
  const s = (err as { status: unknown }).status
  return typeof s === 'number' ? s : null
}

export function useMapbox(options: UseMapboxOptions) {
  const config = useRuntimeConfig()
  const status = ref<MapStatus>('loading')
  const map = shallowRef<mapboxgl.Map | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let observer: ResizeObserver | null = null

  /**
   * 패딩 합이 컨테이너보다 크면 Mapbox 가 fit 을 포기하고 스타일 기본 중심(도쿄)에 머문다.
   * 좁은 뷰포트에서 지도가 엉뚱한 곳을 보여주는 조용한 실패라 여기서 반드시 클램프한다.
   */
  function clampPadding(m: mapboxgl.Map) {
    const p = options.padding ?? { top: 60, right: 60, bottom: 60, left: 60 }
    const w = m.getContainer().clientWidth
    const h = m.getContainer().clientHeight
    const scaleX = p.left + p.right >= w * 0.8 ? (w * 0.8) / (p.left + p.right) : 1
    const scaleY = p.top + p.bottom >= h * 0.8 ? (h * 0.8) / (p.top + p.bottom) : 1
    return {
      top: Math.max(8, Math.floor(p.top * scaleY)),
      bottom: Math.max(8, Math.floor(p.bottom * scaleY)),
      left: Math.max(8, Math.floor(p.left * scaleX)),
      right: Math.max(8, Math.floor(p.right * scaleX)),
    }
  }

  function fit(animate = false) {
    const m = map.value
    if (!m || !options.bounds.value) return
    m.fitBounds(options.bounds.value, { padding: clampPadding(m), maxZoom: options.maxZoom ?? 15, animate })
  }

  function teardown() {
    if (timer) clearTimeout(timer)
    timer = null
    observer?.disconnect()
    observer = null
    map.value?.remove()
    map.value = null
  }

  function boot() {
    const el = options.container.value
    const token = config.public.mapboxToken

    if (!el) return
    if (!token) {
      status.value = 'failed'
      console.warn('[pic-blog] NUXT_PUBLIC_MAPBOX_TOKEN 이 없습니다')
      return
    }

    status.value = 'loading'

    try {
      mapboxgl.accessToken = token
      const corner = options.controlPosition ?? 'bottom-right'
      const m = new mapboxgl.Map({
        container: el,
        style: config.public.mapboxStyle,
        // 목업이 상호작용을 꺼둔 건 아트보드라서다 — 실제 앱은 켠다
        interactive: options.interactive ?? true,
        projection: options.projection ?? 'mercator',
        // 기본 attribution 대신 compact 버전을 직접 붙인다 (아래)
        attributionControl: false,
        logoPosition: corner,
      })
      // compact = 'ⓘ' 버튼 하나로 접힌다. 지우는 게 아니라 자리를 덜 먹게 하는 것이다.
      m.addControl(new mapboxgl.AttributionControl({ compact: true }), corner)
      // 로고·attribution 과 겹치지 않게 반대쪽 아래에 둔다 (corner 는 top-left 이거나 bottom-right)
      if (options.scale) {
        m.addControl(new mapboxgl.ScaleControl({ unit: 'metric', maxWidth: 96 }), 'bottom-right')
      }

      timer = setTimeout(() => {
        if (status.value === 'loading') {
          status.value = 'failed'
          console.warn('[pic-blog] 지도 로드 타임아웃')
        }
      }, LOAD_TIMEOUT)

      m.on('load', () => {
        if (timer) clearTimeout(timer)
        status.value = 'ready'
        fit(false)
      })

      // 컨테이너가 리사이즈되면 Mapbox 가 캔버스를 다시 잡도록 알린다
      observer = new ResizeObserver(() => {
        m.resize()
        // 크기가 바뀌면 예전 크기로 계산한 시야는 더 이상 「전부 보이는」 시야가 아니다
        if (options.refitOnResize && status.value === 'ready') fit(false)
      })
      observer.observe(el)

      m.on('error', (e) => {
        const err: unknown = e.error
        const code = httpStatus(err)
        const message = err instanceof Error ? err.message : String(err)
        if (code === 401 || code === 403) {
          // 토큰이 잘못됐거나 URL 제한에 막혔다 — 재시도해도 소용없다
          status.value = 'failed'
          console.warn(`[pic-blog] mapbox 인증 실패 (HTTP ${code}) — 토큰/URL 제한 확인`)
          return
        }
        // 타일 하나 실패로 지도를 죽이지 않는다
        console.warn(`[pic-blog] mapbox 경고: ${message}`)
      })

      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
      map.value = m
    } catch (e) {
      status.value = 'failed'
      console.warn('[pic-blog] mapbox 초기화 실패', e)
    }
  }

  /** 1c 「다시 시도」 */
  function retry() {
    teardown()
    boot()
  }

  onMounted(boot)
  onBeforeUnmount(teardown)

  return { map, status, fit, retry }
}
