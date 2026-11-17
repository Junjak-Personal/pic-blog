import { describe, expect, it } from 'vitest'
import { absoluteSiteUrl, postDescription, serializeJsonLd } from './seo.ts'

describe('검색·공유 정보의 경계', () => {
  it('상대 경로와 쿼리·한글을 공개 주소의 절대 URL 로 만든다', () => {
    expect(absoluteSiteUrl('/p/record-20260930', 'https://example.com/')).toBe('https://example.com/p/record-20260930')
    expect(absoluteSiteUrl('/photos/여행.jpg?v=1&size=large', 'https://example.com'))
      .toBe('https://example.com/photos/%EC%97%AC%ED%96%89.jpg?v=1&size=large')
  })

  it('빈 요약은 실제 기록 정보로 대체하고 긴 유니코드 요약은 글자 중간에서 자르지 않는다', () => {
    const post = { title: '여행 기록', summary: ' \n ', point_count: 2, photo_count: 8 }
    expect(postDescription(post)).toBe('여행 기록. 2곳의 여행 포인트와 사진 8장으로 남긴 여행 기록.')
    expect(postDescription({ ...post, summary: '  첫째 날\n\t둘째 날  ' })).toBe('첫째 날 둘째 날')
    expect(postDescription({ ...post, summary: '📷'.repeat(161) })).toBe(`${'📷'.repeat(159)}…`)
  })

  it('제목·요약의 HTML 이 JSON-LD 스크립트를 끝내거나 실행 가능한 태그를 만들 수 없다', () => {
    const data = { headline: '</script><script>alert(1)</script>', description: '「<여행>」 & "사진"' }
    const serialized = serializeJsonLd(data)
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized)).toEqual(data)
  })
})
