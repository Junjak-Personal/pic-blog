export default defineEventHandler(async (event) => {
  // 세션이 있으면 비공개 기록도 목록에 보인다 (/editor 가 같은 엔드포인트를 쓴다)
  const session = await getUserSession(event)
  return listPosts(!!session.user)
})
