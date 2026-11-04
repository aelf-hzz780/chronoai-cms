# Studio 公共控件收敛 / Shared Studio UI primitives

2026-11-04：对 B 方案 Studio 的全站按钮、输入框、确认及提示进行盘点。此前通用按钮已有 helper，但仍有 14 处独立按钮模板、16 处按钮式链接、23 处 input 和 6 处 textarea；确认使用 11 处浏览器原生 confirm，提示由不同页面直接拼接。此次统一模板与交互入口，不修改服务端、数据库、API 合约、权限、发布策略或审批规则。

2026-11-04: Audited buttons, inputs, confirmations and notices across the B-design Studio. A button helper already existed, alongside 14 standalone button templates, 16 button-style links, 23 inputs and six textareas. Eleven confirmation sites used browser confirm; notices were assembled in individual views. This change unifies presentation and interaction entry points without changing the server, database, API contracts, permissions, publishing policy or approval rules.

## 组件与边界 / Components and boundaries

| 公共组件 / Shared component | 覆盖与取舍 / Coverage and tradeoff |
| --- | --- |
| `ui.ts`: `controlButton`, `button`, `linkButton` | 壳、内容库、编辑器、发布、任务、连接、分发、分析、成员、设置与引导；保留原有 button/link、Submit、ID、data 属性及 disabled。 / Shell and all Studio views retain button/link, Submit, ID, data attributes and disabled semantics. |
| `ui.ts`: `input`, `textarea` | 统一边框、圆角、间距、focus、disabled、readonly；标题、Markdown、搜索、内容包保留写作/布局变体，checkbox、file 共用入口。 / Shared states with writing and layout variants for titles, Markdown, search and packages; checkbox and file inputs use the same entry point. |
| `ui.ts`: `notice`, `confirmationPanel` | 静态说明与动态结果共用视觉；只有操作结果使用 status/alert；成员的页内确认保留页内流程。 / Shared visuals distinguish static guidance from live status/alert; member confirmation remains inline. |
| `dialogs.ts`: `StudioDialog`, `captureFocus` | B 风格原生 dialog 容器，统一取消、确认、Escape、遮罩、Tab 焦点循环及重绘后焦点恢复。 / B-style dialog with shared cancellation, confirmation, Escape, backdrop dismissal, Tab focus containment and redraw-safe focus return. |
| 既有 `StudioPickers` / Existing `StudioPickers` | 19 个单选 ID 继续使用公共下拉，独立管理菜单 portal 与键盘操作；渠道说明继续使用既有公共 `channel-policy.ts`。 / The 19 single-select IDs keep the shared picker and its portal/keyboard behavior; channel explanations retain the shared channel policy. |

公共组件只负责展示。新增异步确认绑定原有页面上下文、owner、session、CSRF 与取消信号；等待前固定操作材料，确认后重新检查上下文。任务轮询在确认期间暂停。未保存草稿的导航先保留旧地址/工作区，明确确认后才切换；并发导航不能复用旧回答。取消不会调用写接口。业务校验失败仍通过既有错误机制和 Trace ID 展示。

Components own presentation only. Async confirmation is bound to the existing page context, owner, session, CSRF and abort signal. Payloads are captured before waiting and context is checked again afterward. Task polling pauses during confirmation. Unsaved navigation retains the old URL/workspace until an explicit choice, and overlapping navigation cannot reuse an earlier answer. Dismissal issues no write request. Business failures retain the existing error handling and Trace ID presentation.

浏览器关闭/刷新时的 `beforeunload`、文件选择器、日期输入的日历仍使用浏览器原生能力；没有新增日期库或更改表单取值。旧版 CMS 和独立 4173 原型不在本次 B Studio 组件迁移范围。

Browser close/reload `beforeunload`, file choosers and date-input calendars remain browser-native. No date library or form value conversion was added. The legacy CMS and separate 4173 prototype are outside this B Studio migration.

## 验收与回滚 / Acceptance and rollback

- `npm run check`：typecheck、Studio build、425/425 测试通过，无失败/跳过。
- `node --test test/studio-live-api.integration.ts`：真实本地 CMS API 浏览器流程 7/7 通过，无失败/跳过。
- 先用红测复现缺少公共弹窗与重绘后焦点丢失，再验证取消零请求、草稿保留、工作区/地址一致、Escape/Tab、上下文变化中止旧确认，以及连接/计划取消后的焦点恢复。
- 两名只读审查者指出同一焦点问题，修复后第二轮复核通过。人工检查本地连接、分析、编辑器和确认弹窗；既有窄屏流程继续通过。截图、日志及 source/build 指纹保存在 [evidence](evidence/cms-b-ui-primitives-20261104/)。

- `npm run check`: typecheck, Studio build and 425/425 tests pass, with no failures/skips.
- `node --test test/studio-live-api.integration.ts`: 7/7 real local CMS API browser flows pass, with no failures/skips.
- Red tests first reproduced missing shared dialogs and focus loss after redraw; acceptance covers zero-write dismissal, draft preservation, workspace/URL consistency, Escape/Tab, stale-confirmation abort and focus return after connection/plan cancellation.
- Two read-only reviewers identified the same focus issue; the second review passed after correction. Local visual checks covered connections, analytics, editor and confirmation; existing narrow-screen flows also pass. Screenshots, logs and source/build fingerprints are retained in [evidence](evidence/cms-b-ui-primitives-20261104/).

预览地址仍为 `http://127.0.0.1:4174/studio`，没有重启预览服务或清空原数据。此环境使用真实 CMS 与隔离数据库，身份和平台结果为 fixture；真实 NyxID/外部账号联调继续后置。交付留在 `codex/004-cms-b-integration`，PR 暂缓，不合并、不部署。回滚本次前端提交并重建 Studio 即可，无数据库迁移。

Preview remains at `http://127.0.0.1:4174/studio`, without restarting the service or clearing existing data. It uses the real CMS and isolated database, with fixture identity/provider results; real NyxID and external-account integration remains deferred. Delivery stays on `codex/004-cms-b-integration`; PR creation is deferred, with no merge/deployment. Revert this frontend commit and rebuild Studio to roll back; no database migration is required.
