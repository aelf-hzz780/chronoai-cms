# CMS B 交付更新 / CMS B delivery update

日期：2026-11-05（Asia/Shanghai）。本页汇总本次补推范围和已完成的局域网验收；历史方案、截图和验收文档保留原日期，不能把其“尚未实施／没有 push／联调后置”描述当作当前结论。

Date: 2026-11-05 (Asia/Shanghai). This update records the requested branch delivery and completed LAN acceptance. Historical plans and evidence retain their original dates; their earlier “not implemented,” “not pushed” and “integration deferred” statements are not the current status.

## 交付内容 / Included work

- `73762db`：首次未登录显示正常 NyxID 登录引导，移除 Studio 的旧版 CMS 入口。
- `b141bf8`：保留“保存草稿”，主要操作按权限自动保存后提交审核或进入发布预览；显示审阅人、待提交修改与站点配置引导。沿用已有 API、鉴权和发布规则。
- B 方案静态原型、设计方案、真实对接计划、11/03 原型审查文本与截图，以及已确认的容量复评决策和 loopback Ghost 实验配置。

- `73762db`: normal NyxID sign-in guidance for signed-out users, with the legacy CMS link removed from Studio.
- `b141bf8`: secondary draft save plus role-aware save-and-submit or save-and-preview actions, with reviewer, pending-change and site-configuration guidance. Existing APIs, authorization and publishing rules are retained.
- The B prototype, design proposal, integration plan, November 3 audit artifacts, agreed capacity-review decision and loopback Ghost experiment configuration are included.

正式交付目标为 `aelf-hzz780/chronoai-cms` 的 `codex/004-cms-b-integration`。早期 BlogSystem 工作区没有 remote，其本次增量以单独本地快照保留，再整理到正式分支；来源 commit 与逐文件 SHA-256 见 [导入清单](evidence/cms-design-import-20261105.json)。不导入 `.runtime`、数据库、证书私钥、账号文件、Cookie 或 OAuth 凭据，不覆盖新版业务实现。

The delivery target is `aelf-hzz780/chronoai-cms`, branch `codex/004-cms-b-integration`. The early workspace has no remote; its reviewed delta is preserved in a local snapshot and imported into the delivery branch. The import manifest records provenance and file hashes. Runtime state and credentials are excluded, and the current business implementation is retained.

同步的 `infra/ghost` 变更属于旧的 2468/2469 loopback 双站实验：以显式配置控制设备邮件验证，并保留密码认证及 SMTP 恢复说明。本次只提交配置文件，不重建服务，也不改变当前六站局域网验收环境的验证设置。

The imported `infra/ghost` change belongs to the older loopback two-site experiment on ports 2468/2469. It makes device-email verification configurable while retaining password authentication and documented SMTP restoration. This delivery only commits files: it does not recreate services or change verification settings in the separate six-site LAN environment.

## 文档入口与历史范围 / Document navigation and history

| 内容 / Item | 入口 / Entry | 边界 / Scope |
| --- | --- | --- |
| B 方案静态原型 / Static prototype | [README](../prototypes/nyx-cms-b/README.md)、[效果总览 / Gallery](../prototypes/nyx-cms-b/review.html) | 14 页、内存样例；不是当前真实 CMS / Fourteen pages, simulated data, not the live CMS |
| 设计方案 / Design proposal | [2026-11-02](ui-ux-proposal-2026-11-02.md) | 原始设计决策 / Historical design decisions |
| API 与工作包 / API plan | [2026-11-03](cms-integration-plan-2026-11-03.md) | 实施前合同与范围 / Pre-implementation scope |
| 原型审查 / Prototype audit | [2026-11-03 audit](audits/2026-11-03-prototype/README.md) | 修正前问题复现；后续原型修正见 DELIVERY.md / Findings before the prototype fixes |
| 当前 UI 交互 / Current UI flow | [编辑器验收 / Editor acceptance](editor-workflow-acceptance-2026-11-04.md) | `b141bf8` 的实际交互和回归 / Version-bound interaction evidence |
| 实际业务交接 / Business handoff | [CMS B handoff](cms-b-handoff.md) | 结合本页更新阅读 / Read together with this update |

静态原型仍保留当时的演示状态和交互，不是当前渠道能力合同。实际 Studio 已将 Medium/HackerNoon 标为人工渠道；自动分发资格、授权和真实账号验证以业务合同及当前配置为准。

The static prototype preserves historical interaction examples. It does not override current channel capabilities. Studio identifies Medium/HackerNoon as manual channels; automation depends on current contracts, configuration, authorization and real-account verification.

## 真实 NyxID 与 Ghost 验收 / Real NyxID and Ghost acceptance

此前后置的局域网 NyxID 登录已恢复并完成真实账号、PKCE、JWT 验签、scope、组织角色和 CMS OIDC 登录回调的联调。连接返回地址已登记，但这不代表真实外部连接返回流程已验收。身份 issuer/audience 保持原值，网络入口由受信任 HTTPS Discovery 提供。个人和组织按 owner × language 绑定独立 Ghost，member 的个人 EN/ZH 测试站已独立配置。

The previously deferred LAN NyxID flow has been exercised with real test accounts, PKCE, JWT validation, scopes, organization roles and the CMS OIDC callback. The connection-return URL is registered, but that is not evidence of live provider connection-return acceptance. The original issuer/audience identity is retained while trusted HTTPS Discovery supplies network endpoints. Ghost bindings remain isolated by owner and language, including the member's personal EN/ZH test sites.

2026-11-04 23:22（Asia/Shanghai），用户明确确认的组织英文验收稿完成 Admin 首发：原作者保存并提交确定修订，Admin 通过真实 CMS API 确认，受限执行器仅处理一个原文 release。原生产 Ghost Adapter 对公开正文、署名、语言和实际浏览器绘制核验通过，状态为 `published`，Ghost 发文 POST 仅一次。该结论是本次局域网单篇验收，不代表 D1–D9 全量签收或所有平台发布通过。

At 23:22 on November 4, 2026 (Asia/Shanghai), an explicitly approved English organization article passed its first Admin publication. The author saved and submitted an exact revision; the real Admin confirmed through CMS, and a bounded runner processed one original release. The production adapter verified the live body, author, language and browser paint. CMS recorded `published` after exactly one Ghost post creation. This is bounded LAN acceptance, not complete D1–D9 or provider sign-off.

| 证据 / Evidence | 值 / Value |
| --- | --- |
| 运行源码 / Runtime business commit | `b141bf849c3c9bdff78fdd216e360809a97aa518` |
| 批准正文 SHA-256 / Approved Markdown SHA-256 | `ef2bf83d245766368fe907a628ce0ff3f124c5ead0d991aa124d96bd78e64226` |
| 发布修订 / Published revision | `049f29ab-a21f-4b63-97a8-a0cd2c0e2002` |
| Release | `78adf8b8-606c-4e9b-8af0-e5e0b5894faf` |
| Trace ID | `3ff0e592-3de2-48ba-b455-de9e9796d69a` |
| 结果 / Result | `published`; public HTTP 200; one Ghost creation POST |
| 执行后 / After execution | outbound paused; worker processes 0; deliveries 0; release job done; one projection queued |

原始运行证据、账号、目标地址和配置由本地运维保留；本公开摘要不携带私密联调包。原始备份不能在 Ghost 已写入后直接还原以抹去发布事实；撤回文章需单独授权。

Raw evidence, accounts, target addresses and configuration remain with the local operator. This public summary does not include the private integration bundle. A database restore must not erase the record of a completed remote write; withdrawal requires separate authorization.

本地组织英文测试主题仅排除了 Ghost 自动注入的 Portal/Search CDN 脚本，B 样式未改，原主题已备份。正式仓库主题未因此全局关闭会员或搜索；生产主题的相关资源、会员功能和维护者邮箱仍按正式打包要求处理。

Only the local organization-English acceptance theme excluded automatically injected Portal/Search CDN scripts. B styling and the previous theme backup were retained. The repository theme does not globally disable membership or search; production resources, membership behavior and maintainer metadata remain release concerns.

## 本次检查与剩余项 / Checks and remaining work

本次推送前重新通过 Studio build、TypeScript typecheck，以及原型 17 项状态检查和 42 项工作流检查。Ghost 实验 5 项离线回归在普通和优化模式下均通过，Compose 使用合成配置值执行 `config --quiet` 通过，未启动服务。129 个原样导入文件和 51 个历史审查 artifact 的 hash 均一致。当前业务源码此前 46/46 相关回归证据由只读审查复核；本次不重复真实发布，不将历史测试计数当作新一轮全量测试。

Studio build, TypeScript typecheck, 17 prototype state checks and 42 prototype workflow checks were rerun for this delivery. All five offline Ghost checks passed in normal and optimized Python modes. Compose configuration validated with synthetic values and no service startup. Hashes matched for 129 verbatim imports and 51 historical audit artifacts. The prior 46/46 relevant regressions were reviewed against the unchanged business revision. No live publication was repeated, and historical counts are not presented as a new full-suite run.

Publisher 更新稿只有本地待确认预览，未创建新的 CMS 修订或 update release。DEV 继续暂停；其他外部平台、公开部署、图片挂载路径及具名运维签收仍分别验收。本次只做 Git 交付，不合并、不部署、不恢复 Worker。

The Publisher update exists only as a pending local preview, with no new CMS revision or update release. DEV remains paused. Other providers, public deployment, media mounts and named operational sign-off remain separate acceptance items. This action delivers Git changes only: no merge, deployment or worker resume.
