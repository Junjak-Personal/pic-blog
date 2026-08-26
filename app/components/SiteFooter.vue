<script setup lang="ts">
/**
 * 공개 화면 하단 푸터.
 * 다른 사이트(irregular-ice)의 Footer 와 같은 구성 — 좌측 저작권 + 레포, 우측 소셜.
 * 아이콘은 앱 전체와 같은 tabler outline 을 인라인 SVG 로 쓴다 (라이브러리를 새로 넣지 않는다).
 */
const year = new Date().getFullYear()
</script>

<template>
  <footer class="sitefoot">
    <div class="side">
      <span class="mono copy">© {{ year }} · Junjak ·</span>
      <a
        class="ico"
        href="https://github.com/Junjak-Personal/pic-blog"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="이 사이트의 저장소"
      >
        <!-- tabler: git-branch -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M7 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M17 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M7 8l0 8" /><path d="M9 18h6a2 2 0 0 0 2 -2v-5" /><path d="M14 14l3 -3l3 3" /></svg>
      </a>
    </div>

    <nav class="side" aria-label="바깥 링크">
      <a class="ico" href="https://github.com/JunjaK" target="_blank" rel="noopener noreferrer" aria-label="github">
        <!-- tabler: brand-github -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" /></svg>
      </a>
      <a class="ico" href="mailto:haring157@gmail.com" aria-label="메일">
        <!-- tabler: mail -->
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-10z" /><path d="M3 7l9 6l9 -6" /></svg>
      </a>
    </nav>
  </footer>
</template>

<style scoped>
.sitefoot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 24px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--hair);
  color: var(--faint);
}
.side { display: flex; align-items: center; gap: 2px; }
.copy { font-size: 11px; }

/* 아이콘 전용 버튼 — 상자를 두르지 않는다. 배경은 눌렀을 때만 잠깐 뜬다. */
.ico {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius);
  color: var(--faint);
}
.ico:hover { color: var(--mid); background: rgba(146, 178, 169, 0.1); }
.ico:active { background: rgba(146, 178, 169, 0.16); }

@media (max-width: 900px) {
  .sitefoot { padding: 10px 14px calc(10px + env(safe-area-inset-bottom)); }
  .copy { font-size: 10px; }
  .ico { width: 38px; height: 38px; }
}
</style>
