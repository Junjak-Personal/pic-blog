<script setup lang="ts">
/**
 * 사진 한 칸 — 편집 2단계 보드와 3단계 사진 목록이 «같은 것»을 쓴다.
 *
 * 두 단계가 각자 그리던 동안 번호·배지·시각 줄이 조금씩 어긋났고(배지 left 4px 대 5px,
 * 대표 배지 색이 서로 달랐다), 한쪽만 고치는 일이 반복됐다. 겉(사진·번호·배지·시각)은
 * 이제 여기 하나뿐이고, 단계마다 다른 것(삭제·드래그 손잡이)만 슬롯으로 받는다.
 *
 * 🔴 루트가 여럿인 «프래그먼트»다 — 감싸는 상자는 부모가 만든다. 2단계는 드래그를 받는
 *    div, 3단계는 눌러서 고르는 button 이라 태그가 다르고, button 안에 button(삭제·손잡이)을
 *    넣을 수는 없다. 그래서 자리잡기(position: relative)와 폭·모서리는 부모 몫이다.
 */
import { vSk } from '~/utils/img'
import type { Photo } from '#shared/types/db'
import { formatTime } from '#shared/utils/format'

const props = defineProps<{
  photo: Photo
  /** 화면에 뜨는 번호 (1부터) */
  num: number
  /** 이 포인트의 대표 사진인가 — 지도 마커에 뜨는 한 장 */
  rep: boolean
  /** 이 기록의 커버인가 — 목록 카드에 뜨는 한 장 */
  cover: boolean
}>()
</script>

<template>
  <img
    v-sk
    class="thumb sk"
    :src="props.photo.thumb_path"
    :alt="`사진 ${props.num}`"
    loading="lazy"
    draggable="false"
  >
  <span class="mono ord">{{ String(props.num).padStart(2, '0') }}</span>
  <!--
    기록 커버(목록 카드에 뜨는 한 장)와 포인트 대표(지도 마커)는 «다른 값»이라 한 사진에
    둘 다 붙을 수 있다. 한 줄로 붙여 놓으면 두 꼬리표가 한 덩어리로 읽히므로 양 끝으로
    갈라 놓는다 — 왼쪽이 대표(이 포인트), 오른쪽이 커버(이 기록).
  -->
  <span v-if="props.rep" class="mono rep">대표</span>
  <span v-if="props.cover" class="mono cover">커버</span>
  <!-- 오른쪽 위 모서리 — 2단계의 삭제(✕). 3단계는 지울 수 없어 비어 있다. -->
  <slot name="corner" />
  <span class="bar">
    <span class="mono shot">{{ formatTime(props.photo.shot_at) || '시각 없음' }}</span>
    <!-- 시각 오른쪽 — 2단계의 드래그 손잡이. 3단계는 끌 것이 없어 비어 있다. -->
    <slot name="bar" />
  </span>
</template>

<style scoped>
.thumb {
  display: block;
  width: 100%;
  /* 고정 높이다 — auto 로 두면 세로 사진이 칸을 부풀려 격자가 들쭉날쭉해진다.
     값은 tokens.css 에 있다 — 「사진 추가」 칸과 드롭 표식이 같은 값을 읽어야 한다. */
  height: var(--tile-img-h);
  object-fit: cover;
  /* 이미지 자신에게도 걸어야 한다 — iOS 의 「사진 저장」 시트는 <img> 를 보고 뜬다 */
  -webkit-touch-callout: none;
  -webkit-user-drag: none;
  /* 포인터는 감싼 상자가 받는다 — 이미지가 가로채면 드래그도 클릭도 여기서 끊긴다 */
  pointer-events: none;
}

.ord {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: var(--fs-micro);
  background: rgb(var(--s0-rgb) / 0.72);
  color: var(--mid);
}

/*
 * 배지 — 사진 «아래쪽»에 붙인다. 위에 두면 번호(.ord)와 삭제(✕) 사이에 끼어
 * 좁은 화면(3열)에서 「커버」가 ✕ 에 잘렸다. 아래는 시각 줄 위라 비어 있다.
 */
.rep, .cover {
  position: absolute;
  bottom: calc(var(--tile-bar-h) + 4px);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: var(--fs-micro);
}
/* 이 포인트의 대표 — 왼쪽.
   🔴 예전엔 밝은 연두 바탕에 검정 글자였는데 사진 위에서 글자가 안 읽혔다.
      바탕을 어둡게 내리고 글자를 밝게 올린다 (커버와 명암이 반대라 구분도 쉬워진다).
   바탕은 주 버튼과 «같은» 값이다 (--primary-fill). 배지만 쓰는 짙은 초록을 따로 두면
   팔레트에 색이 하나 더 늘고 화면이 그만큼 노이지해진다 — 역할이 같으니 값도 하나다. */
.rep { left: 4px; background: var(--primary-fill); color: var(--ink); }
/* 이 기록의 커버 — 오른쪽. 한 장뿐이라 흰 알약으로 더 세게 말한다. */
.cover { right: 4px; background: var(--ink); color: var(--s0); }

/* 사진 + 이 줄 = 칸 높이. 두 단계가 같은 규격이라야 오가며 봐도 안 흔들린다. */
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: var(--tile-bar-h);
  padding: 0 3px 0 6px;
}
.shot { font-size: var(--fs-micro); color: var(--faint); }
</style>

<!--
  감싸는 상자의 «겉모습»은 여기가 정한다. 프래그먼트라 상자 자체는 부모가 만들지만,
  .ord · .rep · .cover 가 absolute 라 position: relative 가 빠지면 배지가 조용히 화면 어딘가로
  달아난다 — 그 계약을 부모 둘의 scoped CSS 에 나눠 적지 않는다.
  전역인 이유는 이 클래스가 «부모의» 요소에 붙기 때문이다 (scoped 는 닿지 않는다).
-->
<style>
.phototile {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background: rgb(var(--s1-rgb) / 0.9);
  /*
   * 🔴 테두리가 «칸의 경계»를 만든다. 바탕이 90% 반투명이라 합성 결과가 뒤에 뭐가 있느냐에
   *    따라 달라진다 — 2단계는 포인트 카드(rgb(var(--acc-rgb) / 0.03)) 위라 카드보다 Δ4 어두워
   *    시각 줄이 띠로 보였는데, 3단계는 셸 바탕(#0B0E12) 위라 Δ0 이 되어 아예 안 보였다.
   *    같은 컴포넌트가 부모에 따라 달라 보인 원인이 이것이다. 경계를 스스로 그으면 어디에
   *    놓이든 같게 보인다.
   * 🔴 border 가 아니라 안쪽 그림자다. border 를 켜면 칸이 2px 커져 「사진 추가」 칸(96px)
   *    과 어긋난다 — 이 레포가 .pick.on · .ovf-item.current 에서 쓰는 것과 같은 처방.
   */
  box-shadow: inset 0 0 0 1px var(--hair);
}
</style>
