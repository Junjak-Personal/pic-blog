<script setup lang="ts">
import AppBack from '~/components/AppBack.vue'
import BottomCta from '~/components/BottomCta.vue'
/**
 * 사진 추가 · 배정 반경 — 아트보드 1f.
 * 최초 업로드(1g)와 화면 언어는 같지만 규칙이 다르다:
 * 기존 포인트 중심에서 반경 안이면 합류하고, 그 중심은 바뀌지 않는다.
 */
import type { PostDetail } from '#shared/types/db'
import { formatDate, formatTime, localIso } from '#shared/utils/format'

definePageMeta({ layout: 'editor' })

const route = useRoute()
const router = useRouter()
const slug = computed(() => String(route.params.slug))

const { data: post } = await useFetch<PostDetail>(() => `/api/posts/${slug.value}`)
const points = computed(() => post.value?.points ?? [])

const flow = useAddPhotosFlow(slug, points)
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function onPick(e: Event) {
  const input = e.target
  if (!(input instanceof HTMLInputElement) || !input.files?.length) return
  void flow.selectFiles([...input.files])
}

async function confirm() {
  await flow.confirm()
  if (flow.stage.value === 'done' && !flow.failed.value.length) await back()
}

async function retry() {
  await flow.retryFailed()
  if (!flow.failed.value.length) await back()
}

async function skip() {
  await flow.skipFailed()
  await back()
}

function back() {
  return router.push(`/editor/${slug.value}`)
}

useHead(() => ({ title: `사진 추가 · ${post.value?.title ?? ''}` }))
</script>

<template>
  <div v-if="!post" class="page">
    <section class="empty"><h3>기록을 찾을 수 없습니다</h3></section>
  </div>

  <div v-else class="page">
    <header class="topbar">
      <div class="left">
        <AppBack :fallback="`/editor/${slug}`" label="편집으로" />
        <span class="hd-name">사진 추가</span>
        <span class="badge mono">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01" /><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12" /><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5" /></svg>
          사진 추가
        </span>
        <span class="mono ctx">
          {{ post.title }}
          <template v-if="flow.scanned.value.length"> · {{ flow.scanned.value.length }}장 선택</template>
        </span>
      </div>
      <div class="right">
        <span v-if="flow.skipped.value.length" class="mono skipped">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12.5 8.5l.5 -.5" /><path d="M14.121 14.111a3 3 0 1 0 -4.242 -4.24" /><path d="M3 3l18 18" /></svg>
          좌표 없음 {{ flow.skipped.value.length }}장 제외
        </span>
        <button type="button" class="btn ghost mono" @click="back">취소</button>
        <button
          v-if="flow.stage.value === 'preview' && flow.scanned.value.length"
          type="button"
          class="btn primary mono wide-only"
          @click="confirm"
        >
          포인트 {{ flow.totalAfter.value }}개로 추가
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
        </button>
      </div>
    </header>

    <!-- 모바일: 추가는 화면 아래에서 -->
    <BottomCta
      v-if="flow.stage.value === 'preview' && flow.scanned.value.length"
      :note="`추가한 사진 ${flow.scanned.value.length}장 · 반경 ${flow.radius.value}m`"
    >
      <button type="button" class="btn primary mono" @click="confirm">
        포인트 {{ flow.totalAfter.value }}개로 추가
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l14 0" /><path d="M13 18l6 -6" /><path d="M13 6l6 6" /></svg>
      </button>
    </BottomCta>

    <!-- 파일 선택 -->
    <section v-if="flow.stage.value === 'idle'" class="empty">
      <h3>추가할 사진을 선택하세요</h3>
      <p>기존 포인트 중심에서 반경 안이면 그 포인트에 합류하고, 밖이면 새 포인트가 만들어집니다.</p>
      <button type="button" class="btn primary mono big" @click="fileInput?.click()">사진 선택</button>
      <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="onPick">
    </section>

    <section v-else-if="flow.stage.value === 'scanning'" class="empty">
      <h3>사진을 검사하는 중</h3>
      <p class="mono">{{ flow.scanProgress.value.done }} / {{ flow.scanProgress.value.total }}</p>
      <div class="bar">
        <span class="bar-fill" :style="{ width: `${(flow.scanProgress.value.done / Math.max(1, flow.scanProgress.value.total)) * 100}%` }" />
      </div>
    </section>

    <!-- 좌표 있는 사진이 하나도 없음 -->
    <section v-else-if="flow.stage.value === 'preview' && !flow.scanned.value.length" class="empty">
      <h3>선택한 사진에 위치 정보가 없습니다</h3>
      <p>좌표 없는 사진은 어떤 반경에서도 포인트가 되지 않습니다.</p>
      <SkippedList :files="flow.skipped.value" />
      <button type="button" class="btn primary mono" @click="flow.reset(); fileInput?.click()">원본으로 다시 선택</button>
    </section>

    <div v-else-if="flow.stage.value === 'preview'" class="preview">
      <div class="map-area">
        <AssignPreviewMap
          :points="points"
          :added="flow.scanned.value"
          :assignment="flow.assignment.value"
        />

        <div class="panel">
          <RadiusSlider v-model="flow.radius.value" label="포인트 배정 반경" />
          <div class="metrics">
            <span class="metric">
              <span class="metric-label mono">합류</span>
              <span class="metric-value">
                <b>{{ flow.assignment.value.joinedShots }}</b>
                <span class="mono unit">장 → {{ flow.assignment.value.joins.length }}개 포인트</span>
              </span>
            </span>
            <span class="metric-rule" />
            <span class="metric">
              <span class="metric-label mono">새 포인트</span>
              <span class="metric-value">
                <b>{{ flow.assignment.value.news.length }}</b>
                <span class="mono unit">개 · {{ flow.scanned.value.length - flow.assignment.value.joinedShots }}장</span>
              </span>
            </span>
            <span class="footnote mono">
              포인트 {{ points.length }} → {{ flow.totalAfter.value }}<br>90분 이상 공백은 끊습니다
            </span>
          </div>
        </div>
      </div>

      <aside class="side">
        <div class="side-head">
          <span class="mono side-title">배정 결과</span>
          <span class="mono side-sub">반경 {{ flow.radius.value }}m</span>
        </div>
        <div class="scroll-y side-list">
          <div class="group mono">기존 포인트에 합류 {{ flow.assignment.value.joins.length }}</div>
          <div v-for="j in flow.assignment.value.joins" :key="j.point.id" class="row">
            <span class="mono num gain">{{ String(j.point.order_index + 1).padStart(2, '0') }}</span>
            <span class="row-main">
              <span class="row-name">{{ j.point.title ?? `포인트 ${j.point.order_index + 1}` }}</span>
              <span class="mono row-sub">중심에서 최대 {{ j.farthest }}m</span>
            </span>
            <span class="mono row-count">+{{ j.shots.length }}장</span>
          </div>

          <div class="group mono">새로 생기는 포인트 {{ flow.assignment.value.news.length }}</div>
          <div v-for="(c, i) in flow.assignment.value.news" :key="i" class="row">
            <span class="mono num fresh">+</span>
            <span class="row-main">
              <span class="row-name">이름 미정</span>
              <span class="mono row-sub">
                {{ formatDate(localIso(c.tStart)) }} {{ formatTime(localIso(c.tStart)) }} · 퍼짐 {{ c.spread }}m
              </span>
            </span>
            <span class="mono row-count">{{ c.shots.length }}장</span>
          </div>
        </div>
        <div class="side-foot mono">새 포인트 이름은 추가 후 편집 화면에서 씁니다</div>
      </aside>

      <aside class="table-card">
        <div class="table-head">
          <span class="mono t-title">반경별 결과</span>
          <span class="mono t-sub">추가 {{ flow.scanned.value.length }}장 · 기존 포인트 {{ points.length }}개</span>
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
              <span class="t-fill join" :style="{ width: `${(r.joinedShots / Math.max(1, flow.scanned.value.length)) * 100}%` }" />
              <span class="t-fill new" :style="{ width: `${((flow.scanned.value.length - r.joinedShots) / Math.max(1, flow.scanned.value.length)) * 100}%` }" />
            </span>
            <span class="mono t-count">+{{ r.newCount }}개</span>
          </button>
        </div>
        <div class="t-legend mono">
          <span><i class="sw join" />합류</span>
          <span><i class="sw new" />새 포인트</span>
        </div>
        <ul class="rules">
          <li>기존 포인트 중심에서 반경 안이면 그 포인트에 합류합니다</li>
          <li>밖이면 추가 사진끼리 다시 묶어 새 포인트를 만듭니다</li>
          <li>값을 바꾸면 그 자리에서 다시 계산됩니다 — 뷰포트는 그대로</li>
        </ul>
        <p class="rules-foot mono">
          기존 포인트의 중심 좌표는 바뀌지 않습니다. 합류한 사진은 그 포인트의 촬영 시각 순 뒤에 붙습니다.
          좌표 없는 사진은 어떤 반경에서도 포인트가 되지 않습니다.
        </p>
      </aside>
    </div>

    <!-- 업로드 진행 · 부분 실패 -->
    <section v-else class="empty">
      <h3 v-if="flow.failed.value.length">사진 {{ flow.failed.value.length }}장이 올라가지 않았습니다</h3>
      <h3 v-else>업로드 중</h3>
      <div class="bar"><span class="bar-fill" :style="{ width: `${flow.uploadPercent.value}%` }" /></div>
      <p class="mono">
        업로드 {{ flow.uploadPercent.value }}%
        <template v-if="flow.failed.value.length">· 실패 {{ flow.failed.value.length }}장 · 재시도 가능</template>
      </p>
      <ul v-if="flow.failed.value.length" class="failed">
        <li v-for="f in flow.failed.value" :key="f.key">
          <span class="mono f-name">{{ f.name }}</span>
          <span class="mono f-why">{{ f.reason }}</span>
        </li>
      </ul>
      <p v-if="flow.errorMessage.value" class="mono error">{{ flow.errorMessage.value }}</p>
      <div v-if="flow.failed.value.length" class="actions">
        <button type="button" class="btn primary mono" @click="retry">{{ flow.failed.value.length }}장 재시도</button>
        <button type="button" class="btn ghost mono" @click="skip">건너뛰고 저장</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.page { height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }

.topbar {
  height: 60px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(146, 178, 169, 0.28);
  background: rgba(146, 178, 169, 0.06);
  /*
   * standalone 은 레이아웃 뷰포트가 상태바 밑까지 올라간다. 상단바가 직접
   * 안전영역만큼 자라면서 자기 불투명 배경으로 그 구간을 덮어야 한다 —
   * 투명한 채로 두면 시스템이 그 위에 합성해 헤더가 흐려 보인다.
   * 이 선언들은 블록 끝에 있어야 위의 padding/background 단축 선언을 이긴다.
   * 브라우저에서는 인셋이 0 이라 원래 모습 그대로다.
   */
  padding-top: env(safe-area-inset-top);
  height: calc(60px + env(safe-area-inset-top));
  background: linear-gradient(rgba(146, 178, 169, 0.06), rgba(146, 178, 169, 0.06)), var(--s0);
}
.left { display: flex; align-items: center; gap: 14px; min-width: 0; }
/* 모바일에서만 쓰는 화면 이름 — 데스크탑은 배지가 그 역할을 한다 */
.hd-name { display: none; }
.badge {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--acc);
  color: var(--s0);
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 10.5px;
  letter-spacing: 0.08em;
}
.ctx { font-size: 10.5px; color: var(--deep); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.right { display: flex; align-items: center; gap: 14px; flex: none; }
.skipped { display: flex; align-items: center; gap: 7px; font-size: 10.5px; color: var(--faint); }

.btn {
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: var(--radius);
  padding: 8px 14px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
}
.btn.primary { background: var(--mid); color: var(--s0); }
.btn.ghost { border: 1px solid rgba(177, 199, 193, 0.2); color: var(--mid); }
.btn.big { padding: 12px 20px; font-size: 12px; }

.preview { flex: 1; display: grid; grid-template-columns: 1fr 348px 340px; min-height: 0; }
.map-area { position: relative; min-width: 0; }

.panel {
  position: absolute;
  left: 20px;
  bottom: 20px;
  width: 452px;
  max-width: calc(100% - 40px);
  background: rgba(6, 7, 10, 0.94);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(146, 178, 169, 0.28);
  border-radius: var(--radius-lg);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.metrics {
  display: flex;
  align-items: stretch;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(177, 199, 193, 0.1);
}
.metric { display: flex; flex-direction: column; gap: 4px; }
.metric-label { font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--faint); }
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
.metric-rule { width: 1px; background: rgba(177, 199, 193, 0.12); }
.footnote { margin-left: auto; font-size: 9.5px; line-height: 1.6; color: var(--faint); text-align: right; }

.side {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: rgba(11, 14, 18, 0.92);
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
/* overflow 가 없으면 포인트가 많을 때 목록이 패널 밖으로 흘러넘친다 */
.side-list { flex: 1; min-height: 0; overflow-y: auto; }

.group {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px;
  background: rgba(146, 178, 169, 0.06);
  border-top: 1px solid var(--hair-soft);
  border-bottom: 1px solid var(--hair-soft);
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--deep);
}
.row {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 11px;
  align-items: center;
  padding: 11px 14px 11px 18px;
  border-bottom: 1px solid var(--hair-soft);
}
.num {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 10.5px;
  font-weight: 600;
}
.num.gain { background: rgba(146, 178, 169, 0.28); color: var(--ink); border: 1px dashed var(--acc); }
.num.fresh { background: var(--acc); color: var(--s0); border: 1px solid var(--ink); font-size: 11px; }
.row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.row-name { font-size: 14px; line-height: 1.2; color: var(--mid); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row-sub { font-size: 9.5px; color: var(--faint); white-space: nowrap; }
.row-count { font-size: 10.5px; color: var(--acc); white-space: nowrap; }
.side-foot {
  flex: none;
  padding: 12px 18px;
  border-top: 1px solid var(--hair);
  font-size: 9.5px;
  line-height: 1.6;
  color: var(--faint);
}

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
.t-row:hover { background: rgba(232, 235, 233, 0.04); }
.t-row.on { background: rgba(146, 178, 169, 0.1); border-color: rgba(146, 178, 169, 0.4); }
.t-label { width: 42px; font-size: 12px; color: var(--faint); }
.t-row.on .t-label, .t-row.on .t-count { color: var(--ink); }
.t-bar { flex: 1; display: flex; height: 6px; border-radius: 6px; overflow: hidden; background: rgba(177, 199, 193, 0.1); }
.t-fill { display: block; height: 100%; }
.t-fill.join { background: rgba(146, 178, 169, 0.35); }
.t-fill.new { background: var(--acc); }
.t-count { width: 52px; text-align: right; font-size: 11px; color: var(--faint); }

.t-legend { display: flex; gap: 14px; font-size: 9.5px; color: var(--faint); }
.t-legend span { display: flex; align-items: center; gap: 6px; }
.sw { width: 9px; height: 9px; border-radius: 3px; display: block; }
.sw.join { background: rgba(146, 178, 169, 0.35); }
.sw.new { background: var(--acc); }

.rules {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 14px 0 0;
  border-top: 1px solid rgba(177, 199, 193, 0.1);
  list-style: none;
}
.rules li { font-size: 13px; line-height: 1.6; color: var(--mid); padding-left: 16px; position: relative; }
.rules li::before { content: '·'; position: absolute; left: 4px; color: var(--acc); }
.rules-foot {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid rgba(177, 199, 193, 0.1);
  font-size: 9.5px;
  line-height: 1.7;
  color: var(--faint);
}

.empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
  text-align: center;
}
.empty h3 { font-size: 24px; letter-spacing: -0.02em; color: var(--ink); }
.empty p { max-width: 460px; font-size: 14px; line-height: 1.7; color: var(--mid); opacity: 0.85; }
.bar { width: min(420px, 100%); height: 6px; border-radius: 6px; background: rgba(177, 199, 193, 0.12); overflow: hidden; }
.bar-fill { display: block; height: 100%; background: var(--acc); transition: width 0.2s; }
.failed { display: flex; flex-direction: column; gap: 6px; width: min(460px, 100%); margin: 0; padding: 0; list-style: none; }
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
/* 모바일 — new.vue 와 같은 처방. 3분할 격자·60px 상단바·452px 패널이 전부 안 들어간다. */
@media (max-width: 900px) {
  .topbar { height: auto; flex-wrap: wrap; align-items: stretch; gap: 10px; padding: calc(10px + env(safe-area-inset-top)) 14px 10px; }
  .left { flex: 1 1 100%; flex-wrap: wrap; gap: 8px; }
  .wide-only, .badge, .skipped { display: none; }
  .hd-name {
    display: block;
    flex: 1;
    min-width: 0;
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--ink);
  }
  .right { gap: 8px; }
  .right .btn { min-height: 40px; }
  .side { padding-bottom: calc(var(--cta-h) + env(safe-area-inset-bottom)); }

  /* 지도는 명시적 높이가 필요하다 — .page 가 min-height 라 1fr 은 0 으로 눌린다 */
  .preview { display: block; min-height: 0; }
  /* 45dvh 면 반경 패널이 지도를 거의 다 덮는다 — 패널 위로 지도가 남게 잡는다 */
  .map-area { height: 56dvh; }
  .side { border-left: 0; border-top: 1px solid var(--hair); max-height: 45dvh; }

  .panel {
    width: auto;
    left: 12px;
    right: 12px;
    bottom: 12px;
    max-width: none;
    padding: 12px 14px;
  }
  .metrics { flex-wrap: wrap; gap: 10px 12px; padding-top: 10px; }
  .metric-rule { display: none; }
  .footnote { margin-left: 0; text-align: left; flex-basis: 100%; }
}
</style>
