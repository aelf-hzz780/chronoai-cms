# 全站下拉与人工渠道边界 / Shared selects and manual-channel boundary

2026-11-04：先前只为工作区和界面语言接入了共用下拉。现在 Studio 根节点中的所有单选 select 自动使用同一 `StudioPickers` 组件，不再要求各页面逐个声明；当前覆盖 19 个控件 ID。原生 select 保留取值和现有 change/Submit 语义，组件只负责展示与交互。

2026-11-04: Previously only workspace and interface language used the shared picker. Every single-select within Studio now uses `StudioPickers` automatically, covering 19 current control IDs without page-by-page opt-in. Native selects retain values and existing change/Submit semantics; the shared component owns presentation and interaction.

覆盖内容库、翻译候选、发布动作、设置、任务筛选、分析筛选、连接、分发、历史人工结果及通用壳。菜单统一挂载到 body，避免编辑器 overflow 裁剪；按视口定位，支持长列表、原生禁用状态、禁用项原因、键盘导航、关闭、标签关联及异步重绘后的焦点恢复。监听器和菜单在生命周期结束时清理。

Coverage includes the library, translation candidates, publication actions, settings, task and analytics filters, connections, distribution, historical manual outcomes and shell. Menus mount under body to escape editor overflow, position within the viewport, and support long lists, native disabled states, disabled-item reasons, keyboard navigation, dismissal, label association and focus restoration after asynchronous redraws. Listeners and portal menus have explicit cleanup.

## 渠道边界 / Channel boundary

Medium 和 HackerNoon 的新增连接、分发、计划及旧计划再次确认在 Studio 暂停；历史任务也不能通过请求/附加批准入队。统一的前端渠道策略同时控制选项展示和 controller 守卫。渠道保持可见并标注“需手动处理”，原因可通过菜单悬浮/键盘或可展开说明阅读。历史内容包、人工报告、备注、观察、取消及分析数据筛选保留。后端/API、旧版 CMS、NyxBot 并未在本次修改中增加或关闭能力。

New connections, deliveries, plans and confirmation of existing plans for Medium and HackerNoon are paused in Studio, including approval-to-queue entry points on historical tasks. One frontend channel policy controls both presentation and controller guards. Channels remain visible as “Manual handling required”; reasons are available through menu hover/keyboard or expandable explanations. Historical packages, manual reports, notes, observations, cancellation and analytics filters remain available. This change does not add or disable capabilities in the backend/API, legacy CMS or NyxBot.

原因按 2026-11-04 核对的官方资料记录：[Medium](https://help.medium.com/hc/en-us/articles/213480228-API-Importing) 不再签发新 integration token 或接受新集成，旧 token 保留但需另行验证。[HackerNoon](https://help.hackernoon.com/import-your-content-to-hackernoon) 的公开说明为网页导入后提交编辑审核；尚未确认官方公开第三方投稿/发布 API，不宣称其“停止 API”。准备材料不等于完成发布。

Reasons reflect official sources checked on 2026-11-04: [Medium](https://help.medium.com/hc/en-us/articles/213480228-API-Importing) no longer issues new integration tokens or accepts new integrations; existing tokens require separate validation for this implementation. [HackerNoon](https://help.hackernoon.com/import-your-content-to-hackernoon) documents web import followed by editorial review; an official public third-party submission/publishing API has not been confirmed, so the UI does not claim an API was discontinued. Preparing content is not completed publication.

## 验证与回滚 / Validation and rollback

- `npm run check`：typecheck、Studio build、423/423 测试通过，无失败或跳过。
- `node --test test/studio-live-api.integration.ts`：7/7 实际 CMS API 浏览器流程通过，无失败或跳过。
- 新增用例先验证人工渠道未禁用的问题，再验证原因、旧意图恢复、旧计划禁用/取消、编辑器裁剪、窄屏边界和菜单回收。既有流程改为操作可见共用控件；DEV 的计划确认继续需要精确批准，历史人工记录通过预置数据验证。
- [日志、截图与源代码/构建产物指纹](evidence/cms-b-shared-controls-20261104/)；独立只读审查未发现阻断。此次浏览器身份和外部平台仍为隔离 fixture，真实 NyxID/平台账号联调未完成。

- `npm run check`: typecheck, Studio build and 423/423 tests pass without failures or skips.
- `node --test test/studio-live-api.integration.ts`: 7/7 actual CMS API browser flows pass without failures or skips.
- Added coverage first reproduced the unblocked manual channels, then checked reasons, restored intents, paused/cancellable historical plans, editor clipping, narrow-screen bounds and portal cleanup. Existing flows now exercise visible shared controls. DEV plan confirmation still requires exact approval; historical manual workflows use pre-existing fixture records.
- [Logs, screenshots and source/build fingerprints](evidence/cms-b-shared-controls-20261104/); independent read-only review found no blockers. Identity and external providers remain isolated fixtures, so real NyxID/platform-account integration is not established.

回滚只需撤销本次前端修改并重新构建 Studio，无数据库迁移。提交保留于原功能分支；PR 暂缓，不合并、不部署。

Rollback consists of reverting this frontend change and rebuilding Studio; no database migration is involved. Work remains on the existing feature branch, with PR creation deferred and no merge or deployment.
