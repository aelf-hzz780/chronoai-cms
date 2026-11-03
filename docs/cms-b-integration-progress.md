# CMS B implementation ledger / 实施台账

2026-11-03. Base `ce4fb1a`, branch `codex/004-cms-b-integration`.

## Scope / 范围

Approved WP00–08, C01–C10 and 14-page B experience. Root owns architecture/acceptance; execution agents implement bounded file sets. The initial milestone is not the full goal.

保持全站对接范围。根 Agent 负责架构与验收，执行子 Agent 编码。业务修改位于独立CMS checkout，原型和原有BlogSystem修改不动。

| WP | Status | Evidence / Remaining |
| --- | --- | --- |
| 00 contracts | in progress | Architecture contract written; isolated ce4fb1a typecheck + 307/307 baseline PASS; remaining wire schemas completed with each package |
| 01 shell/workspaces | acceptance | C01/C04, Studio shell and state-bound OIDC return implemented; mobile owner selector correction under final root recheck |
| 02 content/editor | acceptance | C02 and editor implemented; real API browser passed core workflow, media assertions passed before mobile failure; full M1 rerun pending |
| 03 original/tasks | in progress | Exact task read model, task-scoped media and bulk workspace directory delegated |
| 04 connections/approvals | pending | Pinned Nyx upstream contracts under inspection |
| 05 distribution/manual | pending | Plans, note persistence and historical-copy observations required |
| 06 governance/metrics | pending | Member directory adapter and real metric views required |
| 07 Ghost theme | in progress | Separate theme implementation and official gscan validation; real author email requested for final package |
| 08 integration/handoff | in progress | Baseline and acceptance matrix preparation; no Live claim |

## Current verification / 当前验证

- Baseline source was exported from the exact Git commit, separately from active edits.
- Restricted browser launch failed in the sandbox; the same isolated baseline check passed with approved browser-launch permissions: typecheck, 307 tests, 0 failures (`/tmp/cms-b-baseline-check-unrestricted.log`).
- C01/C02 failure-first evidence: `/tmp/cms-c01-c02-red.log`. Root review must inspect implementation and passing regressions before marking accepted.
- Root caught and requested fixes for historically published stale translation edges, reversed translation navigation and compact/mobile workspace selectors. Regression scenarios were added before fixes.
- `test/studio-live-api.integration.ts` uses actual Fastify, SQLite, sessions and CSRF with an isolated identity provider. It is separate from frontend response fixtures and real Nyx/Ghost Live acceptance. Screenshots are under `docs/evidence/cms-b-m1`.
- No external publication, connection creation, role mutation, deployment or push occurred in this task.

所有验证需标明固定版本/本地/fixture/真实外部边界；尚无最终完成声明。

## Studio build and deployment / Studio 构建与部署

Studio browser code is built with `npm run build:studio`; `npm run dev` and `npm test` run this automatically through `predev`/`pretest`. The generated `web/studio/dist` directory is ignored by Git. Before a deployment that starts `node src/main.ts` directly, run `npm run build:studio` in the release checkout and include its generated assets. Existing systemd launch commands remain unchanged.

Studio 浏览器代码通过 `npm run build:studio` 构建；开发启动及标准测试由 `predev`/`pretest` 自动先构建。生成的 `web/studio/dist` 不进入 Git。部署若直接执行 `node src/main.ts`，必须先在发布 checkout 运行构建并携带产物；本轮不修改 systemd 自动执行构建。
