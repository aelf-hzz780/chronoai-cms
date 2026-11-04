# 新版 Studio 与 DEV 本机联调 / Local Studio and DEV integration

2026-11-04，v0.7 有界交付。新版 Studio、真实本地 NyxID 登录与权限、CMS 原文发布已运行。个人 DEV 连接新增显式 opt-in exact-service 执行批准；真实 Studio 已确认新任务并取得可关联的 Nyx pending request。此次未执行 Nyx 批准、redeem 或 DEV provider 写入，尚未取得本次具体公开发布授权，D1–D9 保持 **NOT_ACCEPTED**。

Bounded delivery against v0.7 on 2026-11-04. Studio, real local NyxID authentication and permissions, and CMS original publication run locally. A personal DEV connection can now opt into exact-service execution approval; the real Studio flow has created a correlated pending Nyx request. This run has performed no approval decision, redemption, or DEV provider write. Specific public-publication authorization remains outstanding, and D1–D9 remain **NOT_ACCEPTED**.

## 版本与证据归属 / Versions and evidence ownership

历史业务版本 `ea8bb6592a9c100f5b95a1d391b308dedb1c9af2` 基于 UI `ed77c70aca6bfc169b53956b0229fa2e7d171ced`，包含 Nyx GraphQL 根路径修复 `2284973`。该阶段的 431 tests、四类账号 OAuth/Studio 验证、Ghost 原文发布与旧 DEV queued 任务证据继续保留，不能改标为本次新代码的执行结果。

Historical business revision `ea8bb6592a9c100f5b95a1d391b308dedb1c9af2` is based on UI `ed77c70aca6bfc169b53956b0229fa2e7d171ced` and includes Nyx GraphQL root-route fix `2284973`. Its 431 tests, four-role OAuth/Studio checks, original Ghost publication, and old queued DEV task remain historical evidence; they are not relabeled as execution of the new code.

个人 exact-service opt-in 和界面文案在 `25b2b3e248878b67bdbef91f38082e698b531215` 实现，并在该干净版本的 3458 实例上真实创建新 delivery 和 pending request。后续独立审查修复了动态 declared catalog 的 `operation_generation:null` 兼容问题：null/缺失值省略，显式 0 保留，已声明数字必须与 create 响应一致。最终修复版本为 `7f7705712c36c4cd9a15a36c0b094699cf63a18f`，最终 build/typecheck 与完整测试结果为 `442` tests 通过、0 skipped。最终版本已部署。北京时间 13:19:29 的独立只读复验通过：472 个文件 hash、数据库 integrity/FK、12 个端点、旧容器 ID/image/mounts 与无 Worker 状态均符合预期；同一任务的 owner、client、冻结 actor 和全部请求摘要一致。Nyx 请求已自然过期，未重建、续期或批准。

Personal exact-service opt-in and the scoped UI labels were implemented in `25b2b3e248878b67bdbef91f38082e698b531215`; the new delivery and pending request were genuinely created on the clean 3458 runtime at that revision. Independent review then repaired compatibility with dynamic declared catalogs returning `operation_generation:null`: null or absent values are omitted, explicit zero is retained, and a published numeric generation must match the create response. The final fix is `7f7705712c36c4cd9a15a36c0b094699cf63a18f`, with build/typecheck and `442` complete tests passing, zero skipped. The final revision is deployed. Independent read-only verification at 13:19:29 Beijing time passed all 472 file hashes, database integrity/FK checks, 12 endpoints, preservation of the old container identity/image/mounts, and the absence of a worker. The same task retains its owner, client, frozen actor, and all request digests. The Nyx request expired naturally; it was not recreated, renewed, or approved.

交付分支为 `codex/005-cms-dev-live-integration`，目标远程为 `git@github.com:aelf-hzz780/chronoai-cms.git`。PR 创建请求返回 HTTP 403，尚未成功创建本次 PR；不能以本地提交或分支同步替代 PR 状态。

The delivery branch is `codex/005-cms-dev-live-integration` on `git@github.com:aelf-hzz780/chronoai-cms.git`. PR creation returned HTTP 403, so this work has no successfully created PR. Local commits or branch synchronization do not establish PR creation.

| 入口 / Entry | 地址与边界 / Address and boundary |
| --- | --- |
| 新版 Studio / New Studio | <http://localhost:3458/studio>；真实 OAuth，无测试登录后门 / Real OAuth, no test-login bypass |
| 新版 API / New API | <http://localhost:3458/openapi.json>；独立 SQLite、容器 `blogsystem-cms-dev-live-20261104` |
| 本次原文 / Test original | <http://localhost:3468/chrono-5c71a85d-1e45-40ae-85c5-4ecd2dd14824/>；仅本机可达 / Localhost only |
| 原实例 / Preserved instance | <http://localhost:3457>；既有 service catalog 仍路由此入口 / Existing service catalog still routes here |
| NyxID | 门户 / Portal <http://localhost:3000>，issuer/API <http://localhost:3001> |

NyxID 后端 `049ee1c`、门户 `c65dc4be` 仍为已披露本地补丁。本次未修改 Nyx 代码、审批策略或全局 timeout。独立 OAuth client `9568aa1c-441d-401a-abfb-b8c3d8c25e49` 仅登记 `http://localhost:3458/auth/callback`，scope 为 `openid profile proxy`。已有 service catalog 仍指向 3457，不宣称新版 Nyx service 入口已重跑。localhost 端口共享 cookie 域，浏览器验证使用独立 context。

NyxID backend `049ee1c` and portal `c65dc4be` remain disclosed local patches. This work changes no Nyx code, approval policy, or global timeout. The separate OAuth client `9568aa1c-441d-401a-abfb-b8c3d8c25e49` registers only `http://localhost:3458/auth/callback` with `openid profile proxy`. The existing service catalog still targets 3457; this run does not claim renewed service-entry validation on 3458. Browser verification uses isolated contexts because localhost ports share a cookie domain.

## 真实个人 exact-service 准备 / Real personal exact-service preparation

只对独立 3458 的个人 DEV binding 设置 `executionApproval:"exact"`。该配置进入 connection fingerprint 和冻结 delivery payload，客户端不能覆盖；组织写入继续使用声明 operation 的 exact Admin 批准，delegated generic 不获放行。个人界面明确显示 NyxID personal owner 精确执行批准，组织界面仍标明 organization Admin。它是平台执行批准，不增加内容编辑二审。

Only the personal DEV binding in the isolated 3458 runtime enables `executionApproval:"exact"`. This server-owned mode is frozen in the connection fingerprint and delivery payload. Organization writes retain exact Admin approval for declared operations, and delegated generic calls remain rejected. The personal UI identifies the personal owner as the NyxID execution approver; organization UI identifies the organization Admin. This is execution authorization, not an additional editorial review.

旧 delivery `f582b12e-406f-43d2-ab0e-9c997048457a` 已经官方 CMS cancel API 取消。其 actor 密文摘要和冻结 payload 保持不变，没有直接改写旧任务身份。取消与新确认使用官方 Nyx 登录和复用既有 consent 的 OAuth 流程取得的新会话。真实 Chromium Studio 重新选择同一 release、全文、确切 DEV connection 和权利确认，生成新任务。

Old delivery `f582b12e-406f-43d2-ab0e-9c997048457a` was cancelled through the official CMS cancel API. Its actor ciphertext digest and frozen payload remain unchanged; no saved identity was replaced. Cancellation and reconfirmation used a fresh session obtained through official Nyx login and OAuth with existing consent reused. Real Chromium Studio reconfirmed the same release, full text, exact DEV connection, and rights to create a new task.

| 精确身份 / Exact identity | 值 / Value |
| --- | --- |
| New delivery | `7c2bb69b-b2f5-4f25-bcb4-32569d48613c` |
| Nyx request reference | `af119488-3262-4f31-9110-8920f3b6b290` |
| Release | `1bca49fa-8caa-4e7f-90b2-012e1fde3edc` |
| Personal Nyx UserService | `fd39d48d-01a5-4fa0-b540-36f06597e2f7` |
| DEV account | `@aelfhzz780` / `4223973` |
| Operation | `nyx_generic_proxy_v1`，generation `1` |
| Observed at | 北京时间 `2026-11-04 13:14:23.848`（`05:14:23.848Z`）：Nyx `pending`，CMS `approval_needed` |
| Original request expiry | 北京时间 `2026-11-04 13:19:21.998`（`05:19:21.998Z`）；历史有效期，不代表当前仍有效 / Historical expiry, not a claim of current validity |
| Body SHA-256 | `0b748b2a570e8bee01224b9399792ac50593522ac51d34a406f81609b336f4e9` |
| Complete request SHA-256 | `9111d1efa00be5f1c480916aeeb6b13bf992e14e7a0159624e31d9db10fa268b` |
| Operation digest | `sha256:a25be98437629748edbe2dff65594981d27871dbb48f78d0b3fa35353b21b431` |

新正文仅内部 `chrono-delivery` marker 随新 delivery ID 改变；标题、可见正文、署名、来源链接与目标账号保持一致。create 返回的 request ID、user service ID、catalog/endpoint/operation digest、generation 和幂等键均与持久化 fence 及完整请求独立比对一致。真实截图显示 `approval_needed` 与服务端返回的 exact reference。

Only the internal `chrono-delivery` marker changes with the new delivery ID; title, visible body, byline, source URL, and account remain unchanged. The returned request ID, UserService ID, catalog/endpoint/operation digests, generation, and idempotency key independently agree with the stored fence and full request. Real screenshots show `approval_needed` and the server-returned exact reference.

此阶段只调用 request create 和 read-only status，未点击 CMS authorize，未调用 Nyx decide/redeem，未启动 DeliveryWorker。完成快照中 jobs/leases 均为空，remote ID/URL 均为空，`outbound_paused=true`。真实 provider 写入、审批决定、redemption 计数均为 0；这证明准备和关联链路，不证明 DEV 发布成功。

This stage calls request creation and read-only status only. CMS authorize was not clicked, Nyx decide/redeem were not called, and DeliveryWorker was not started. The completion snapshot has no jobs or leases, no remote ID or URL, and `outbound_paused=true`. Real provider writes, approval decisions, and redemptions are all zero. This proves preparation and correlation, not successful DEV publication.

## 验证范围 / Verification scope

历史证据继续覆盖 `ea8bb65` 上 431 tests、初次 33 项及固定版本 29 项真实本地 OAuth/Studio 验证、四类账号角色边界和 logout replay 401。该流程使用官方认证 HTTP 与真实 Chromium Studio，不声称操作了 Nyx 密码表单。真实 Ghost 原文仅新增一篇并完成 projection；固定版本 GET-only 补证没有重复发布。原文只有 localhost 可达性，无图片，未宣称公网或图片物化验收。

Historical evidence retains 431 tests on `ea8bb65`, initial 33 and fixed-revision 29 real local OAuth/Studio assertions, four-role boundaries, and logout replay returning 401. It uses official authentication HTTP and real Chromium Studio, without claiming a Nyx password-form click-through. One real Ghost original was published and projected; fixed-revision GET-only evidence did not republish it. The original has localhost reachability and no images, so public Internet access and media materialization are not claimed.

本轮新增测试覆盖 personal opt-in/legacy 分流、模式漂移阻断、请求与 owner/digest 绑定、过期或撤权批准拒绝、失效 saved actor 不被替换、failed/redeeming 进入 uncertain 且不 fallback、不重复发送，以及个人/组织双语界面。独立审查验证 legacy 与组织无 opt-in 配置的 fingerprint 与旧实现逐字节相同，并发现、修复和复验 null generation 兼容回归。自动化使用 fixture，真实个人链路只到 pending；Nyx approve/redeem、DEV receipt 和公开页仍未验证。

New tests cover personal opt-in versus legacy routing, mode-drift rejection, request/owner/digest binding, expired or revoked approval rejection, preservation of an expired saved actor, failed/redeeming outcomes becoming uncertain without fallback or resending, and bilingual personal/organization UI. Independent review confirmed byte-identical legacy and organization fingerprints without opt-in and found, repaired, and verified the null-generation compatibility regression. Automated tests use fixtures, while real personal validation stops at pending; approval/redemption, a DEV receipt, and a public DEV page remain unverified.

最终 `7f77057` 还通过 29 项真实本地 OAuth/Studio 只读复验，覆盖 solo、member、admin、publisher 四类账号、设置页权限、已发布原文、新任务与新会话 logout replay 401，取得 5 张截图；未修改 consent、角色、正文、任务或已保存 actor。CMS 中的 `approval_needed` 表示尚未获准排队，不表示已过期的 Nyx 请求仍有效。

The final `7f77057` revision also passed 29 real local OAuth/Studio readback assertions across solo, member, admin, and publisher accounts, including settings capabilities, the published original, the new task, and logout replay returning 401, with five screenshots. Consent, roles, content, tasks, and the saved actor were unchanged. CMS `approval_needed` means the task is not authorized to queue; it does not imply that an expired Nyx request remains valid.

## 暂停、保留与回滚 / Pause, preservation, and rollback

新版实例保持 outbound pause，未启常驻 Worker；旧 3457、四 Ghost、Nyx 和共享 OAuth/service 配置保持既有范围，Heartbeat 仍暂停。旧库在线一致备份与独立 volume 的 v1→v4 迁移证据继续保留，原 36 张表既存行保留。回滚可停止新容器并继续使用未切换的 3457，保留新库和已发布 Ghost 原文，不用旧备份覆盖新写入。

The new runtime remains paused with no resident worker. The preserved 3457 runtime, four Ghost sites, Nyx, shared OAuth/service configuration, and paused heartbeat retain their established boundaries. Historical evidence of the consistent SQLite backup and isolated v1→v4 migration remains intact, including preservation of rows in the original 36 tables. Rollback can stop the new container and continue using unchanged 3457 while preserving the new database and Ghost original instead of overwriting newer writes with an old backup.

未发送任务可经 CMS cancel；取消不会等同于 Nyx 审批撤销，过期和现态必须独立核验。公开写入一旦获准并发生，DEV adapter 没有启用删除路由，撤下或删除需作者账号另行授权。本次不执行此动作。旧 legacy 的列表/时间窗推测批准脚本保持硬禁用，不会通过账号、slug、method、path 和时间窗猜测请求归属。

An unsent task can be cancelled through CMS; cancellation is not a Nyx approval revocation, and expiry/current state must be checked separately. If a public write is later authorized and occurs, the DEV adapter has no enabled removal route; unpublishing or deletion requires separately authorized author-account action. None is performed here. The legacy list/time-window approval-guessing script remains hard-disabled; account, slug, method, path, and time proximity are never used to infer request ownership.

## 外部授权与未完成项 / External authorization and outstanding work

该请求仅有五分钟有效期，在北京时间 13:19:29 只读复验时已为 `expired`，不能用于执行，也未自动重建。下一次经明确授权的公开发布需使用 fresh OAuth 会话重新确认，并获取新的有效 exact request；不能复用过期批准或改写旧任务的 saved actor。

The request has a five-minute lifetime and was read back as `expired` at 13:19:29 Beijing time. It cannot be executed and was not recreated automatically. A subsequent explicitly authorized publication requires fresh OAuth confirmation and a new valid exact request; an expired approval cannot be reused, and the old saved actor cannot be replaced.

公开内容授权和 Nyx exact request 批准是两项独立步骤。本报告不把 pending、过期前的批准窗口或自动化通过视为公开发文授权。新提案仅针对一个新 DEV 公开文章及只读核验，不更新既有草稿 `4969744`，不自动更新或删除。当前 canonical URL 为 localhost，不能证明公网原文可达，即使后续明确授权公开技术测试，也不能替代正式 A30/D6 或 D1–D9 验收。

Public-content authorization and a Nyx exact-request decision are separate steps. Pending state, a pre-expiry approval window, and passing automation do not authorize public publication. The new proposal covers one new public DEV article and read-only verification, without changing draft `4969744` or automatically updating/deleting content. The canonical URL remains localhost and does not prove public Internet reachability; even a later explicitly authorized technical publication would not establish formal A30/D6 or D1–D9 acceptance.

当前远程 HTTP timeout 仍为 12 秒。redeem 中断或结果不确定后必须只读对账，不新建审批或任务重发。正式路径仍需公网可达原文、适用真实组织流程，以及尚未完成的 Hashnode Pro、其他平台、生产责任、RPO/RTO 和其余 v0.7 场景；全部按各自证据继续保持未完成状态。

The remote HTTP timeout remains 12 seconds. An interrupted or ambiguous redemption requires read-only reconciliation, without creating a replacement approval/task or resending. Formal delivery still needs a publicly reachable original, applicable real organization flows, and the outstanding Hashnode Pro, other-platform, production-ownership, RPO/RTO, and remaining v0.7 scenarios. Each retains its own incomplete status.

## 证据索引 / Evidence index

历史证据：[verification](evidence/cms-dev-live-20261104/verification.json)、[431-test log](evidence/cms-dev-live-20261104/npm-check.txt)、[auth summary](evidence/cms-dev-live-20261104/auth-summary.json)、[original receipt](evidence/cms-dev-live-20261104/original-receipt.json)、[original fixed readback](evidence/cms-dev-live-20261104/original-fixed-readback.json)、[DEV read](evidence/cms-dev-live-20261104/dev-read.json)。这些文件保留原观察版本与时间。

Historical evidence retains its original observation revision and timestamp in the linked verification, test, authentication, original-publication, and DEV-read records.

新增脱敏证据：[final exact summary](evidence/cms-dev-live-20261104/final-exact-summary.json)、[final exact proposal](evidence/cms-dev-live-20261104/final-exact-proposal.json)、[final exact body](evidence/cms-dev-live-20261104/final-exact-body.md)、[final exact test log](evidence/cms-dev-live-20261104/npm-check-final-exact.txt)。不得将 private OAuth 会话、cookie、token 或 actor 密文放入公开证据。

The new redacted evidence contains the exact summary, proposal, body, and complete test log. Private OAuth sessions, cookies, tokens, and actor ciphertext are excluded from published evidence.
