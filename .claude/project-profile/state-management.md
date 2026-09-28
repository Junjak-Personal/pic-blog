# State Management

## Library
- Name: **없음** (Pinia/Vuex 미사용). Vue 반응성 + Nuxt composable 로 끝낸다
- Store types: 아래 네 가지

## Store Patterns
### Pattern 1: 흐름 composable (페이지 로컬)
- Scope: 페이지
- Lifecycle: 호출할 때마다 새 상태 (컴포넌트와 함께 사라짐)
- File location: `app/composables/useXxxFlow.ts`
- Example: `app/composables/useUploadFlow.ts` — `stage` 문자열 유니언 상태 기계 + ref/computed 를 반환

### Pattern 2: 모듈 수준 ref (클라이언트 전용 싱글턴)
- Scope: 앱 전체
- Lifecycle: 영구
- Example: `app/composables/useConfirm.ts` (`askConfirm()` / `settleConfirm()`)
- 🔴 Nuxt 에서 모듈 상태는 서버 요청 사이에 공유된다. 이 패턴은 «사용자 조작으로만 채워져 서버에서는 언제나 null» 이고 직렬화가 안 되는 값(resolve 함수)일 때만 쓴다. 그 외 앱 전역 상태는 `useState`

### Pattern 3: `useState` (SSR 안전 전역)
- Example: `app/composables/useAppUpdate.ts` (`useState('app-update-ready', …)`)

### Pattern 4: 서버 데이터
- 페이지 데이터는 `useFetch` (`{ lazy: true }` 가 흔하다), 세션은 `useUserSession()` (nuxt-auth-utils)

## Reactivity Rules
- `computed` 로 파생값을 만든다 (필터·그룹·합계). 원본을 복제해 두지 않는다
- `watch` 가 app 전체에 19곳 있다. 새로 추가할 때는 이벤트 핸들러로 풀 수 없는 이유를 먼저 적는다 (전역 규칙)

## Cross-Store Dependencies
- 공유 스토어가 없으므로 페이지 → composable → `#shared/utils` 순수 함수 방향으로만 의존한다
