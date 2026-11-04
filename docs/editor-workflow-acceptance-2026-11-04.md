# 编辑与审核交互验收 / Editor and review acceptance

## 目标与边界 / Goal and scope

新稿不再要求先手动“保存修订”。组织成员使用“提交审核”；个人工作区和有发布权限的角色使用“预览并发布”。两者先保存当前内容，再调用已有提交接口或进入确切修订的确认页。“保存草稿”保留为次要操作，沿用 B 方案组件与视觉。后端 API、鉴权、审批和发布 Worker 均未修改。

New drafts no longer require a separate manual revision save. Organization members use “Submit for review”; personal owners and authorized publishers use “Preview & publish.” Both save current changes first, then use the existing submission endpoint or open the exact revision confirmation page. “Save draft” remains secondary. B-style components, backend APIs, authorization, approvals and publishing workers are unchanged.

## 编排与状态 / Orchestration and state

前端使用单一顺序编排，绑定工作区、会话、CSRF、草稿对象和取消上下文。干净稿不重复保存；保存失败立即停止；只读审阅他人投稿不保存。翻译稿部分成功时保留已创建文章，重试先补关联，避免重复创建。预览操作不创建 release；真实发布继续要求确认页中的单独操作。

A single frontend sequence binds workspace, session, CSRF, draft identity and cancellation context. Clean drafts are not saved again; save failures stop the sequence; reviewing another creator's submission never saves it. Partial translation success retains the created article and retries its source link before proceeding. Preview does not create a release; publication still requires the separate confirmation action.

列表和编辑器说明待组织管理员或 Publisher 审阅；新修改未提交、此前版本仍在线分别展示。站点配置提前通过已有只读接口读取，明确区分未配置与读取失败，均不阻断草稿或提交审核。站点语言取文章语言，界面语言不改变站点归属。

Library and editor guidance identify administrators or publishers as the next reviewers. Unsubmitted changes and an existing live version are distinguished. Existing read-only site configuration is loaded early; missing configuration and failed reads are distinct and do not block drafts or review submissions. Article language selects the site independently of interface language.

## 验证 / Validation

- Studio build 与 TypeScript typecheck 通过；相关回归 46/46 通过。新增 8 组浏览器场景覆盖单次提交、发布预览、保存失败、干净稿、关联失败重试、重复点击、工作区切换及站点降级；保存成功而提交失败的状态提示经先失败后通过验证。
- 所有浏览器回归使用隔离 API fixture，不代表 Ghost 或 DEV 真实发布通过。
- 真实 NyxID 四个测试账号重新登录，8 项工作区权限和 member 站点隔离检查通过。
- 真实浏览器使用 member 新建独立验收稿，一次点击完成保存及组织审核提交；已有个人文章进入预览确认，未确认发布。

- Studio build and TypeScript typecheck passed; all 46 relevant regressions passed. Eight new browser cases cover one-action submission, publication preview, failed saves, clean drafts, link retries, repeated clicks, workspace changes and site degradation. Save-success/submission-failure guidance was verified with a failing regression before the fix.
- Browser regressions use isolated API fixtures and do not establish live Ghost or DEV publication acceptance.
- Four real NyxID test accounts signed in again; eight workspace capability and member-site isolation checks passed.
- The real browser created a separate member acceptance draft and saved/submitted it in one action. An existing personal article reached publication preview without confirming publication.

## 本地站点与回滚 / Local sites and rollback

member 个人工作区新增独立 EN/ZH Ghost 与数据库，TLS、locale、B fixture theme 和精确作者 ID 已核验。既有 solo/组织四站绑定保留。当前测试署名 `test` 映射至各自站点的测试作者账户，Ghost 显示名仍为 `ChronoAI Acceptance Author`。每个新 Ghost 仅有默认 `coming-soon` 种子文章，未写入业务文章。

The member personal workspace has isolated EN/ZH Ghost instances and databases. TLS, locale, the B fixture theme and exact author IDs were verified. Existing solo/organization bindings are unchanged. The test credit `test` maps to each site's test author account, whose Ghost display name remains `ChronoAI Acceptance Author`. New Ghost instances contain only their default `coming-soon` seed, with no business article writes.

外发继续暂停，Worker 未启动。界面回滚可 revert 本交互提交并重新构建 Studio；保留独立的登录引导提交。站点回滚只停用新增 member 服务，保留数据卷与运行时配置备份。后续 Ghost/DEV 实际发布、公开署名及外部账号验证仍需单独确认和验收。

Outbound publishing remains paused and workers are stopped. UI rollback can revert this workflow commit and rebuild Studio while retaining the separate sign-in guidance commit. Site rollback stops only the new member services and preserves their data volumes and runtime configuration backup. Actual Ghost/DEV publishing, public author presentation and external-account validation remain separate confirmation and acceptance steps.
