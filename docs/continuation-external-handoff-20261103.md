# 外部验收执行交接（2026-11-03）

本清单整理六项工作包的已有结果、剩余输入与执行顺序，依据 [requirements.md](source/requirements.md)、[supporting-deliverables.md](source/supporting-deliverables.md) v0.7，Gist revision `79e69842f5bacba7f8204f62d151018bacf98d91`。两份本地原文的 SHA-256 已与 [source manifest](source/manifest.json) 核对一致。本文件不改变正式 [A01–A52 矩阵](acceptance.md)；D1–D9 整体验收保持 **NOT_ACCEPTED**。

This checklist records completed results, remaining inputs and execution order across six work packages. It uses the v0.7 requirements and deliverables at the pinned Gist revision above. Both local source hashes match the source manifest. It does not amend the formal A01–A52 matrix; overall D1–D9 acceptance remains **NOT_ACCEPTED**.

2026-11-03 已明确沿用现有本地环境继续验收：Nyx 门户 `http://localhost:3000`、API `http://localhost:3001`，CMS `http://localhost:3457`。当前 CMS 业务源码为 `c16cde700963959d3fd7fc226853b71f5551573a`，Nyx 后端为 `049ee1c2ca811a002590dc8330ce646078bb1158`、门户为 `c65dc4bedb7da79cf0fb477e6f5bd809f03aec9b`。**不再把另选 Nyx／CMS 环境、再部署一套远端实例或重新决定采用本地补丁列为当前输入缺口。**候选、验证、运行、push 与 PR head 继续分别记录；本轮修复与运行证据见 [2026-11-03 跟进](continuation-20261103.md)。

On 2026-11-03, the existing local environment was confirmed for continued acceptance: Nyx portal at `http://localhost:3000`, API at `http://localhost:3001`, and CMS at `http://localhost:3457`. Current business source is `c16cde700963959d3fd7fc226853b71f5551573a`, with Nyx backend `049ee1c2ca811a002590dc8330ce646078bb1158` and portal `c65dc4bedb7da79cf0fb477e6f5bd809f03aec9b`. **Selecting another Nyx/CMS environment, deploying another remote instance, or deciding again whether to use the local patches is not a current missing input.** Candidate, tested, running, pushed and PR versions remain separately recorded in the current continuation evidence.

## 已完成边界与执行顺序

W1 来源授权／撤权、W2 当前版本恢复及共同版本受影响路径已完成各自有界验证；R031 在选定真实本地 service 路径已关闭。普通门户 Open app、直接／门户同身份工作区、当前本地 35 操作注册及集合核对已有证据，不能再作为“本地未实现”阻塞。W1 的 `local_test` 目的地与 W2 的受控 delivery 不替代真实外部副本；35 项注册不等于 35 项均经 MCP 执行。详细边界见 [现有交接](handoff-20261102.md)、[联合运行索引](evidence/followup-20261102/combined/run-index.json)与[本地注册报告](evidence/followup-20261102/current-registration/report.json)。

W1 source authorization/revocation, W2 recovery and the affected paths on their shared version already have bounded validation. R031 is closed for the selected real local service path. The ordinary portal launch, identity/workspace parity and current local registration of 35 operations are evidenced. W1 `local_test` and W2 controlled delivery results do not replace real external-copy validation; 35 registered operations do not imply that every operation was executed through MCP.

执行依赖为：工作包 1 沿用已运行的本地身份、注册与版本证据，不重复开环境；工作包 5 继续补齐该本地安装的使用范围、域名／URL、容量和运维交接。工作包 2 和 3 可先按各自账号与内容授权准备，实际外部分发前核对原文及图片可被目标平台／预期读者访问；工作包 4 复用这些真实副本；工作包 6 汇总评审。本地 CMS／Nyx 可以保留，不必为了公开 Ghost 原文而迁移两者。任何外部写入均等待该具体内容、目标和动作的授权。

Package 1 uses the running local identity, registration and version evidence without creating another environment. Package 5 completes the local installation's intended reach, domain/URL, capacity and operational handoff. Packages 2 and 3 can prepare accounts and authorized content now; real distribution must verify that originals and images are reachable by the destination platform and intended readers. Package 4 uses those real copies and package 6 consolidates review. CMS/Nyx can remain local while Ghost originals are made publicly reachable. External writes require authorization for the exact content, destination and action.

## 1. 已选本地 NyxID／CMS 的版本与注册交接

**当前状态：**本地选择与补丁使用已经明确，Nyx 后端 `049ee1c`／门户 `c65dc4be` 及 CMS `c16cde7` 正在沿用。35 项 service 注册／契约集合、普通门户 Open app 与直接入口同身份工作区、W1 来源权限／撤权、W2 恢复均有固定版本的有界证据。这些事实不需要再提供目标实例或重新申请同一部署决定；实际外部平台连接与组织精确批准另属工作包 2。

**Current status:** the local environment and patch use are established: Nyx backend `049ee1c`, portal `c65dc4be` and CMS `c16cde7`. The 35-operation registration/contract set, ordinary portal/direct identity parity, W1 source authority/revocation and W2 recovery have bounded evidence at their recorded versions. No replacement target instance or repeated deployment decision is needed. Real external connections and exact organization approvals belong to package 2.

1. 沿用并交接实际本地 URL、固定 SHA、callback、issuer、三类 audience、分入口 scope map、service ID／slug、identity／delegation 注入与 introspection trust。配置含义见 [注册文档](nyxid-registration.md)和[示例](evidence/followup-20261102/registration/configuration.example.json)。只读核对与新版本受影响路径验证在现有授权范围内继续，不把“配置已经存在”列为新输入缺口。
2. 保留原文／Markdown／状态／指标双入口、owner 隔离与最终写入撤权的版本化证据；新修改只补验受影响路径。当前 35 操作是实现集合，不意味着 35 项均已通过 MCP 调用，不新增“所有动作只能经 MCP”的要求，也不把历史所有场景记为已在 `c16cde7` 重跑。
3. 仅当以后决定迁移主机／origin、替换 Nyx 版本或改变 trust 时，才启用迁移步骤：由接收方取得 [私有补丁 bundle](evidence/followup-20261102/nyx-patch-handoff.json)，核对 hash、官方 base 和完整 SHA；重新配置准确 callback／audience／scope／trust，导入实际 OpenAPI，并对变化后的环境做身份、权限、撤权和恢复差量验证。API／Worker 一起切换，保留旧版本和注册 preimage。本地补丁不能冒充未修改 upstream。

1. Hand over the actual local URLs, pinned SHAs, callback, issuer, three audiences, entry-specific scope maps, service binding, propagation and introspection trust using the existing registration documentation. Read-only checks and affected-path validation continue under existing authorization; existing configuration is not a new missing input.
2. Preserve versioned parity, isolation and final-write revocation evidence and validate affected paths after changes. The 35 operations describe the registered implementation set, not universal MCP execution. Do not relabel all historical scenarios as rerun at `c16cde7`.
3. Only a later host/origin migration, Nyx replacement or trust change activates migration work: transfer and verify the private patch bundles and base, reconfigure the exact callback/audiences/scopes/trust, import the actual OpenAPI and validate affected behavior in the changed environment. Switch API/Worker together and retain the old version and registration preimage. Local patches must not be represented as unmodified upstream.

**交接与停止／回滚：**当前剩余的是具名维护接收方、可复用配置说明和准确证据账目，不是重建本地已可用的登录／service。秘密走私有配置或 secret manager。若实际配置漂移或版本不兼容，停止该变更、暂停相关出站并保留数据；按已有回滚方案处理，不回滚审批 generation、不复活旧 blocked 命令、不清空 live Mongo。[注册回滚限制](evidence/followup-20261102/current-registration/rollback.md)继续保留。

**Handoff and stop/rollback:** remaining handoff work is named maintenance ownership, reproducible configuration and accurate evidence accounting, not rebuilding the working local sign-in/service path. Transfer secrets privately. Stop a change on configuration drift or incompatibility, pause relevant outbound writes and preserve data. Use the existing rollback plan without reversing approval generations, reviving blocked commands or clearing live Mongo; retain the documented registration rollback limits.

## 2. DEV 个人／组织与 Hashnode 组织真实自动发布及更新

**最小输入：**有权 DEV 个人账号、组织与可更新原副本的作者账号；Hashnode 组织 publication、有效 Pro 资格与发布／更新权限；精确 Nyx `UserService.id`、owner 与 provider account／organization／publication 绑定；具名组织 Admin；获准的英文测试稿及图片、原文 release/revision、全文／摘要选择、目标和 create/update/remove 动作授权。没有订阅不自行购买，没有内容动作授权不发文。

**Minimum inputs:** an authorized personal DEV account, DEV organization and author account permitted to update the copy; an eligible Hashnode organization Pro publication with publish/update permissions; exact Nyx `UserService.id`, owner and provider bindings; a named organization Admin; and an authorized English test article/images, original release/revision, copy/excerpt choice, destinations and create/update/remove actions. Do not purchase subscriptions or publish without the required authorization.

1. 由有权操作者通过 Nyx 建立连接，核对 personal／org credential source、同一 owner、provider account、DEV organization 或 Hashnode publication；对失效连接明确失败，不回退到个人账号或 provider 直连。开通说明与精确绑定见 [注册文档](nyxid-registration.md#精确连接绑定)。
2. 先从授权入口发布并验证原文，核对正文、图片 hash、owner／作者／语言、稳定 URL。冻结 distribution payload 与文字图片权利确认，分别执行 DEV personal、DEV organization、Hashnode organization 的 create 和 approved update。
3. 组织自动外部写入在 Nyx 申请并由当前 Admin 批准精确 content／destination／action；纠错也重新满足批准。关联 request、operation digest、connection fingerprint、receipt，并以远端 ID 和 URL 确认更新原副本。Nyx 原生 redeem 本身执行写入，不能随后再发一次普通 proxy 写入。
4. 从 CMS 与 service 核对状态、URL、版本、来源链接及清晰的资格／权限失败说明；按支持的授权来源读取外部指标，无接口或无权时保留 `Unavailable`。收集的数据需标明 source 与 updated_at，不新增外部数值指标硬门槛。

1. Connect through Nyx and verify personal/org credential source, exact ownership, provider account and organization/publication. A failed connection must not fall back to another account or direct provider credentials.
2. Publish and verify the authorized original first, including body, image hashes, publisher, author, language and stable URL. Freeze the confirmed payload/rights and demonstrate create plus approved update for DEV personal, DEV organization and Hashnode organization.
3. Obtain the current organization's exact Admin approval in Nyx for every external write, including corrections. Correlate request, digest, connection fingerprint and receipt. A native redeem performs the write; do not follow it with a duplicate proxy write. Verify updates against the same remote ID/URL.
4. Compare CMS/service status and links, verify source attribution and expose eligibility/permission errors. Use external metrics only where authorized and supported; otherwise retain `Unavailable`, with source and update time where applicable.

**完成证据与停止／回滚：**D6／A27–A31、A33–A34 的真实账号、批准、请求／receipt、远端页面与更新前后固定 ID 证据；同时支撑 D7／D8 的对应结果。遇到权限、订阅、原文核验或批准失败即停止该目的地。外部成功不能通过回滚本地 DB 撤销；依据既有具体 remove 授权处理已知副本，无自动移除能力或失权则登记人工跟进并保留成功历史。

**Evidence and stop/rollback:** record real accounts, exact approvals, requests/receipts, remote pages and stable IDs across updates for D6/A27–A31/A33–A34 and relevant D7/D8 outcomes. Stop the affected destination when permissions, eligibility, original verification or approval fails. Rolling back a local database does not undo a remote publication. Use the authorized removal action for known copies or retain manual follow-up and publication history.

## 3. Medium／HackerNoon 真实辅助流程

**最小输入：**可用 Medium／HackerNoon 账号、具名人工提交及后续跟进负责人、具体文章／图片与 import／submit／后续修正动作授权；HackerNoon 公司域名原文按平台要求提供公司账号。先明确需要展示的真实辅助动作和结果记录，录用由平台决定。

**Minimum inputs:** suitable Medium/HackerNoon accounts, a named human submission/follow-up owner, and authorization for the exact article/images and import/submit/correction actions. Use a company account for company-domain HackerNoon originals where required. Define the assisted action and tracking evidence; the platform controls acceptance.

1. 从已核验原文生成辅助包，核对正文、图片、署名、原文 URL、canonical／来源指引与目标账号说明。
2. 负责人在实际平台完成授权的导入或投稿；记录稿件／submission 引用、实际状态和操作时间。未提交保持 `manual_action_needed`；已提交但未发布记录 `submitted`，不显示 `published`。
3. 经授权在 CMS 或 Nyx service 报告并核对结果；有公开页面后再核对来源链接与可访问性。待编辑审核保留负责人及下一步，未录用不伪造链接或承诺录用。

1. Generate an assisted package from the verified original and check content, images, byline, original URL, attribution/canonical guidance and account requirements.
2. The named owner performs the authorized import or submission on the actual platform. Record its reference, actual state and time. Pending manual work remains `manual_action_needed`; a submission remains `submitted` until publication is verified.
3. Report and check the authorized result through CMS or the Nyx service. Verify the source link and accessibility once a public page exists. Preserve editorial-review follow-up without claiming acceptance.

**完成证据与停止／回滚：**D6／D7、A32／A35 的包校验、真实操作回执、状态记录及具名交接。账号规则、权利或内容不符时不提交；已提交稿件仅按既定授权撤回／修正，无法处理时保留人工跟进。截图／回执脱敏，不能暴露登录会话或私人草稿全文。

**Evidence and stop/rollback:** retain package checks, actual submission/import receipts, status and named follow-up for D6/D7/A32/A35. Stop before submission if account rules, rights or content do not match. Withdraw or correct only within authorization; retain manual follow-up where unavailable. Sanitize receipts and screenshots to exclude sessions and private draft content.

## 4. 真实外部副本生命周期与恢复

**最小输入：**工作包 2／3 产生的真实副本 ID／URL、批准的测试窗口、每个目的地具体 cancel／update／remove／reconnect 动作范围，以及在隔离恢复环境查询这些副本的授权。需要有权账号及当前组织批准；受控夹具继续作为回归材料，但不能充当本工作包的真实证据。

**Minimum inputs:** real copy IDs/URLs from packages 2/3, an approved test window, destination-specific cancel/update/remove/reconnect actions, and permission to query those copies from an isolated recovery environment. Current account authority and organization approvals remain required. Controlled fixtures remain regression evidence rather than replacements for these real results.

1. 保留一个目标成功、另一目标失败的实际记录；在已授权测试任务验证待执行／待审批取消，确认已发送后不会虚报撤回。执行精确批准的纠错与已知副本移除；失去作者权限或不支持操作时显示重连／人工跟进。
2. 仅在受控本地传输或进程边界制造一次已批准请求的响应丢失／中断，保留远端成功证据及本地 `uncertain`。随后以当前有权 Actor 只读对账同一副本；记录远端请求计数或等价证据，证明未重复创建。无法确定远端结果时保持 uncertain，不能盲重试。
3. 捕获含真实 queued／uncertain delivery 的一致性加密备份，在全新 project／DB／卷／端口恢复。先保持出站 paused、旧会话失效，核对原文、远端映射、payload／rights／历史和当前权限；隔离实例不得带着真实凭据自动外发。先只读认回，再由当前有权操作者针对新写取得必要确认／批准后恢复明确的任务。
4. 比较恢复前后 CMS／service 状态、已知 remote ID／URL 与远端副本数；验证撤权或连接漂移的 queued 写入被阻断，原成功记录保持，manual follow-up 没有丢失。清理仅涉及本次获准创建的实验资源与副本，保留失败证据和回滚点。

1. Demonstrate a real partial failure without losing another destination's success. Validate cancellation before sending/approval and honest tracking after a request was sent. Perform approved corrections/removal, or show reconnection/manual follow-up when editing authority or platform support is absent.
2. At a controlled local transport/process boundary, lose the response or interrupt one authorized request. Retain remote success evidence and local `uncertain`. Reconcile the same copy read-only with a currently authorized Actor and prove no duplicate create. Leave unresolved outcomes uncertain instead of blindly retrying.
3. Capture an encrypted consistent backup containing real queued/uncertain deliveries and restore into a new project/database/volumes/ports. Keep outbound writes paused, invalidate old sessions and verify source content, mappings, payload/rights/history and current authority. Do not let isolated instances automatically write with real credentials. Reconcile read-only before any separately confirmed and approved new write.
4. Compare CMS/service states, remote IDs/URLs and copy counts across recovery. Block revoked or drifted queued writes, retain successful history and manual follow-up, and clean up only the authorized experiment resources/copies while preserving evidence and rollback points.

**完成证据与停止／回滚：**D7／D9、A35–A40／A49–A50 的真实副本、状态轨迹、只读零写与防重复证据。身份／连接不可核验、快照不一致、仍有未知远端结果或隔离恢复目标指向当前活跃资源时保持 paused 并停止写入。恢复新实例不可覆盖 live 数据；旧实例、卷与未解决记录保留，按 [运维手册](operations.md)对账后决定后续动作。

**Evidence and stop/rollback:** retain real-copy lifecycle histories, read-only zero-write and duplicate-prevention evidence for D7/D9/A35–A40/A49–A50. Keep writes paused on unverifiable authority/bindings, inconsistent snapshots, unknown remote outcomes or isolated recovery routes pointing at currently active resources. Never overwrite live data with the restored instance; retain old instances/volumes and unresolved records for reconciliation.

## 5. 现有本地安装的公开站点、运维与恢复交接

**原文边界：**R1／D1 要求独立 URL、受控基础设施、域名／持久化／容量费用和责任；R6 要求每个 owner 的公开 Ghost 博客位于配置的 domain／subdomain；R10／D9 要求备份覆盖内容、发布记录和站点配置并演示恢复，以及维护和监控交接。原文没有规定另建云端 Nyx／CMS、购买新域名或部署到新的生产环境。现有本地部署可以继续承担验收；公开原文和图片仍需证明在声明的访问范围内可达，不能把本机 `localhost` 页面冒充外部平台或公众已经可访问。

**Requirement boundary:** R1/D1 require an independent URL, controlled infrastructure, domains, persistence, capacity/cost and responsibilities. R6 requires each owner's public Ghost blog on a configured domain/subdomain. R10/D9 require backups of content, publication records and site configuration, demonstrated restoration, maintenance and monitoring handoff. They do not mandate another cloud Nyx/CMS installation, a purchased domain or a new production environment. Acceptance continues on the existing local deployment, while public originals/images must be proven reachable within the declared audience; localhost checks do not prove external or public reachability.

**当前最小输入：**记录当前机器、持久盘、站点 URL／域名与允许访问范围；指定现有部署的付款／维护、秘密与备份保管、隐私与数据访问负责人，并落实监控接入、同意／保留／受控清理及离机备份位置。已有安排可直接登记，无需重新采购资源。适用 A51 的恢复目标仍需事先约定；v0.7 没有给定 RPO／RTO 数值，不填虚构默认 SLA。无需 Ghost(Pro)；个人＋组织各一个双语 publication 对应四套 Ghost，容量和费用按真实部署记录。

**Current minimum inputs:** record the existing host, persistent storage, site URLs/domains and intended reach; name payment/maintenance, secret/backup and privacy/data-access owners; and establish monitoring, consent/retention/controlled cleanup and off-host backup storage. Record existing arrangements where available without purchasing new resources. Agree recovery targets for the applicable A51 check; v0.7 supplies no numeric RPO/RTO or default SLA. Ghost(Pro) is unnecessary; personal and organization bilingual publications require four Ghost installations, with measured capacity and actual costs recorded.

1. 交接当前 Node、Blog／Nyx commit、Ghost/MySQL digest、卷／DB／配置与每站私有 staging、公开只读 mount。沿用 W2 四 Ghost 恢复及本轮差量证据，核对当前配置是否有改变；仅对改变和未覆盖的必需结果补验，不因选择本地而盲重跑已有矩阵。
2. 记录现有 CMS 与四 Ghost 的 URL、域名／端口、owner／language 映射和访问范围，核对原文稳定 URL、metadata／sitemap／译文链接、独立持久化与 API 中断时公开页／图片可用性。真实外部分发所需的原文和图片可达性另行实测；如需新增公网访问，只针对选定公开入口配置域名、DNS／HTTPS、代理及访问边界，CMS／Nyx 无需随之迁移。实际负载测量与资源账目用于容量／成本交接，不把本地约 6 GiB 或一次恢复耗时当作 SLA。
3. 接入已有监控体系，覆盖 API／Ghost／MySQL／Nyx、卷空间、备份新鲜度和长期 queued／uncertain／blocked／manual action；有 TLS 时同时监控证书。确认告警能送达具名负责人，不要求新建自动告警产品，也不恢复已暂停的 BlogSystem heartbeat。
4. 根据配置的隐私要求验证 consent、GPC/DNT、撤回、访问控制、metrics filters／source／updated_at；公开测试访问归属正确，预览不计入，采集故障不影响发布。落实保留与受控清理流程，不强求新增自动 purge 服务。
5. 交接一致性加密备份、离机保管与独立 key 管理，保留已有成功恢复证据。针对当前配置及真实外部 queued／uncertain 副本新增的风险，按工作包 4 在新卷／新端口演练恢复并对账；记录实际丢失窗口和恢复耗时，与事先约定目标比较。已有本地恢复不冒充未来迁移环境的演练，也不因尚未选择未来环境而失效。

1. Hand over the current runtime/commits, Ghost/MySQL digests, volumes/databases/configuration, private staging and public read-only mounts. Reuse W2 and current affected-path evidence; validate actual changes and uncovered required results without blindly repeating the existing matrix.
2. Record CMS and four Ghost URLs, domain/port and owner/language mappings and reach. Verify stable URLs, metadata/sitemaps/translation links, persistence and public-page/media availability during API interruption. Separately demonstrate reachability needed for real distribution. Only if public exposure is needed, configure the selected public ingress with domains, DNS/HTTPS, proxy and access boundaries; CMS/Nyx need not move. Capacity/cost handoff uses real measurements, not an SLA inferred from local memory or one restore duration.
3. Connect existing monitoring for service health, storage, backup freshness and stalled/uncertain/manual work, plus certificates where TLS is used. Verify delivery to a named owner. A new alerting product or resuming the paused BlogSystem heartbeat is not required.
4. Verify configured privacy/consent, GPC/DNT, withdrawal, access, filters, source/update time, correct attribution, preview exclusion and publication despite collection failure. Establish retention and controlled cleanup without adding an automatic purge service.
5. Hand over consistent encrypted backups, off-host custody and separate keys, retaining successful restoration evidence. Exercise new configuration risks and real external queued/uncertain copies using isolated volumes/ports and read-only reconciliation, measuring loss window and duration against agreed targets. Existing local recovery is neither a future migration drill nor invalidated by the absence of a future environment choice.

**完成证据与停止／回滚：**D1／D8／D9 及适用 A05／A23–A26／A41–A52 仍须有实际安装、站点可达性、持久化、容量费用责任、监控／隐私和恢复交接证据。未完成项逐项保留，不以本地运行推定全部签收；“另选生产环境”不作为本地继续验收的前置门禁。恢复只用新卷，不覆盖活跃数据；修改或公开入口前明确范围、schema 兼容性与回滚点，异常时保留 Ghost 与当前数据、暂停相关外发并受控回滚。

**Evidence and stop/rollback:** D1/D8/D9 and applicable A05/A23–A26/A41–A52 still need evidence for the actual installation, site reachability, persistence, capacity/cost ownership, monitoring/privacy and recovery handoff. Keep gaps explicit rather than accepting everything because it runs locally. Selecting another production environment is not a prerequisite to continuing local acceptance. Restore to new volumes only; define scope, compatibility and rollback before changes/public exposure, preserving Ghost and current data while pausing affected outbound writes on failure.

## 6. 现有 Draft PR 评审、版本交接与最终签收

**最小输入：**具名技术 reviewer、运维接收方与最终签收人；前五项的实际证据；如果需要 merge，另行取得该具体动作授权。目前只继续现有 [Draft PR #1](https://github.com/aelf-hzz780/chronoai-cms/pull/1)，不重复创建，不自行 merge。

**Minimum inputs:** named technical reviewer, operations recipient and acceptance owner, plus actual evidence from the first five packages. Obtain separate authorization if a merge is requested. Continue the existing Draft PR #1; do not create a duplicate or merge automatically.

1. 把每项结论绑定到业务 SHA、依赖 SHA、环境、角色、动作、脱敏证据及限制；验 hash 与仓库相对链接，秘密／DB／env／备份不进 Git。保留历史失败及不同版本证据，不宣称历史矩阵在新 SHA 全量重跑。
2. 更新 D1–D9 逐项账目和适用 A01–A52 证据，区分 implemented、tested、deployed、pushed、PR 与 formally accepted。测试数量、注册操作数量或文档完成均不替代必需结果；无权／无接口外部指标应准确记录 Unavailable。
3. 在现有 PR 中审查最终实现、已知限制、目标验证和回滚。仅在远端与分支再次核对后，按已授权范围正常 push 到 `origin/codex/003-blogsystem-delivery`；不 force、不直接 push main/master。评审整改、版本交接及具名签收完成前保持 Draft／NOT_ACCEPTED 的真实状态。

1. Bind conclusions to business/dependency SHAs, environment, roles, actions, sanitized evidence and limitations. Verify hashes and repository-relative links; exclude secrets, databases, env files and backups. Preserve failures and version-specific evidence without claiming an unperformed full rerun.
2. Update each D1–D9 item and applicable A01–A52 evidence, distinguishing implemented, tested, deployed, pushed, PR and formally accepted. Counts of tests/registered operations and documentation completeness do not replace outcomes; unsupported external metrics remain honestly unavailable.
3. Review the final implementation, limits, target evidence and rollback in the existing PR. Recheck remote and branch before an authorized normal push to `origin/codex/003-blogsystem-delivery`; never force or directly push main/master. Keep Draft/NOT_ACCEPTED status accurate until review, handover and named acceptance are complete.

**完成证据与停止条件：**固定交付 SHA、远端与 PR head 读回、独立 review 结论、全部必需项的可复核证据及签收记录。任何必需项仍 BLOCKED／未验证时，记录精确缺口，不改 N/A、不签收整体。heartbeat 保持 PAUSED；本清单不创建或恢复自动化。

**Evidence and stop condition:** retain the fixed delivery SHA, remote/PR readback, independent review, evidence for every required outcome and named acceptance. If a required item remains blocked or unverified, record the exact gap without converting it to N/A or accepting the whole delivery. Keep the heartbeat PAUSED; this checklist creates or resumes no automation.

## 一次最小输入交接

本地 Nyx／CMS 环境已经确定，无需再次选择。启动下一批真实外部验收所缺的最小输入是：①可用的 DEV 个人／组织、Hashnode 组织 Pro、Medium／HackerNoon 账号与精确 Nyx 连接（或建立连接的负责人）；②获准英文测试文章／图片、各目的地动作范围、组织 Admin 和人工提交负责人；③原文／图片供目标平台及预期读者访问的既有域名／入口，或为公开 Ghost 入口作决定的负责人。运维签收另补现有部署的付款／维护／隐私／备份负责人及恢复目标。账号秘密走私有渠道；不重复询问本地环境，不自行采购或迁移。

The local Nyx/CMS environment is already selected. The minimum inputs for the next real external acceptance batch are: (1) suitable DEV personal/org, Hashnode org Pro and assisted-platform accounts with exact Nyx connections or a setup owner; (2) authorized English content/images, destination/action scope, organization Admin and manual submission owner; and (3) an existing domain/ingress that makes originals/images reachable by destination platforms and intended readers, or a decision owner for the public Ghost ingress. Operational acceptance also needs named payment, maintenance, privacy and backup owners and recovery targets for the existing deployment. Transfer secrets privately; do not ask again for the local environment or purchase/migrate resources automatically.

未纳入新要求：所有 Nyx credential／transport 支持、定时发布、自助开站、自动域名、个人 Hashnode 或额外平台。显式补图和单独 sync-links 继续作为已有工程设计记录，不扩大 v0.7 产品义务。

No new requirement is added for every Nyx credential/transport, scheduled publishing, self-service provisioning, automatic domains, personal Hashnode or additional platforms. Explicit media completion and separate sync-links remain documented implementation choices rather than expanded v0.7 product obligations.
