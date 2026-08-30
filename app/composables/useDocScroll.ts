/**
 * 이 화면에서는 «문서»가 굴러가게 한다 (좁은 화면 전용).
 *
 * 이 앱의 기본 규약은 반대다 — 셸이 뷰포트에 고정되고 그 «안»의 한 칸만 굴러간다
 * (layouts/editor.vue). 지도가 있는 화면에서 헤더와 지도가 밀려 올라가지 않게 하려는
 * 규칙이고, 거기서는 여전히 옳다.
 *
 * 그런데 폼만 있는 화면에서는 그 규약이 아이폰 키보드와 정면으로 부딪힌다. 문서가
 * 굴러갈 여지가 없으면 WebKit 은 캐럿을 올릴 방법이 없어 «시각 뷰포트»를 통째로 민다.
 * 기기 실측(진단 로그, 같은 화면 A/B):
 *
 *   고정 셸   focusIN sy=0  →  sy=-396(키보드 높이) 밀림  →  17ms 뒤 되돌림
 *             한두 프레임 동안 화면이 튀고, 되돌리지 않으면 밀린 채로 남는다.
 *
 *   문서 스크롤 focusIN sy=70 →  sy=153 «정상 스크롤»(캐럿이 딱 올라온 만큼)
 *             밀림 없음. 되돌아오지도 않는다 — 그 자리가 맞는 자리라서다.
 *             키보드가 올라오는 동안 뷰포트도 42→30→22→…→0 으로 부드럽게 수렴한다.
 *
 * 대가는 하나다: 타이핑 중 상단바와 단계 표시가 함께 밀려 올라간다. 모바일 폼에서는
 * 보통의 동작이고, 위 튐과 바꿀 만하다.
 *
 * 🔴 데스크탑에는 걸지 않는다. 가상 키보드가 없어 얻을 것이 없고, 고정 셸 쪽이 낫다.
 *    그 판단은 CSS 가 한다 (base.css 의 html.doc-scroll 규칙이 좁은 화면 안에 있다).
 *    여기서는 «이 화면이 그런 화면인가»만 표시한다.
 */
export function useDocScroll(enabled: Ref<boolean>) {
  const sync = () => {
    const root = document.documentElement
    root.classList.toggle('doc-scroll', enabled.value)
    // 이 모드에서는 셸 높이를 묶지 않는다 — CSS 가 어차피 이기지만 남은 값이 상태를 헷갈리게 한다
    if (enabled.value) root.style.removeProperty('--vvh')
  }

  watch(enabled, sync)
  // 처음 들어올 때도 한 번 — watch 는 값이 «바뀔» 때만 울린다
  onMounted(sync)
  onBeforeUnmount(() => document.documentElement.classList.remove('doc-scroll'))
}
