<script setup lang="ts">
import { absoluteSiteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from '#shared/utils/seo'

const { siteUrl } = useRuntimeConfig().public
const image = absoluteSiteUrl('/icons/icon-512.png', siteUrl)

// 공개 페이지가 명시적으로 덮어쓴다. 편집·인증 화면은 기본적으로 검색에서 제외한다.
useSeoMeta({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  robots: 'noindex, nofollow',
  ogSiteName: SITE_NAME,
  ogType: 'website',
  ogLocale: 'ko_KR',
  ogTitle: SITE_TITLE,
  ogDescription: SITE_DESCRIPTION,
  ogImage: image,
  ogImageAlt: SITE_NAME,
  twitterCard: 'summary_large_image',
  twitterTitle: SITE_TITLE,
  twitterDescription: SITE_DESCRIPTION,
  twitterImage: image,
  twitterImageAlt: SITE_NAME,
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
