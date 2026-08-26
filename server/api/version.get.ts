/**
 * 현재 서버가 서빙 중인 빌드 표식.
 * 실행 중인 앱이 주기적으로 자기 값과 비교해 새 배포를 알아챈다.
 * 캐시되면 의미가 없으므로 확실히 막는다.
 */
export default defineEventHandler((event) => {
  setHeaders(event, { 'cache-control': 'no-store' })
  return { buildId: useRuntimeConfig().public.buildId }
})
