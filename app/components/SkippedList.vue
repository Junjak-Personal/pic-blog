<script setup lang="ts">
/** 제외된 파일명 목록 (아트보드 1c). 조용히 무시하지 않는다는 약속을 지키는 컴포넌트다. */
import { SKIP_REASONS, type SkippedPhoto } from '~/utils/exif'

const props = defineProps<{ files: SkippedPhoto[] }>()
</script>

<template>
  <div v-if="props.files.length" class="skipped">
    <div class="head">
      <span class="mono count">제외 {{ props.files.length }}장</span>
    </div>
    <ul class="scroll-y list">
      <li v-for="(f, i) in props.files" :key="`${f.name}-${i}`">
        <span class="mono name">{{ f.name }}</span>
        <span class="mono why">{{ SKIP_REASONS[f.reason] }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.skipped {
  width: min(460px, 100%);
  background: var(--s2);
  border: 1px solid var(--hair);
  border-radius: var(--radius);
  overflow: hidden;
  text-align: left;
}
.head { padding: 9px 12px; border-bottom: 1px solid var(--hair); }
.count { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--deep); }
.list { max-height: 168px; margin: 0; padding: 0; list-style: none; }
.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--hair-soft);
}
.list li:last-child { border-bottom: 0; }
.name { font-size: 10.5px; color: var(--mid); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.why { font-size: 9.5px; color: var(--faint); flex: none; }
</style>
