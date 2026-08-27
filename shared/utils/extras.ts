/**
 * 포인트 기타 정보 — 링크와 소비 금액.
 *
 * point 행에 JSON 문자열로 담는다 (tags 가 이미 쓰고 있는 길이다). 자식 테이블을
 * 만들지 않은 이유는 이 값들을 언제나 포인트와 «함께» 읽고 함께 쓰기 때문이다 —
 * SQL 로 골라내거나 합산할 일이 없고(합계는 화면이 낸다), 조인만 하나 더 늘어난다.
 *
 * 파싱은 전부 방어적이다. DB 의 TEXT 열은 언제든 손으로 고쳐질 수 있고, 그 한 줄
 * 때문에 상세 화면 전체가 500 이 되면 안 된다 — 못 읽는 항목은 조용히 버린다.
 */

export interface PointLink {
  /** 표시 이름. 비어 있으면 화면이 도메인을 대신 보여준다 (linkLabel). */
  label: string
  url: string
}

export interface PointExpense {
  item: string
  amount: number
  currency: CurrencyCode
}

/**
 * 다룰 화폐. 여행 다니는 범위에 맞춘 목록이고, 필요해지면 여기 한 줄을 더한다.
 * 라벨은 사용자가 쓰는 말 그대로다 — 「TWD」 보다 「대만달러」 가 읽힌다.
 */
export const CURRENCIES = [
  { code: 'KRW', label: '원' },
  { code: 'JPY', label: '엔' },
  { code: 'USD', label: '달러' },
  { code: 'TWD', label: '대만달러' },
  { code: 'HKD', label: '홍콩달러' },
  { code: 'EUR', label: '유로' },
  { code: 'CNY', label: '위안' },
  { code: 'VND', label: '동' },
  { code: 'THB', label: '바트' },
] as const

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export const DEFAULT_CURRENCY: CurrencyCode = 'KRW'

const LABEL = new Map<string, string>(CURRENCIES.map((c) => [c.code, c.label]))

export function isCurrency(v: string): v is CurrencyCode {
  return LABEL.has(v)
}

/** 신뢰 경계에서 쓰는 상한 — 서버 검증과 편집 화면이 같은 값을 본다. */
export const MAX_LINKS = 20
export const MAX_EXPENSES = 60
export const MAX_URL = 500
export const MAX_LINK_LABEL = 60
export const MAX_ITEM = 60
/** 동(VND)은 자릿수가 크다 — 1조이면 어떤 화폐로도 오타다. */
export const MAX_AMOUNT = 1e12

/**
 * 12300 · KRW → '12,300원'.
 *
 * Intl 의 currency 표기를 쓰지 않는다. ko-KR 에서 JPY 가 'JP¥', THB 가 'THB ' 로
 * 나와 화면이 갑자기 코드로 말하기 시작한다. 사용자가 쓰는 말(원·엔·바트)로 적는다.
 * 기호(¥)도 쓸 수 없다 — 엔과 위안이 같은 기호라 둘이 구분되지 않는다.
 */
export function formatMoney(amount: number, currency: CurrencyCode) {
  const n = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(amount)
  return `${n}${LABEL.get(currency) ?? currency}`
}

/**
 * 화폐별 합계. 섞여 있으면 섞어서 더하지 않는다 — 환율을 여기서 정하는 순간
 * 「언제의 환율인가」가 따라붙고, 그건 이 앱이 답할 수 없는 질문이다.
 * 순서는 CURRENCIES 순이 아니라 «적은 순»이다 (합계가 항목 아래에 붙으므로).
 */
export function totalsOf(expenses: readonly PointExpense[]) {
  const sums = new Map<CurrencyCode, number>()
  for (const e of expenses) sums.set(e.currency, (sums.get(e.currency) ?? 0) + e.amount)
  return [...sums].map(([currency, amount]) => ({ currency, amount }))
}

/** 구글 지도 좌표 검색 — Maps URLs API 의 공식 형식. */
export function googleMapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
}

/**
 * 눌러도 되는 주소인가 — http/https 만.
 * 🔴 javascript: 는 링크 한 번 누르면 스크립트가 된다. 저장할 때(서버)와 그릴 때(화면)
 *    양쪽에서 본다 — 이미 들어와 있는 행이 있을 수 있으므로 화면도 자기 몫을 확인한다.
 */
export function isSafeUrl(url: string) {
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:'
  } catch {
    return false
  }
}

/** 이름이 없는 링크가 보여줄 것 — 주소 전체를 흘리면 줄이 넘친다. */
export function linkLabel(l: PointLink) {
  const named = l.label.trim()
  if (named) return named
  try {
    return new URL(l.url).hostname.replace(/^www\./, '')
  } catch {
    return l.url
  }
}

/**
 * 저장할 형태로 다듬는다 — 앞뒤 공백을 털고, 안 채운 줄을 버리고, 금액의 부동소수 꼬리를 자른다.
 *
 * 🔴 서버와 편집 화면이 «같은» 함수를 써야 한다. 화면이 「+」로 만든 빈 줄을 서버만 버리면
 *    저장한 뒤에도 초안과 서버 값이 어긋나 「변경 1건」이 영영 사라지지 않는다.
 */
export function cleanLinks(links: readonly PointLink[]): PointLink[] {
  return links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })).filter((l) => l.url)
}

export function cleanExpenses(expenses: readonly PointExpense[]): PointExpense[] {
  return expenses
    .map((e) => ({
      item: e.item.trim(),
      // 숫자가 아닌 입력은 0 이다 — 품목까지 비어 있으면 아래에서 버려진다
      amount: isFinite(e.amount) ? Math.round(e.amount * 100) / 100 : 0,
      currency: e.currency,
    }))
    .filter((e) => e.item || e.amount)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function parseArray(raw: string): unknown[] {
  try {
    const v: unknown = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

export function parseLinks(raw: string): PointLink[] {
  return parseArray(raw)
    .filter(isRecord)
    .filter((o): o is { label?: unknown; url: string } => typeof o.url === 'string')
    .map((o) => ({ label: typeof o.label === 'string' ? o.label : '', url: o.url }))
    .slice(0, MAX_LINKS)
}

export function parseExpenses(raw: string): PointExpense[] {
  return parseArray(raw)
    .filter(isRecord)
    .flatMap((o) => {
      const { item, amount, currency } = o
      if (typeof amount !== 'number' || !isFinite(amount)) return []
      if (typeof currency !== 'string' || !isCurrency(currency)) return []
      return [{ item: typeof item === 'string' ? item : '', amount, currency }]
    })
    .slice(0, MAX_EXPENSES)
}
