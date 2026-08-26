<script setup lang="ts">
import { DEFAULT_RADIUS, RADII } from '#shared/utils/cluster'
/**
 * 반경 선택 — [20/50/100/200]m, 기본 50m (아트보드 1f · 1g 공통).
 * 값은 이산 4단계다. Reka UI SliderRoot 가 키보드·ARIA 를 맡고 점·라벨은 1d 스타일로 그린다.
 */
const model = defineModel<number>({ required: true })

const props = defineProps<{
  /** 1g '클러스터 반경' · 1f '포인트 배정 반경' */
  label: string
  compact?: boolean
}>()

const stopIndex = computed(() => Math.max(0, RADII.indexOf(model.value as (typeof RADII)[number])))

/** Reka SliderRoot 는 number[] 를 받는다 — 단일 thumb 이라 길이 1 배열이다. */
const sliderValue = computed({
  get: () => [stopIndex.value],
  set: (v: number[]) => {
    model.value = RADII[v[0] ?? 0] ?? DEFAULT_RADIUS
  },
})

function pick(i: number) {
  model.value = RADII[i] ?? DEFAULT_RADIUS
}

const fill = computed(() => `${(stopIndex.value / (RADII.length - 1)) * 100}%`)
</script>

<template>
  <div class="radius" :class="{ compact: props.compact }">
    <div class="head">
      <span class="title">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M12 3v3" /></svg>
        <span class="mono">{{ props.label }}</span>
      </span>
      <span class="value">
        <span class="num">{{ model }}</span>
        <span class="mono unit">m</span>
      </span>
    </div>

    <SliderRoot
      v-model="sliderValue"
      class="track-wrap"
      :min="0"
      :max="RADII.length - 1"
      :step="1"
      :aria-label="props.label"
    >
      <SliderTrack class="track">
        <SliderRange class="fill" :style="{ width: fill }" />
      </SliderTrack>
      <!-- 정지점 — 클릭으로도 직접 고를 수 있다 -->
      <button
        v-for="(r, i) in RADII"
        :key="r"
        type="button"
        class="stop"
        :style="{ left: `${(i / (RADII.length - 1)) * 100}%` }"
        :aria-label="`${r}m`"
        @click="pick(i)"
      >
        <span class="dot" :class="{ on: r === model }" />
      </button>
      <SliderThumb class="thumb" :aria-label="`${model}m`" />
    </SliderRoot>

    <div class="labels mono">
      <span v-for="r in RADII" :key="r" :class="{ on: r === model }">{{ r }}m</span>
    </div>
  </div>
</template>

<style scoped>
.radius { display: flex; flex-direction: column; gap: 11px; }
.radius.compact { gap: 9px; }

.head { display: flex; align-items: baseline; justify-content: space-between; }
.title { display: flex; align-items: center; gap: 8px; color: var(--mid); }
.title .mono { font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; }
.title svg { display: block; flex: none; }

.value { display: flex; align-items: baseline; gap: 6px; }
.num {
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ink);
}
.compact .num { font-size: 22px; }
.unit { font-size: 11px; color: var(--deep); }

.track-wrap {
  position: relative;
  display: flex;
  align-items: center;
  height: 34px;
  width: 100%;
  touch-action: none;
  user-select: none;
}
.track {
  position: relative;
  display: block;
  width: 100%;
  height: 4px;
  border-radius: 6px;
  background: var(--hair);
}
.fill {
  position: absolute;
  left: 0;
  height: 4px;
  border-radius: 6px;
  background: var(--acc);
}

.stop {
  position: absolute;
  top: 0;
  width: 44px;
  height: 34px;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--s0);
  border: 1.5px solid rgba(146, 178, 169, 0.5);
  transition: all 0.12s;
}
.dot.on {
  width: 13px;
  height: 13px;
  background: var(--acc);
  border-color: var(--ink);
  box-shadow: 0 0 0 4px rgba(146, 178, 169, 0.18);
}

/* Reka 의 thumb 는 키보드 포커스 타깃으로만 쓰고 시각적으로는 정지점 dot 이 대신한다 */
.thumb {
  position: absolute;
  width: 34px;
  height: 34px;
  transform: translateX(-50%);
  border-radius: 50%;
  outline: none;
  opacity: 0;
}
.thumb:focus-visible { opacity: 1; box-shadow: 0 0 0 2px var(--acc); }

.labels { display: flex; justify-content: space-between; }
.labels span {
  width: 44px;
  text-align: center;
  font-size: 10px;
  color: var(--faint);
  transition: color 0.12s;
}
.labels span.on { color: var(--ink); }
.compact .labels span { font-size: 9.5px; }
</style>
