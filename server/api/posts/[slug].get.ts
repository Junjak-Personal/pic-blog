export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')
  if (!slug) throw createError({ statusCode: 400, statusMessage: 'slug 가 없습니다' })

  const session = await getUserSession(event)
  const isEditor = !!session.user

  const post = getPost(slug, true)
  if (!post) throw createError({ statusCode: 404, statusMessage: '기록을 찾을 수 없습니다' })

  if (!post.is_public && !isEditor) {
    // 아트보드 1c 「비공개 기록입니다」 — 통계와 기간만 주고 좌표·사진은 주지 않는다
    throw createError({
      statusCode: 403,
      statusMessage: '비공개 기록입니다',
      data: {
        private: true,
        title: post.title,
        point_count: post.point_count,
        photo_count: post.photo_count,
        started_at: post.started_at,
        ended_at: post.ended_at,
      },
    })
  }

  return post
})
