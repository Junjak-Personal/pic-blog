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
  /**
   * 눈금 밑에 한 줄 더 붙이는 보조 라벨(예: 「12개」). RADII 와 같은 길이여야 한다.
   * 배치를 부르는 쪽에 맡기면 정지점과 어긋난다 — 실제로 최대 27px 어긋나 있었다.
   */
  subLabels?: string[]
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

    <!-- 눈금 라벨은 정지점과 «같은 식»(left %, translateX(-50%))으로 놓는다.
         space-between + 고정폭 span 은 양끝에서 22px 씩 어긋난다. -->
    <div class="ticks">
      <div class="labels mono">
        <span
          v-for="(r, i) in RADII"
          :key="r"
          :class="{ on: r === model }"
          :style="{ left: `${(i / (RADII.length - 1)) * 100}%` }"
        >{{ r }}m</span>
      </div>

      <div v-if="props.subLabels" class="labels sub mono">
        <span
          v-for="(txt, i) in props.subLabels"
          :key="i"
          :class="{ on: RADII[i] === model }"
          :style="{ left: `${(i / (RADII.length - 1)) * 100}%` }"
        >{{ txt }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.radius { display: flex; flex-direction: column; gap: 11px; }
.radius.compact { gap: 9px; }

.head { display: flex; align-items: baseline; justify-content: space-between; }
.title { display: flex; align-items: center; gap: 8px; color: var(--mid); }
.title .mono { font-size: var(--fs-2xs); letter-spacing: 0.1em; text-transform: uppercase; }
.title svg { display: block; flex: none; }

.value { display: flex; align-items: baseline; gap: 6px; }
.num {
  font-family: var(--font-display);
  font-size: var(--fs-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ink);
}
.compact .num { font-size: var(--fs-2xl); }
.unit { font-size: var(--fs-xs); color: var(--deep); }

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
  border: 1.5px solid rgb(var(--acc-rgb) / 0.5);
  transition: all 0.12s;
}
.dot.on {
  width: 13px;
  height: 13px;
  background: var(--acc);
  border-color: var(--ink);
  box-shadow: 0 0 0 4px rgb(var(--acc-rgb) / 0.18);
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

/* 두 줄을 한 묶음으로 둔다 — .radius 의 세로 gap 이 줄 사이에 끼면 너무 벌어진다 */
.ticks { display: flex; flex-direction: column; gap: 2px; }
/* 절대 배치라 자기 높이를 못 만든다 — 한 줄분을 직접 잡아준다 */
.labels { position: relative; height: 13px; }
.labels span {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: var(--fs-2xs);
  color: var(--faint);
  transition: color 0.12s;
}
.labels span.on { color: var(--ink); }
.labels.sub span { color: var(--faint); }
.labels.sub span.on { color: var(--acc); }
.compact .labels { height: 12px; }
.compact .labels span { font-size: var(--fs-micro); }
</style>
