---
title: pic-blog 문서 색인
status: reference
topic: doc-storage
kind: brief
created: 2026-08-29
updated: 2026-08-31
owner: jhyoon
---
# pic-blog 문서 색인

`_docs/` 는 **프로젝트 소유** 문서만 둔다. 배치는 두 축이다 — 위는 상태(`active` /
`complete` / `reference` / `deprecated` / `handoff`), 그 안은 진행 중이면 «날짜», 끝났으면
«토픽» 이다. 파일명은 `YYYY-MM-DD-<topic>[-<kind>].md`.

문서를 옮길 때는 **한 커밋 안에서** 파일 이동 · 프론트매터 · 이 색인 · 들어오는 링크를
같이 고친다. 셋 중 하나만 어긋나도 나머지를 믿을 수 없게 된다.

## ① 문서

| 상태 | 토픽 | 문서 | 무엇 |
|---|---|---|---|
| processing | `ios-keyboard` | [2026-08-31-ios-keyboard-findings.md](active/processing/2026-08-31/2026-08-31-ios-keyboard-findings.md) | 아이폰 키보드와 고정 셸. **지운 다섯 가지 접근**과 아직 못 찾은 차이. 열린 항목 둘(360장 실사용 · 포커스 튐). 이 문제를 다시 만지기 전에 읽을 것 |
| reference | `product-spec` | [2026-08-25-product-spec.md](reference/product-spec/2026-08-25-product-spec.md) | 설계 SSOT — 스키마 · 클러스터링 · 업로드 파이프라인. 코드 주석이 「설계문서 §N」으로 가리키는 그 문서 |
| reference | `design-system` | [2026-08-26-design-system.md](reference/design-system/2026-08-26-design-system.md) | 아트보드에서 가져온 값·규칙. 원본 캔버스는 추적하지 않는다 |
| reference | `deploy` | [2026-08-26-deploy.md](reference/deploy/2026-08-26-deploy.md) | junserver 배포 런북 |
| reference | `e2e-testing` | [2026-08-26-e2e-testing-brief.md](reference/e2e-testing/2026-08-26-e2e-testing-brief.md) | UI 점검 브리프 — 뷰포트 · 화면 목록 · 볼 것 |
| complete | `native-shell` | [2026-08-28-native-shell.md](complete/native-shell/2026-08-28-native-shell.md) | iOS 껍데기. 실측과 «되돌아온 두 시도». 피커를 다시 손대기 전에 읽을 것 |

## ② 핸드오프

없다.

## ③ 토픽 어휘 (SSOT)

새 문서의 `topic` 은 **여기 있는 것을 먼저 쓴다.** 맞는 게 없을 때만 새로 만들고, 그 커밋에서
이 목록에 같이 올린다. 이 목록이 없으면 같은 주제가 비슷한 이름의 폴더로 쪼개진다.

| 토픽 | 무엇을 담나 |
|---|---|
| `product-spec` | 제품 스펙 — 데이터 모델, 알고리즘, 업로드·저장 규칙 |
| `design-system` | 색·타이포·컴포넌트 규칙과 그 값이 사는 곳 |
| `deploy` | 빌드·배포·운영 절차, 서버 구성 |
| `e2e-testing` | 브라우저로 화면을 확인하는 절차와 점검 항목 |
| `native-shell` | iOS 껍데기(`app-ios/`)와 웹↔네이티브 브리지 |
| `doc-storage` | 이 색인처럼 문서 보관 자체를 다루는 것 |
| `ios-keyboard` | 아이폰 가상 키보드와 뷰포트 — 고정 셸과 부딪히는 자리 |

## 이웃 버킷

| | 소유 | 여기서 하는 일 |
|---|---|---|
| `_docs/` | 프로젝트 | 이 문서들 |
| `_note/` | 사람 | **없음.** 생기면 에이전트는 읽기만 한다 |
| `.claude/` | 에이전트 | 세션 상태 등 도구에 묶인 것. 문서가 아니다 |

한 번 섞인 적이 있다 — `.claude/session-state` 가 `_docs/active/planning/2026-08-25/`
아래에 빈 껍데기로 생겨 있었다. 판별 기준은 이름이 아니라 **소유와 도구 결합**이다:
「에이전트 CLI 를 다른 것으로 바꿔도 이 문서가 의미가 있나」— 있으면 `_docs/`, 없으면 `.claude/`.
