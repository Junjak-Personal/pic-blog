<script setup lang="ts">
/**
 * 지도 한 판의 «껍데기» — 캔버스 · 로딩 스켈레톤 · 실패 시 좌표 목록.
 *
 * 지도가 다섯이다 (목록 띠 · 기록 상세 · 클러스터 미리보기 · 배정 미리보기 · 편집 보드).
 * 다섯이 모두 같은 세 줄을 각자 적고 있었고, 그중 하나가 «조용히» 아픈 줄이다 —
 * isolation: isolate. 빠뜨리면 Mapbox 마커의 z-index 가 문서 루트로 새어 나가
 * 라이트박스·시트 «위»에 그려진다. 만든 화면이 아니라 다른 화면이 깨지므로 알아채기 어렵다.
 * MapFallback 의 props 모양이 바뀔 때 다섯 곳을 찾아다니지 않아도 되는 것은 덤이다.
 *
 * 🔴 position 은 일부러 갖지 않는다. 클러스터 미리보기만 absolute·inset:0 이고 나머지는
 *    relative·100% 라 여기서 정하면 한쪽과 싸운다(같은 명시도라 주입 순서가 이긴다).
 *    그리고 이건 빠뜨리면 캔버스가 그 자리에서 바로 무너지므로 «조용한» 실수가 아니다 —
 *    조용한 것만 여기가 맡고, 크기와 자리는 부르는 쪽이 정한다.
 */
import MapSkeleton from '~/components/MapSkeleton.vue'
import MapFallback, { type FallbackItem } from '~/components/MapFallback.vue'
import type { MapStatus } from '~/composables/useMapbox'

const props = defineProps<{
  status: MapStatus
  /**
   * 지도가 죽었을 때 대신 세울 좌표 목록.
   * 🔴 computed 로 넘긴다 — 여기서는 늘 «살아 있는» prop 이라, 부모가 템플릿에서 즉석
   *    매핑하면 지도가 멀쩡할 때도 렌더마다 배열을 새로 만든다.
   */
  items: FallbackItem[]
}>()

defineEmits<{ retry: [] }>()

/** Mapbox 가 붙을 요소. 부모가 useMapbox 에 넘겨야 하므로 밖으로 내놓는다. */
const canvas = ref<HTMLElement | null>(null)
defineExpose({ canvas })
</script>

<template>
  <div class="mapframe">
    <div ref="canvas" class="canvas" />
    <!-- 하이드레이션·초기화 동안의 빈 칸을 덮는다 — status 초기값이 loading 이라 서버 HTML 에도 실린다 -->
    <MapSkeleton v-if="props.status === 'loading'" />
    <!-- 지도 로드 실패 → 좌표 목록으로 대체 (아트보드 1c) -->
    <MapFallback v-else-if="props.status === 'failed'" :items="props.items" @retry="$emit('retry')" />
    <!-- 지도가 실제로 떠 있을 때만 얹는 것 — 범례 · 배지 -->
    <slot v-else />
  </div>
</template>

<style scoped>
.mapframe {
  overflow: hidden;
  background: #06070A;
  /* 마커의 z-index 가 루트로 새어 나가 라이트박스·시트 위에 그려지는 걸 막는다 */
  isolation: isolate;
}
.canvas { position: absolute; inset: 0; }
</style>
