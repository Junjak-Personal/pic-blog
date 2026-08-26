/**
 * 새 배포 감지.
 *
 * 홈 화면에 추가한 앱은 브라우저처럼 매번 새로 열리지 않는다 — iOS 가 프로세스를
 * 재우고 그대로 깨우기 때문에, 배포를 해도 며칠 전 화면이 계속 떠 있을 수 있다.
 * 그래서 서버의 빌드 표식을 물어보고 다를 때 알린다.
 *
 * 서비스워커를 쓰지 않는 이유는 그게 필요 없기 때문이다 — 오프라인 캐시가 없으니
 * 낡는 건 「이미 열려 있는 페이지」 하나뿐이고, 그건 새로고침이면 끝난다.
 * SW 를 넣으면 업로드 POST/PUT 이 가로채여 조용히 망가질 위험만 는다.
 *
 * 🔴 스스로 새로고침하지 않는다. 편집 중이면 저장 안 된 초안이 통째로 날아간다.
 *    알리기만 하고 누를지는 사용자가 정한다.
 */
const CHECK_INTERVAL_MS = 10 * 60 * 1000

export function useAppUpdate() {
  const current = useRuntimeConfig().public.buildId
  const updateReady = useState('app-update-ready', () => false)

  async function check() {
    if (updateReady.value) return
    try {
      const r = await $fetch<{ buildId: string }>('/api/version', {
        // 낡은 응답을 받으면 영원히 못 알아챈다
        headers: { 'cache-control': 'no-cache' },
      })
      if (r.buildId && r.buildId !== current) updateReady.value = true
    } catch {
      // 오프라인이거나 배포 중일 수 있다. 다음 차례에 다시 본다.
    }
  }

  function apply() {
    // reload(true) 는 표준이 아니다. 쿼리를 붙여 확실히 새 문서를 받는다.
    const u = new URL(window.location.href)
    u.searchParams.set('_v', Date.now().toString(36))
    window.location.replace(u.toString())
  }

  onMounted(() => {
    check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    // 앱을 다시 열었을 때가 가장 확률이 높다 — 재웠다 깨우는 순간에 본다
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    onBeforeUnmount(() => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    })
  })

  return { updateReady, apply }
}
