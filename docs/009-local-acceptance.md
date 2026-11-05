# 009 运维合并与本地验收 / Operations merge and local acceptance

本轮将 `origin/codex/site-provisioning-prototype` 的 `cb124b5` 合并到已交付的 `b0873e6`，无冲突；合并点为 `96e1f64a4ae4fa66abaeac8f37ab4c5500b2ec87`。OpenAPI/Hashnode 修复为 `1767a4336fc4216d50dd4d5b5f19943a9841a79b`，验真修复及最终业务版本为 `9c03c403d0fe7bad41785e49b68bab2a7a6f35a4`。新运维文档已经纳入，开站相关改动位于 `prototypes/`，不代表正式 CMS 已实现自动开站。v0.7 两份原始需求未修改。

This run merged `cb124b5` from `origin/codex/site-provisioning-prototype` into delivered revision `b0873e6` without conflicts, producing `96e1f64a4ae4fa66abaeac8f37ab4c5500b2ec87`. OpenAPI/Hashnode fixes are pinned to `1767a4336fc4216d50dd4d5b5f19943a9841a79b`; the render fix and final application revision are `9c03c403d0fe7bad41785e49b68bab2a7a6f35a4`. The operations runbooks are included; setup changes under `prototypes/` do not implement provisioning in the production CMS. Both original v0.7 requirement files are unchanged.

本报告只声明实际执行过的本地范围。既有 LAN、NyxID、NyxAgent 与共享 CMS 服务保留；本轮没有修改 NyxID/NyxBot 源码，没有新增真实第三方发文，没有切换另一台机器正在使用的服务。正式 D1–D9 仍为 **NOT_ACCEPTED**，各层测试数量不能累加成项目完成百分比。

Claims are limited to executed local checks. Existing LAN, NyxID, NyxAgent and shared CMS services were preserved. No NyxID/NyxBot source was changed, no additional real third-party publication was made, and the service used by the other machine was not switched. D1–D9 remain **NOT_ACCEPTED**; test counts across layers are not a project completion percentage.

## 已完成的检查 / Completed checks

| 范围 / Scope | 结果 / Result | 证据边界 / Evidence boundary |
| --- | --- | --- |
| TypeScript、Studio build、标准套件 / Standard suite | 554/554 PASS | 最终业务源码 `9c03c40`；含 fixture 和浏览器单测 / Final application source, including fixtures and browser tests |
| Studio、真实 HTTP、媒体 UI、本地发布协议 / UI and HTTP integration | 12/12 PASS | 真实 CMS/SQLite/浏览器；身份和远端为 fixture / Real CMS, SQLite and browser, fixture identity/providers |
| 验真修复后发布协议 / Publishing protocol after render fix | 4/4 PASS | 最终业务源码；本地协议、批准边界、只读恢复及防重复 / Final source; local protocol, approval boundaries, read-only recovery and duplicate prevention |
| 原生迁移及中断回退 / Migration and crash rollback | 14/14 PASS | 隔离模拟运行状态，不切换共享 Mongo / Isolated runtime model; no shared Mongo cutover |
| 新外部发布数据加密恢复 / External-publication recovery | 3/3 PASS，root 独立复跑 / Independently rerun | 11 张非空业务表、五种状态；本地 HTTP provider / Eleven nonempty tables, five states, loopback provider |
| 官方 NyxID → CMS → Ghost / Official local identity chain | 8/8 PASS | 官方 `38bae2f`；真实签名/JWKS/introspection/成员关系与本地 Ghost / Official identity checks and real local Ghost |
| 官方 NyxID generated tools / Official generated tools | 56 项登记、56 个工具、9/9 无 body POST PASS | 独立官方实例正常初始化，逐次审批；未知资源 403/404 证明传输，不宣称业务动作成功 / Normal isolated bootstrap, per-request approval; unknown-resource responses prove transport, not successful lifecycle actions |
| 四 Ghost 完整发布 / Four-Ghost publication | 8/8 PASS | 最终业务源码；双入口 × 个人/组织 × EN/ZH，真实 Ghost/MySQL，身份为 fixture / Final source; both entries × personal/org × EN/ZH, real Ghost/MySQL and fixture authority |
| 四站加密备份与新卷恢复 / Encrypted four-site recovery | 8/8 PASS；45 张表核对 / 45 tables compared | 14 个加密归档文件、10 个素材；6 篇公开页及图片 200，2 篇已下架文章 404 / Fourteen archived files, ten assets; six public pages/images return 200, two unpublished posts remain 404 |
| 独立 Docker 媒体挂载 / Independent media mounts | 10/10 PASS | 实际挂载，身份为 fixture / Actual mounts, fixture identity |
| 运维文档本地执行 / Executable runbooks | 84/84 PASS | 两语可执行块、CLI、绑定拒绝、SQLite、媒体路径、Compose / Bilingual snippets, CLI, bindings, SQLite, media paths, Compose |
| 开站原型 / Setup prototype | 17 模型 + 17 状态 + 54 工作流 PASS | 原型检查，不是生产开站 / Prototype checks, not provisioning delivery |
| Ghost 离线检查 / Ghost offline checks | 5/5 + 优化模式 5/5 PASS | 配置/脚本测试 / Configuration and script tests |
| Nginx 模板与双站展开 / Nginx template and two-site expansion | 2/2 PASS | 官方固定镜像 `nginx -t`，临时证书，未启动服务 / Pinned official parser, disposable certificate, no daemon started |

逐项记录、原始日志指纹及版本见 [证据索引](evidence/local-acceptance-009-20261105/summary.json)。初轮 545 项之后补充外部恢复 3 项、绘制验真 6 项，并在最终业务版本完整重跑 554 项。UI/协议初轮绑定 `96e1f64`；绘制修复后另复跑受影响的 4 项发布协议和真实四站。不同层级与版本不混算成一个全环境通过声明。

See the [evidence index](evidence/local-acceptance-009-20261105/summary.json) for individual results, original-log fingerprints and revisions. After the initial 545 tests, three recovery and six render regressions were added; all 554 were rerun on the final application revision. Initial UI/protocol checks bind `96e1f64`; four affected publishing-protocol tests and the real four-site flow were rerun after the render fix. Layers and revisions are not combined into an all-environment acceptance claim.

真实 NyxID 角色链完成三次本地 Ghost 写入；普通成员不能自行授予 Publisher，个人发布不依赖组织 Publisher，组织 Admin 与指定 Publisher 可发布。排队后撤 Publisher、取消、移除成员均阻止 Worker 出站；另核对 6 个 CMS task 回读和 32 项断言。连接清单使用空的隔离绑定文件，不把它描述成真实外部连接盘点。

The real local identity chain made three Ghost writes. Members cannot self-grant Publisher; personal publication is independent of organization Publisher; organization Admins and designated publishers can publish. Queued Publisher revocation, cancellation and membership removal all prevent Worker egress. Six CMS task readbacks and 32 additional assertions were checked. The connection inventory uses an empty isolated binding file, so this is not a real external-connection inventory test.

新外部数据恢复使用真实 AES-GCM 快照和 SQLite 恢复，逐行核对 `external_publications`、`external_publication_observations`、`external_metrics`、`delivery_payloads` 等 11 张非空表。恢复后旧 session/state 清除、外发暂停；失效旧凭据零 provider 请求，fresh caller 可以只读认回遗失回执并刷新指标。已取消和已替换记录不复活，幂等、防重复、双入口十个拒绝反例和连接变更不回退均通过。该验证没有真实 DEV 写入。

External-data recovery uses real AES-GCM snapshots and SQLite restore, checking all rows in eleven nonempty tables, including external publications, observations, metrics and frozen delivery payloads. Old sessions/states are invalidated and outbound work remains paused. Expired credentials make zero provider requests; a fresh caller can recover missing receipts and refresh metrics using reads only. Cancelled/superseded records remain terminal; idempotency, duplicate prevention, ten cross-entry denial cases and no fallback after connection changes pass. No real DEV write occurred.

四站恢复使用新 Ghost/MySQL 卷，源容器保持停止。真实浏览器通过临时 GET/HEAD-only 路由访问原文章 URL：6 篇公开页、代码与图片可读，图片响应 200、SHA256 和自然尺寸均正确；2 篇已下架文章及 cancelled/uncertain 素材继续返回 404。10 个素材和全部修订的原始字节一致。root 使用只读 immutable SQLite 连接独立核对 45 张表，44 张全字段一致；唯一差异为预期的 `recovery.isolated` 审计新增，原 93 条审计全部保留，两库完整性通过且外键错误为零。此四站库的外部分发记录为零，非空外部分发恢复由上面独立三项测试覆盖，不能相互冒充。16 个 source/restore 容器均已停止，未发生 OOM 或重启；临时路由已关闭。

Four-site recovery uses new Ghost/MySQL volumes while source containers remain stopped. A real browser reads original article URLs through temporary GET/HEAD-only relays: six public pages, code and images load with matching image SHA256 and natural dimensions; two unpublished posts and cancelled/uncertain assets remain unavailable. All ten asset blobs and revision bytes match. An independent immutable, read-only SQLite comparison checks 45 tables: 44 match in every field; the sole difference is the expected `recovery.isolated` audit entry, preserving all 93 prior entries. Both integrity and foreign-key checks pass. This four-site database contains no external deliveries; the separate three-test recovery suite covers nonempty external records. All sixteen source/restore containers are stopped without OOM or restart, and temporary relays are closed.

复跑前提、命令、脱敏证据与指纹校验见 [证据 README](evidence/local-acceptance-009-20261105/README.md)。10 份失败／续跑报告保留在证据索引中；同一 publication run 的恢复续跑不是十次重新发文。本轮没有切换共享服务，因此不需要回退其部署；后续切换仍应遵循运维 runbook 的备份与回退步骤。

The [evidence README](evidence/local-acceptance-009-20261105/README.md) records replay prerequisites, commands, redaction and checksums. Ten failed/continuation reports remain indexed; continuations of one publication run are not ten publication retries. No shared service was switched, so no shared deployment rollback is needed. Any later rollout must follow the runbook's backup and rollback steps.

## 本轮修复 / Fixes

1. **D2：九个旧无 body 操作。** 移除错误的必填空 JSON 声明；POST 方法、路径参数、鉴权和实际有 body 的操作均保留。相关测试先失败，修复后通过。
2. **D7/A39：Hashnode 移除对账。** 软删除后仍读到文章时保持 `uncertain`，不再误报 `published`；只有已知 ID 明确返回 `post:null` 才确认移除。恢复只读，不重复执行删除。
3. **D8/D9：Nginx HTTP 入口日志。** 显式设置 `access_log off`，防止继承宿主配置而记录包含签名 observation token 的路径。HTTPS 与跳转、Ghost Admin 拒绝规则保持。
4. **D4/D5、A17/A25：文字绘制验真。** 旧 opacity 探针把下划线变化误当成文字像素，透明或白底白字也可能通过；改为只隐藏文字填充、描边与阴影，保留下划线。验真 Chromium 使用软件绘制，减少采样环境的 GPU 边缘波动；所有零差比较、逐字形像素证明及 DOM 完整性门禁保留。
5. **验收可复跑性。** 四 Ghost 旧 harness 补传媒体 staging，并在翻译关系变化前处理已有冻结投影，保留 `PROJECTION_SCOPE_CHANGED` 安全规则及公开互链断言。原型 README 改为仓库根可执行命令及当前计数；历史失败与版本保留。

1. **D2:** Nine legacy bodyless operations no longer require empty JSON. POST methods, parameters, authorization and actual body-bearing operations are preserved; failing regressions now pass.
2. **D7/A39:** A retained soft-deleted Hashnode post remains uncertain instead of becoming published. Only explicit absence of the known ID confirms removal; recovery never repeats the mutation.
3. **D8/D9:** The HTTP redirect explicitly disables access logging to avoid inherited logging of signed observation-token paths. HTTPS, redirects and Ghost Admin denial rules remain intact.
4. **D4/D5, A17/A25:** The old opacity probe attributed underline changes to glyph ink, allowing invisible letters to pass. The probe now hides text fill/stroke/shadow only, preserving decoration. Software rasterization reduces observed GPU edge variability; exact comparisons, per-grapheme evidence and DOM integrity checks remain unchanged.
5. **Reproducibility:** The four-Ghost harness passes media-staging configuration and drains existing frozen projections before changing translation relationships. It retains `PROJECTION_SCOPE_CHANGED` and public alternate-link checks. Prototype commands/counts and current delivery navigation were corrected without rewriting historical evidence.

绘制诊断保留全部失败：真实页面曾出现两像素边缘波动；软件候选曾有一次未捕获阶段的冷启动 false，未据此猜测原因。随后带阶段采样 5/5、独立同一 remote/HTML 只读 3/3、最终标准套件及四站均通过，属于有界复验。Linux 默认和软件模式各 6/6 的对照只能证明兼容性，不能证明 Linux 首次失败根因。原四站环境/脚本失败亦保留，不以重发同一文章替代只读诊断。

Render diagnostics retain every failure, including a two-pixel edge variation and one candidate cold-start false without a captured stage. Its cause is not guessed. Subsequent instrumented 5/5, independent same-remote/HTML read-only 3/3, final suite and four-site checks passed within a bounded scope. Linux default/software 6/6 controls establish compatibility, not the cause of the initial Linux failure. Earlier environment/harness failures remain recorded; the same failed publication was diagnosed through reads rather than resent.

## 仍未闭合的工作 / Remaining work

| 分类 / Category | 当前边界及下一步 / Current boundary and next step |
| --- | --- |
| 功能：辅助渠道 / Assisted-channel functionality | Medium/HackerNoon 新建辅助流程仍被 Studio 的既有暂停策略禁用；后端材料包和历史跟进已有实现。需恢复并验收新建辅助入口，再开展真实账号流程。 / Studio still pauses new assisted workflows; backend packages and historical follow-up exist. Restore and verify the entry before real-account validation. |
| 功能：组织自动分发 / Organization automatic distribution | service-origin exact 与 nested proxy dispatch 仍分别受 `NATIVE_EXACT_UNSUPPORTED`、`NATIVE_DISPATCH_UNSUPPORTED` 约束；008 外部登记仅支持个人 DEV。组织路径不能只写成“待账号”。 / Native exact/dispatch capability gaps remain, and 008 registration supports personal DEV only. Organization work is not merely awaiting an account. |
| 本地交接配置 / Shared local rollout | 本轮为隔离验收；共享 LAN 服务的 catalog、媒体挂载、指标开关和官方版本切换仍按其独立交接执行，不把隔离通过当作已切换。 / Isolated acceptance does not update the shared LAN catalog, mounts, metrics configuration or official-version cutover. |
| 线上验证 / Online verification | Hashnode 组织 Pro/权限与真实发布、Medium/HackerNoon 真实辅助提交、组织 DEV、真实外部分发生命周期与恢复，仍需各自账号、内容及动作授权。 / Real account/plan eligibility, publication, assisted submissions and external lifecycle/recovery need their own authorized checks. |
| 上线与上线后 / Deployment and post-launch | 目标 Linux nginx/systemd、正式域名/TLS/SMTP、持久化、监控、隐私/保留流程、备份和具名成本/维护责任；数值 RPO/RTO 仅在另有约定时按约验证。 / Target Linux services, domains/TLS/SMTP, persistence, monitoring, privacy/retention, backups and named cost/maintenance ownership; numerical recovery targets apply if separately agreed. |

已选定的个人路径“NyxBot 读取 CMS 冻结文章 → 顶层 NyxID DEV 工具发文 → CMS 独立登记/同步”已有真实公开 create/update 和 generated sync 证据，见 [008](evidence/external-publication-20261105/public-positive/README.md)；本轮不重复发文，不把该成果退回为未完成，也不扩大为组织或所有平台通过。用户已明确不保留定制门户 Open app；本轮不新增恢复该入口、定制来源协议、自动开站或任意数值 RPO/RTO 的要求。

The selected personal path—NyxBot reads frozen CMS content, publishes through its top-level NyxID DEV tool, and CMS independently registers/synchronizes—already has real public create/update and generated-sync evidence in [008](evidence/external-publication-20261105/public-positive/README.md). It was not repeated or downgraded, and does not establish organization/all-platform acceptance. The user chose not to retain custom Open app. This run adds no requirement to restore it, reintroduce a custom authority protocol, implement automatic provisioning, or adopt arbitrary numerical RPO/RTO targets.
