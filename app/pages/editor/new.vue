<script setup lang="ts">
import AppBack from '~/components/AppBack.vue'
import BottomCta from '~/components/BottomCta.vue'
import RadiusSlider from '~/components/RadiusSlider.vue'
/**
 * 새 기록 — 업로드. 아트보드 1g.
 * 1 사진 선택(여러 묶음을 이어서) → 2 포인트 경계 + 반경 → 3 업로드 → /editor/[slug]
 *
 * 예전엔 네 단계였는데 2단계가 「검사 결과」였다. 검사는 몇 초짜리 진행 막대였고 그 «결과»는
 * 정작 3단계 화면 위에 떴다 — 고르자마자 1에서 3으로 건너뛰는 것처럼 보였다. 검사는
 * 1단계 안의 한 구간으로 넣고, 단계는 사용자가 «결정»하는 지점으로만 나눈다.
 */
import { formatDate, formatGap, formatTime, localIso } from '#shared/utils/format'
import { MAX_PER_SELECTION, skipNotice, summarizeSkipped } from '~/utils/exif'
import { pickPhotos } from '~/utils/native'

definePageMeta({ layout: 'editor' })

const router = useRouter()
const flow = useUploadFlow()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const activeCluster = ref<string | null>(null)

const steps = [
  { n: 1, label: '사진 선택' },
  { n: 2, label: '포인트 경계' },
  { n: 3, label: '업로드' },
] as const

const currentStep = computed(() => {
  if (flow.stage.value === 'preview') return 2
  if (flow.stage.value === 'uploading' || flow.stage.value === 'done') return 3
  return 1 // idle · scanning · picked — 전부 「고르는 중」이다
})

/** 시도가 아니라 실제 안착한 장수 기준. 2장 실패면 100%가 아니라 98.x% 로 보인다. */
const uploadPercent = computed(() => {
  const total = flow.totalPhotos.value
  return total ? +((flow.uploaded.value / total) * 100).toFixed(1) : 0
})

function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

/** 껍데기면 PhotoKit, 아니면 파일 입력 — pickPhotos 가 가른다 */
async function pick() {
  const sources = await pickPhotos(fileInput.value, MAX_PER_SELECTION)
  if (sources.length) await flow.selectFiles(sources)
}

async function confirm() {
  await flow.confirm()
  if (flow.stage.value === 'done' && !flow.failed.value.length && flow.createdSlug.value) {
    await router.push(`/editor/${flow.createdSlug.value}`)
  }
}

async function retry() {
  await flow.retryFailed()
  if (!flow.failed.value.length && flow.createdSlug.value) {
    await router.push(`/editor/${flow.createdSlug.value}`)
  }
}

async function skip() {
  await flow.skipFailed()
  if (flow.createdSlug.value) await router.push(`/editor/${flow.createdSlug.value}`)
}
</script>

<template>
  <div class="page">
    <!--
      🔴 단계와 무관하게 늘 DOM 에 있어야 한다. idle 구간 안에 두면 「사진 더 선택」을
         누르는 순간(picked · preview) ref 가 null 이라 선택기가 열리지 않는다.
         add/[slug].vue 에서 실제로 그렇게 깨졌던 자리다.
    -->
    <input ref="fileInput" type="file" accept="image/*" multiple hidden>

    <!-- 단계 표시 + 확정 버튼 -->
    <header class="topbar">
      <!-- 뒤로는 왼쪽 ← 하나다. 데스크탑에만 있던 우측 「뒤로」 텍스트 버튼은 걷어냈다 —
           같은 일을 하는 길이 헤더 양 끝에 하나씩 있었다.
           2단계에서는 ← 가 페이지를 떠나는 게 아니라 1단계로 돌아간다 (고른 사진을 버리지 않는다) -->
      <AppBack
        always
        fallback="/editor"
        :label="flow.stage.value === 'preview' ? '사진 선택으로' : '기록 목록으로'"
        :intercept="flow.stage.value === 'preview' ? flow.backToPick : undefined"
      />

      <ol class="steps">
        <li v-for="(s, i) in steps" :key="s.n" class="step">
          <span class="bullet" :class="{ on: currentStep === s.n, done: currentStep > s.n }">
            <svg v-if="currentStep > s.n" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
            <template v-else>{{ s.n }}</template>
          </span>
          <span class="step-label" :class="{ on: currentStep >= s.n, now: currentStep === s.n }">{{ s.label }}</span>
          <span v-if="i < steps.length - 1" class="step-rule" />
        </li>
      </ol>

      <div class="top-actions">
        <!-- 라벨은 «되돌아가는 곳»이다. 「사진 더 선택」이면 1단계의 같은 이름 버튼(선택기를 여는)과 헷갈린다 -->
        <button v-if="flow.stage.value === 'preview'" type="button" class="btn ghost mono wide-only" @click="flow.backToPick()">
          사진 선택으로
        </button>
        <button
          v-if="flow.stage.value === 'preview'"
          type="button"
          class="btn primary mono wide-only"
          :disabled="!flow.clusters.value.length"
          @click="confirm"
        >
          포인트 {{ flow.clusters.value.length }}개로 확정
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
        </button>
      </div>
    </header>

    <!-- 모바일 1단계: 더 고르기 / 다음. 이 화면에서 손가락이 닿는 곳은 여기뿐이다 -->
    <BottomCta
      v-if="flow.stage.value === 'picked' && flow.scanned.value.length"
      :note="`사진 ${flow.scanned.value.length}장 선택됨`"
    >
      <button type="button" class="btn ghost mono" @click="pick()">사진 더 선택</button>
      <button type="button" class="btn primary mono" @click="flow.toBoundary()">
        포인트 경계 지정
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
      </button>
    </BottomCta>

    <!-- 모바일: 확정은 화면 아래에서. 반경 슬라이더를 만지다 바로 누르는 흐름이다 -->
    <BottomCta
      v-else-if="flow.stage.value === 'preview'"
      :note="`사진 ${flow.scanned.value.length}장 · 반경 ${flow.radius.value}m`"
    >
      <button type="button" class="btn primary mono" :disabled="!flow.clusters.value.length" @click="confirm">
        포인트 {{ flow.clusters.value.length }}개로 확정
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
      </button>
    </BottomCta>

    <!-- 1단계 — 파일 선택 -->
    <section v-if="flow.stage.value === 'idle'" class="empty">
      <span class="empty-icon">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3" /></svg>
      </span>
      <h3>사진을 선택하세요</h3>
      <p>사진을 올리면 EXIF 의 GPS 좌표로 포인트가 만들어지고, 촬영 시각 순으로 동선이 이어집니다.</p>
      <button type="button" class="btn primary mono big" @click="pick()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" /><path d="M7 9l5 -5l5 5" /><path d="M12 4l0 12" /></svg>
        사진 선택
      </button>
      <!-- 고르고 나서 한참 조용한 구간이 있다 — 왜 그런지 미리 말해둔다 -->
      <p class="mono pick-hint">
        한 번에 {{ MAX_PER_SELECTION }}장까지 · 아이폰은 사진첩에서 옮기는 데 시간이 걸립니다.
        고른 뒤 화면이 잠시 조용해도 기다려 주세요.
      </p>
    </section>

    <!-- 1단계 (계속) — 검사 진행. 몇 초짜리라 단계로 세지 않는다 -->
    <section v-else-if="flow.stage.value === 'scanning'" class="empty">
      <h3>사진을 검사하는 중</h3>
      <p class="mono scan-count">
        {{ flow.scanProgress.value.done }} / {{ flow.scanProgress.value.total }}
      </p>
      <div class="bar">
        <span
          class="bar-fill"
          :style="{ width: `${(flow.scanProgress.value.done / Math.max(1, flow.scanProgress.value.total)) * 100}%` }"
        />
      </div>
      <p class="hint mono">EXIF 를 읽고 좌표가 없는 사진을 걸러냅니다</p>
    </section>

    <!-- 고른 목록(1단계) · 포인트 경계(2단계) — 검사 결과 줄은 둘이 함께 쓴다 -->
    <template v-else-if="flow.stage.value === 'picked' || flow.stage.value === 'preview'">
      <div class="scanbar">
        <span class="ok">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
          {{ flow.scanned.value.length }}장 통과
        </span>
        <template v-if="flow.skipped.value.length">
          <span class="rule" />
          <span class="skip">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 8.5l.5 -.5" /><path d="M14.121 14.111a3 3 0 1 0 -4.242 -4.24" /><path d="M9.13 9.13a8.28 8.28 0 0 0 -1.13 1.87c1.4 2.3 3.4 4 6 4a5.6 5.6 0 0 0 2.13 -.4" /><path d="M3 3l18 18" /></svg>
            {{ flow.skipped.value.length }}장 제외 — {{ summarizeSkipped(flow.skipped.value) }}
          </span>
        </template>
        <span class="scanbar-note mono">스크린샷·메신저로 받은 사진은 좌표가 지워진 상태로 저장됩니다</span>
      </div>

      <!-- 조치가 따라붙는 제외(상한 초과 · 이미 올라간 사진)는 한 줄로 따로 말한다 -->
      <p v-if="skipNotice(flow.skipped.value)" class="mono notice">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
        {{ skipNotice(flow.skipped.value) }}
      </p>

      <!-- 통과한 사진이 하나도 없다 — 사유는 아래 목록이 한 장씩 말한다 -->
      <section v-if="!flow.scanned.value.length" class="empty">
        <h3>올릴 수 있는 사진이 없습니다</h3>
        <p>스크린샷이나 메신저로 받은 사진은 좌표가 지워진 상태로 저장됩니다. 같은 사진이 두 번 들어간 경우도 한 장만 남깁니다.</p>
        <SkippedList :files="flow.skipped.value" />
        <button type="button" class="btn primary mono" @click="flow.reset(); pick()">
          원본으로 다시 선택
        </button>
      </section>

      <!--
        1단계에 «머무는» 화면. 사진첩이 한 번에 넘겨주는 양에 상한이 있어 한 기록을 채우려면
        여러 번 골라야 한다 — 고른 것을 여기 쌓아두고, 다 됐을 때 사용자가 다음으로 넘긴다.
      -->
      <section v-else-if="flow.stage.value === 'picked'" class="empty picked">
        <span class="tick">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10" /></svg>
        </span>
        <h3>사진 {{ flow.scanned.value.length }}장 선택됨</h3>
        <p class="mono picked-range">{{ flow.provisionalTitle.value }}</p>
        <p>더 올릴 사진이 남았으면 이어서 고르세요. 다 골랐으면 다음 단계에서 포인트 경계를 정합니다.</p>
        <SkippedList v-if="flow.skipped.value.length" :files="flow.skipped.value" />
        <div class="actions wide-only">
          <button type="button" class="btn ghost mono" @click="pick()">사진 더 선택</button>
          <button type="button" class="btn primary mono" @click="flow.toBoundary()">
            포인트 경계 지정
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
          </button>
        </div>
      </section>

      <div v-else class="preview">
        <div class="map-area">
          <ClusterPreviewMap
            :clusters="flow.clusters.value"
            :shots="flow.scanned.value"
            :active="activeCluster"
            @select="activeCluster = $event"
          />

          <div class="panel">
            <RadiusSlider v-model="flow.radius.value" label="클러스터 반경" />
            <div class="metrics">
              <span class="metric">
                <span class="metric-label mono">사진</span>
                <span class="mono metric-mono">{{ flow.scanned.value.length }}장</span>
              </span>
              <svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
              <span class="metric">
                <span class="metric-label mono">포인트</span>
                <span class="metric-value">
                  <b>{{ flow.clusters.value.length }}</b><span class="mono unit">개</span>
                </span>
              </span>
              <span class="metric-rule" />
              <span class="metric">
                <span class="metric-label mono">날짜·시간으로 끊김</span>
                <span class="mono gapc">{{ flow.dayCount.value + flow.gapCount.value }}곳</span>
              </span>
              <span class="footnote mono">합류할 때마다 중심이<br>다시 계산됩니다</span>
            </div>
          </div>
        </div>

        <aside class="side">
          <div class="side-head">
            <span class="mono side-title">잠정 포인트 {{ flow.clusters.value.length }}</span>
            <span class="mono side-sub">반경 {{ flow.radius.value }}m</span>
          </div>
          <ol class="scroll-y cluster-list">
            <li
              v-for="(c, i) in flow.clusters.value"
              :key="i"
              class="row"
              :class="{ on: activeCluster === `c${i}` }"
              @click="activeCluster = `c${i}`"
            >
              <span class="num mono">
                {{ String(i + 1).padStart(2, '0') }}
                <span
                  v-if="c.gap || c.dayBreak"
                  class="gap-badge"
                  :title="c.dayBreak ? '날짜가 바뀌어 끊김' : '시간 공백으로 끊김'"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                </span>
              </span>
              <span class="row-main">
                <span class="row-name">{{ formatTime(localIso(c.tStart)) }} · 퍼짐 {{ c.spread }}m</span>
                <!-- 끊긴 «이유»를 그대로 적는다: 시간이면 공백, 날짜면 그 날짜 자체가 이유다 -->
                <span class="mono row-sub" :class="{ gap: c.gap || c.dayBreak }">
                  {{ c.gap ? formatGap(c.gapMinutes) : formatDate(localIso(c.tStart)) }}
                </span>
              </span>
              <span class="mono row-count">{{ c.shots.length }}장</span>
            </li>
          </ol>
          <div class="side-foot mono">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8h.01" /><path d="M11 12h1v4h1" /></svg>
            포인트 이름은 다음 단계에서 씁니다
          </div>
        </aside>

        <aside class="table-card">
          <div class="table-head">
            <span class="mono t-title">반경별 결과</span>
            <span class="mono t-sub">사진 {{ flow.scanned.value.length }}장 · 기존 포인트 0개</span>
          </div>
          <div class="table-rows">
            <button
              v-for="r in flow.radiusTable.value"
              :key="r.radius"
              type="button"
              class="t-row"
              :class="{ on: r.radius === flow.radius.value }"
              @click="flow.radius.value = r.radius"
            >
              <span class="mono t-label">{{ r.radius }}m</span>
              <span class="t-bar">
                <span
                  class="t-fill"
                  :style="{ width: `${(r.count / Math.max(1, flow.radiusTable.value[0]!.count)) * 100}%` }"
                />
              </span>
              <span class="mono t-count">{{ r.count }}개</span>
            </button>
          </div>
          <ul class="rules">
            <li>이 슬라이더가 포인트 병합·분할 UI 를 전부 대체합니다</li>
            <li>사진이 합류할 때마다 클러스터 중심이 평균 좌표로 다시 계산됩니다</li>
            <li>촬영 날짜가 바뀌면 같은 자리라도 끊습니다 — 포인트는 하루에 속합니다</li>
            <li>같은 날 안에서 90분 이상 비면 거리와 무관하게 끊습니다 — 지도에서 점선과 시계 표식으로 보입니다</li>
          </ul>
          <p class="rules-foot mono">
            묶는 규칙: 촬영 시각 순으로 훑으며 진행 중인 포인트의 중심에서 반경을 벗어나거나
            날짜가 바뀌면 새 포인트를 연다. 확정하면 업로드가 시작되고, 이후 중심 좌표는 고정됩니다.
          </p>
        </aside>
      </div>
    </template>

    <!-- 3단계 — 업로드 진행률 · 부분 실패 (아트보드 1c) -->
    <section v-else class="empty">
      <h3 v-if="flow.failed.value.length">사진 {{ flow.failed.value.length }}장이 올라가지 않았습니다</h3>
      <h3 v-else-if="flow.stage.value === 'done'">저장했습니다</h3>
      <h3 v-else>업로드 중</h3>

      <div class="bar">
        <span class="bar-fill" :style="{ width: `${uploadPercent}%` }" />
      </div>
      <p class="mono progress-line">
        업로드 {{ uploadPercent }}%
        <template v-if="flow.failed.value.length">· 실패 {{ flow.failed.value.length }}장 · 재시도 가능</template>
      </p>

      <ul v-if="flow.failed.value.length" class="failed">
        <li v-for="f in flow.failed.value" :key="f.key">
          <span class="mono f-name">{{ f.name }}</span>
          <span class="mono f-why">{{ f.reason }} · {{ formatBytes(f.bytes) }}</span>
        </li>
      </ul>

      <p v-if="flow.errorMessage.value" class="mono error">{{ flow.errorMessage.value }}</p>

      <div v-if="flow.failed.value.length" class="actions">
        <button type="button" class="btn primary mono" @click="retry">
          {{ flow.failed.value.length }}장 재시도
        </button>
        <button type="button" class="btn ghost mono" @click="skip">건너뛰고 저장</button>
      </div>
    </section>
  </div>
</template>


<style scoped>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* 상단 단계바 */
.topbar {
  height: var(--topbar-h);
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 0 var(--topbar-x);
  border-bottom: 1px solid var(--hair);
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: var(--top-inset);
  height: calc(var(--topbar-h) + var(--top-inset));
  background: var(--s0);
}
/* ← 는 왼쪽 끝, 단계바는 오른쪽으로 민다. 확정 버튼이 있는 단계에서는 그 왼쪽에 선다 */
.steps { display: flex; align-items: center; gap: 0; margin: 0 0 0 auto; padding: 0; list-style: none; }
.step { display: flex; align-items: center; gap: 8px; }
.bullet {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  flex: none;
  border-radius: 50%;
  background: rgb(var(--acc-rgb) / 0.12);
  border: 1px solid rgb(var(--mid-rgb) / 0.2);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--faint);
}
.bullet.done { background: var(--acc); border-color: var(--acc); color: var(--s0); }
.bullet.on { background: var(--ink); border-color: var(--ink); color: var(--s0); }
.step-label { font-size: 13px; color: var(--faint); white-space: nowrap; }
.step-label.on { color: var(--ink); }
.step-rule { width: 22px; height: 1px; background: rgb(var(--mid-rgb) / 0.18); margin: 0 12px; }

.top-actions { display: flex; align-items: center; gap: 14px; flex: none; }

/* 버튼은 base.css 의 .btn 한 벌을 쓴다 */

/* 검사 결과 바 */
.scanbar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 13px 24px;
  border-bottom: 1px solid var(--hair);
  background: rgb(var(--acc-rgb) / 0.04);
  font-size: 13.5px;
}
.scanbar .ok { display: flex; align-items: center; gap: 8px; color: var(--ink); }
.scanbar .ok svg { color: var(--acc); }
.scanbar .skip { display: flex; align-items: center; gap: 8px; color: var(--mid); }
.rule { width: 1px; height: 18px; background: var(--hair); }
.scanbar-note { margin-left: auto; font-size: 10px; color: var(--faint); }

/* 미리보기 3분할 */
.preview { flex: 1; display: grid; grid-template-columns: 1fr 348px 340px; min-height: 0; }
.map-area { position: relative; min-width: 0; }

.panel {
  position: absolute;
  left: 20px;
  bottom: 20px;
  width: 452px;
  max-width: calc(100% - 40px);
  background: rgb(var(--sheet-rgb) / 0.94);
  backdrop-filter: blur(14px);
  border: 1px solid rgb(var(--acc-rgb) / 0.28);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.metrics {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid rgb(var(--mid-rgb) / 0.1);
}
.metric { display: flex; flex-direction: column; gap: 4px; }
.metric-label { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
.metric-mono { font-size: 13px; color: var(--mid); }
.metric-value { display: flex; align-items: baseline; gap: 5px; }
.metric-value b {
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
  color: var(--ink);
}
.unit { font-size: 10.5px; color: var(--deep); }
.gapc { font-size: 13px; color: var(--acc); }
.arrow { color: var(--faint); flex: none; }
.metric-rule { width: 1px; height: 34px; background: rgb(var(--mid-rgb) / 0.12); }
.footnote { margin-left: auto; font-size: 9.5px; line-height: 1.6; color: var(--faint); text-align: right; }

/* 잠정 포인트 목록 */
.side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgb(var(--s1-rgb) / 0.92);
  border-left: 1px solid var(--hair);
}
.side-head {
  flex: none;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--hair);
}
.side-title { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mid); }
.side-sub { font-size: 10px; color: var(--faint); }

/* .point-list 와 같은 이유 — overflow 가 없으면 포인트가 많을 때 패널 밖으로 흘러넘친다 */
.cluster-list { flex: 1; min-height: 0; overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
  cursor: pointer;
}
.row:hover { background: rgb(var(--ink-rgb) / 0.06); }
.row.on { background: rgb(var(--ink-rgb) / 0.1); }
.num {
  position: relative;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 600;
  background: rgb(var(--field-rgb) / 0.94);
  color: var(--mid);
  border: 1px solid rgb(var(--acc-rgb) / 0.6);
}
.row.on .num { background: var(--ink); color: var(--s0); border-color: var(--ink); }
.gap-badge {
  position: absolute;
  right: -6px;
  top: -5px;
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--s0);
  border: 1px solid var(--acc);
  color: var(--acc);
}
.row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.row-name { font-size: 14px; line-height: 1.2; color: var(--mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row.on .row-name { color: var(--ink); }
.row-sub { font-size: 9.5px; color: var(--faint); white-space: nowrap; }
.row-sub.gap { color: var(--acc); }
.row-count { font-size: 10px; color: var(--faint); white-space: nowrap; }

.side-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px 18px;
  border-top: 1px solid var(--hair);
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--faint);
}
.side-foot svg { flex: none; }

/* 반경별 결과 */
.table-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  border-left: 1px solid var(--hair);
  overflow-y: auto;
  scrollbar-width: none;
}
.table-head { display: flex; flex-direction: column; gap: 6px; }
.t-title { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--deep); }
.t-sub { font-size: 9.5px; color: var(--faint); }

.table-rows { display: flex; flex-direction: column; gap: 7px; }
.t-row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  border-radius: var(--radius);
  border: 1px solid transparent;
  cursor: pointer;
  text-align: left;
}
.t-row:hover { background: rgb(var(--ink-rgb) / 0.04); }
.t-row.on { background: rgb(var(--acc-rgb) / 0.1); border-color: rgb(var(--acc-rgb) / 0.4); }
.t-label { width: 42px; font-size: 12px; color: var(--faint); }
.t-row.on .t-label, .t-row.on .t-count { color: var(--ink); }
/* 「무엇을 해야 하는지」를 말하는 줄이라 눈에 띄어야 한다 */
.pick-hint { max-width: 420px; font-size: 10.5px; line-height: 1.7; color: var(--faint); }

.t-bar { flex: 1; height: 6px; border-radius: 6px; background: rgb(var(--mid-rgb) / 0.1); overflow: hidden; }
.t-fill { display: block; height: 100%; border-radius: 6px; background: var(--acc); }
.t-count { width: 44px; text-align: right; font-size: 11px; color: var(--faint); }

.rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 14px 0 0;
  border-top: 1px solid rgb(var(--mid-rgb) / 0.1);
  list-style: none;
}
.rules li { font-size: 13px; line-height: 1.6; color: var(--mid); padding-left: 16px; position: relative; }
.rules li::before { content: '·'; position: absolute; left: 4px; color: var(--acc); }
.rules-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgb(var(--mid-rgb) / 0.1);
  font-size: 9.5px;
  line-height: 1.7;
  color: var(--faint);
}

/* 빈 상태 · 진행 상태 공통 */
.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
  text-align: center;
  /* 셸이 overflow: hidden 이라 문서 스크롤이 없다 — 짧은 화면(가로 모드 등)에서
     내용이 넘치면 여기서 굴러야 잘리지 않는다 */
  overflow-y: auto;
}
.empty-icon {
  display: grid;
  place-items: center;
  width: 60px;
  height: var(--topbar-h);
  border-radius: 16px;
  background: rgb(var(--acc-rgb) / 0.1);
  border: 1px solid var(--hair);
  color: var(--deep);
}
.empty h3 { font-size: 24px; letter-spacing: -0.02em; color: var(--ink); }
.empty p { max-width: 460px; font-size: 14px; line-height: 1.7; color: var(--mid); opacity: 0.85; }
.hint { font-size: 10.5px; color: var(--faint); }
.scan-count { font-size: 15px; color: var(--deep); }

/* 1단계에 머무는 화면 — 「됐다」는 신호와 두 갈래(더 고르기 / 다음) */
.tick {
  display: grid;
  place-items: center;
  width: 60px;
  height: var(--topbar-h);
  border-radius: 50%;
  background: rgb(var(--acc-rgb) / 0.12);
  border: 1px solid rgb(var(--acc-rgb) / 0.4);
  color: var(--acc);
}
.picked-range { font-size: 12px; color: var(--faint); }

.bar { width: min(420px, 100%); height: 6px; border-radius: 6px; background: rgb(var(--mid-rgb) / 0.12); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--acc); transition: width 0.2s; }
.progress-line { font-size: 11px; color: var(--deep); }

.failed {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(460px, 100%);
  margin: 0;
  padding: 0;
  list-style: none;
}
.failed li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  background: var(--s2);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
}
.f-name { font-size: 10.5px; color: var(--mid); }
.f-why { font-size: 10px; color: var(--faint); }
.error { font-size: 11px; color: var(--danger); }
.actions { display: flex; align-items: center; gap: 9px; }

@media (max-width: 1240px) {
  .preview { grid-template-columns: 1fr 320px; }
  .table-card { display: none; }
}
/* 모바일 — 4단계 스텝바와 3분할 격자가 390px 에 들어갈 리 없다. 둘 다 푼다. */
@media (max-width: 900px) {
  .topbar { height: auto; min-height: calc(var(--topbar-h-sm) + var(--top-inset)); flex-wrap: wrap; gap: 10px; padding: calc(10px + var(--top-inset)) var(--topbar-x-sm) 10px; }
  /* 스텝바: 지금 단계 라벨만 남기고 나머지는 동그라미만. 완료 단계 라벨까지
     남기면(.on 은 완료도 포함한다) 390px 에서 4번째 동그라미가 화면 밖으로 밀린다 */
  .step-label:not(.now) { display: none; }
  .step-rule { width: 12px; margin: 0 6px; }
  .wide-only { display: none; }
  /* 확정은 하단 CTA, 뒤로는 좌측 ← 로 갔다 — 우측 묶음은 모바일에서 빈다 */
  .top-actions { display: none; }
  /* 하단 CTA 에 가리지 않게 목록 끝을 비운다 */
  .side { padding-bottom: calc(var(--cta-h) + env(safe-area-inset-bottom)); }
  .picked { padding-bottom: calc(40px + var(--cta-h) + env(safe-area-inset-bottom)); }

  .scanbar { flex-wrap: wrap; gap: 10px 14px; padding: 11px 16px; font-size: 12.5px; }
  .scanbar-note { display: none; }

  /* 격자를 풀고 이 칸 하나가 굴러가게 둔다. 지도는 명시적 높이가 필요하다 — 1fr 은 0 으로 눌린다 */
  .preview { display: block; min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; }
  /* 45dvh 면 반경 패널이 지도를 거의 다 덮는다 — 패널 위로 지도가 남게 잡는다 */
  .map-area { height: 56dvh; }
  .side { border-left: 0; border-top: 1px solid var(--hair); max-height: 45dvh; }

  /* 반경 패널: 452px 고정폭 + 안 접히는 metrics 행 때문에 화면 밖으로 밀렸다 */
  .panel {
    width: auto;
    left: 12px;
    right: 12px;
    bottom: 12px;
    max-width: none;
    padding: 12px 14px;
    gap: 10px;
  }
  .metrics { flex-wrap: wrap; gap: 10px 12px; padding-top: 10px; }
  .metric-rule { display: none; }
  .footnote { margin-left: 0; text-align: left; flex-basis: 100%; }
}
</style>
