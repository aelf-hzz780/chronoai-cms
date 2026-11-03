# CMS B implementation ledger / 实施台账

2026-11-03. Base `ce4fb1a`, branch `codex/004-cms-b-integration`.

## Scope / 范围

Approved WP00–08, C01–C10 and 14-page B experience. Root owns architecture/acceptance; execution agents implement bounded file sets. The initial milestone is not the full goal.

保持全站对接范围。根 Agent 负责架构与验收，执行子 Agent 编码。业务修改位于独立CMS checkout，原型和原有BlogSystem修改不动。

| WP | Status | Evidence / Remaining |
| --- | --- | --- |
| 00 contracts | in progress | Architecture contract written; isolated ce4fb1a typecheck + 307/307 baseline PASS; remaining wire schemas completed with each package |
| 01 shell/workspaces | local accepted | C01/C04, shell, state-bound OIDC return, responsive owner switching; real Nyx Live deferred by user |
| 02 content/editor | local accepted | Real API browser PASS: save/refresh, exact Markdown bytes, media, permissions, conflict, translations, mobile |
| 03 original/tasks | local accepted | 379-test combined gate; fixed b8d1daf actual API browser confirms frozen revision, authoritative queued/cancelled state, task list and mobile |
| 04 connections/approvals | in progress | C06 backend accepted (d761db7); connection/approval UI remains; live Nyx deferred |
| 05 distribution/manual | backend locally accepted, UI in progress | C07–09 persisted plans, atomic consumption, private notes and historical-copy observations at 0d83b78; final Studio workflow remains |
| 06 governance/metrics | local accepted | 1745f44 Studio; actual CMS session browser proves grant/revoke during directory outage, unavailable external metrics, independent UI locale and current Admin revocation |
| 07 Ghost theme | local accepted, bounded | Theme/GScan fixture PASS; actual local EN/ZH upload/render/restore PASS; real CMS publishing, authors, links, consent and offline reading PASS; private media volume promotion on this host and release-email configuration remain separate |
| 08 integration/handoff | in progress | Baseline and acceptance matrix preparation; no Live claim |

## Current verification / 当前验证

- Baseline source was exported from the exact Git commit, separately from active edits.
- Restricted browser launch failed in the sandbox; the same isolated baseline check passed with approved browser-launch permissions: typecheck, 307 tests, 0 failures (`/tmp/cms-b-baseline-check-unrestricted.log`).
- C01/C02 failure-first evidence: `/tmp/cms-c01-c02-red.log`. Root review must inspect implementation and passing regressions before marking accepted.
- Root caught and requested fixes for historically published stale translation edges, reversed translation navigation and compact/mobile workspace selectors. Regression scenarios were added before fixes.
- `test/studio-live-api.integration.ts` uses actual Fastify, SQLite, sessions and CSRF with an isolated identity provider. It is separate from frontend response fixtures and real Nyx/Ghost Live acceptance. Screenshots are under `docs/evidence/cms-b-m1`.
- Root real-API browser rerun passed (1 aggregate test, `/tmp/cms-b-m1-real-api.log`), including narrow-screen owner switching. M1+C03+theme-source fixed gate passed typecheck and 353/353 tests (`/tmp/cms-b-m1-c03-check.log`). Local implementation commit: `ce4203b`.
- Existing local Ghost EN 2468 and ZH 2469 recovered when Docker Desktop started. Read-only `infra/ghost/experiment.py --verify` passed for both existing posts, language/author/code/table/sitemap and cross-site 404. No volume or credential reset.
- User explicitly deferred real NyxID integration on the other host. It remains an external acceptance item rather than a blocker for local implementation; no remote integration claim is made.
- `test/cms-ghost-local.integration.ts` passed actual CMS API/Worker/Ghost publication, author mapping, bidirectional hreflang, consent allow/decline/withdraw/GPC/DNT and reading after CMS stopped (53.2s). Initial harness failure was missing the already required Ghost CDN origin configuration; no business verification was weakened. Synthetic posts were restored to drafts and both themes restored. This run excludes private-image volume promotion and Nyx Live.
- Fixed combined WP03+C05/C06 gate: typecheck + 379/379 tests, 0 failures (`/tmp/cms-b-wp03-c05-c06-check.log`). Backend `d761db7`, frontend `b8d1daf`. C05 covers current member eligibility; C06 covers exact upstream fixtures, actual session/CSRF, return replay/forgery, mid-flight revocation and migration reopen.
- Exported `b8d1daf` independently to `/tmp/cms-b-wp03-acceptance`, built its Studio and ran root real-API acceptance: M1 and WP03, 2/2 passed. WP03 proves actual frozen confirmation, subsequent submitted revision isolation, authoritative cancellation and queue state, plus fresh 390px task navigation. Screenshots: `docs/evidence/cms-b-wp03/`. No live provider/Worker execution is claimed for this UI run.
- Fixed `0a7c931` exported to `/tmp/cms-b-wp05-wp06-fixed`: typecheck + 402/402 tests PASS (`/tmp/cms-b-wp05-wp06-check.log`). This covers the C07–09 migration and safety extensions plus governance UI. Later C10/UI work needs its own final gate.
- WP06 actual API browser PASS after correcting a test-only translated title expectation; no product workaround. Screenshots: `docs/evidence/cms-b-wp06/`.
- WP08 actual API browser parity PASS: old UI creates a draft, Studio writes the next immutable revision, old UI reads it back; both revisions and all schema versions survive and no outbound job is created.
- No external publication, real Nyx connection creation or real role mutation, deployment or push occurred in this task.

所有验证需标明固定版本/本地/fixture/真实外部边界；尚无最终完成声明。

## Studio build and deployment / Studio 构建与部署

Studio browser code is built with `npm run build:studio`; `npm run dev` and `npm test` run this automatically through `predev`/`pretest`. The generated `web/studio/dist` directory is ignored by Git. Before a deployment that starts `node src/main.ts` directly, run `npm run build:studio` in the release checkout and include its generated assets. Existing systemd launch commands remain unchanged.

Studio 浏览器代码通过 `npm run build:studio` 构建；开发启动及标准测试由 `predev`/`pretest` 自动先构建。生成的 `web/studio/dist` 不进入 Git。部署若直接执行 `node src/main.ts`，必须先在发布 checkout 运行构建并携带产物；本轮不修改 systemd 自动执行构建。
