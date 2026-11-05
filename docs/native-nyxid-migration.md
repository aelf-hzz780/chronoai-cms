# 007 CMS 原生 NyxID 适配与补丁退出 / Native NyxID adaptation and patch retirement

本文件对应固定官方 NyxID `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`，以及从 CMS `ec3f0ef8c504923c08aa408f8f1a696564620bc5` 开始的 `codex/007-cms-native-nyxid` 工作。它是需求映射、设计决策和迁移手册，不是验收通过声明。最终 CMS SHA、Document/Local/Live 结果及未决项以本次独立交接为准；协调对话负责独立验收。

This document maps requirements, records design decisions, and prepares migration from CMS baseline `ec3f0ef8c504923c08aa408f8f1a696564620bc5` on `codex/007-cms-native-nyxid` against official NyxID `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`. It does not assert acceptance. The handoff pins the resulting CMS SHA and separates Document, Local, and Live results. The coordinating chat owns independent acceptance.

## 1. 范围与设计 / Scope and design

目标是保留 CMS 的队列、幂等、状态机与恢复逻辑，改由适配层明确识别官方签名授权的来源和能力。NyxID 前后端都恢复官方版本；NyxBot、NyxAgent 不改源码。Portal 的本地 Open app 也退出，OIDC 直接登录保留。新增即时执行模式、替换发布架构、扩展 NyxID command authority 协议均不在本次方案内。

The CMS keeps its existing queue, idempotency, state machine, and recovery behavior. Its adapter classifies verified native credential sources and capabilities. NyxID backend and frontend return to official releases, with no NyxBot or NyxAgent source changes. The local portal Open app patch is retired while direct OIDC sign-in remains. A new immediate execution mode, a replacement publishing architecture, and extensions to command authority are outside scope.

采用 Adapter 将原生授权和业务权限分开：入口验证当前请求；Policy 验证 owner 和当前业务角色；Worker 只执行已经冻结的确认范围并复查当前角色、取消、连接和原生凭据。确认记录绑定 owner、revision、全文摘要、署名、动作与目标，不会成为新的通用授权。能力不足应返回明确错误，不通过“没有 proof”来推断 assistant 或自动降低安全策略。

An Adapter separates native authorization from business permissions. Ingress validates the current request; Policy checks owner and current business role; the worker executes only a frozen confirmation and rechecks role, cancellation, connection, and native credentials. Confirmation binds owner, revision, content digest, byline, action, and destination; it is not a new general authorization grant. Missing capability produces an explicit error, never inferred assistant identity or an automatic security downgrade.

| 决策 / Decision | 采用 / Selected | 取舍 / Tradeoff |
| --- | --- | --- |
| CMS 原生适配 / Native CMS adapter | 保留队列，以已验证来源选择受支持接口 / Keep queue; select supported APIs from verified provenance | 可复用恢复与审计，但必须承认官方审批缺口 / Reuses recovery and audit; official approval gaps remain explicit |
| 继续维护 NyxID 补丁 / Maintain NyxID patches | 不采用 / Rejected | 能表达旧工程细化，但违反官方版本目标并增加维护面 / Expresses earlier refinements but violates the official-version goal and adds maintenance |
| 即时发布重构 / Immediate publishing rewrite | 不作为必要项 / Not required | 不能自行解决等待审批期间撤权竞态 / Does not itself solve revocation while awaiting approval |

## 2. v0.7、A15 与 D1 映射 / Requirement mapping

原文锁定 [v0.7 requirements](source/requirements.md) 和 [supporting deliverables](source/supporting-deliverables.md)，gist revision 为 `79e69842f5bacba7f8204f62d151018bacf98d91`。A15 是工程验收细化，不等于原文指定了某个 token 协议。历史 R031 与 `049ee1c` 的测试证据继续保留其原有 SHA 和作用域，不作为本次官方版本已经通过的证据。

The source is the retained v0.7 requirements and deliverables at gist revision `79e69842f5bacba7f8204f62d151018bacf98d91`. A15 refines acceptance; it does not mean the source mandates a token protocol. Historical R031 evidence against `049ee1c` retains its original SHA and scope and cannot establish acceptance of the official version.

| 原文 / Source | 本次语义 / Current semantics | 验证 / Verification |
| --- | --- | --- |
| R2 §29、R10 §100 / Both entry points and caller scope | CMS、NyxBot 在授权范围内操作；服务调用可承载确认，不要求返回 CMS / CMS and NyxBot operate within scope; service request may carry confirmation without a CMS visit | 两入口及错误 issuer/audience/sub/service/scope/owner 反例 / Both routes and incorrect binding/scope/owner cases |
| R3 §33、R4 §41–45 / Personal and organization authority | 个人不要求组织发布资格；组织 Ghost 仅当前 Admin/Publisher，不增加外部分发审批 / Personal publishing needs no organization role; organization Ghost requires current Admin/Publisher without external-distribution approval | 无组织、Member、Publisher、Admin、撤 Publisher、退组 / No-org, Member, Publisher, Admin, role removal and departure |
| R4 §45、D3 §23 / Pending organization authority | 入队后撤销当前成员/Publisher，阻止尚未发送写入 / Removal of current membership/publishing role stops unsent writes | 入队后与审批等待中撤权；准确标明最后可阻断点 / Revoke after enqueue and during approval; identify the actual last enforceable point |
| R10 §100 / Native credential validity | 原生 introspection inactive、过期或上游不可达均停止；不续期、不替换管理员凭据 / Stop on inactive, expired, or unavailable native authority; no extension or administrator substitution | token 失效、过期、上游故障与 Worker 重启 / Invalidity, expiry, outage, and worker restart |
| 原文未指定 Agent Key 删除对旧确认的额外级联 / No specified extra cascade from Agent Key deletion | 删除 Key 阻止该 Key 的新请求；不额外解释为取消旧确认；若官方实际凭据失效仍停止 / Key deletion blocks new requests using it; no extra CMS cancellation of a prior confirmation, while native invalidation still stops it | 保留旧 actor/审计；不得把新登录写回旧任务 / Preserve actor/audit; never write a fresh login into an old task |
| R7 §61、R10 §96 / Exact connection and privacy | owner、连接账号、连接指纹不可换绑；停用或变化阻止未发送任务 / Owner, account and connection fingerprint remain fixed; disable/rebinding stops unsent work | 停用/换绑、跨 owner、无可见性 / Disable/rebind, cross-owner and visibility negatives |
| R7 §63 / Organization automatic external writes | 当前 Admin 必须批准完整准确内容、目标与动作；普通 POST 路径许可不等价 / Current Admin approves exact content, destination and action; path permission alone is insufficient | M0 内容绑定与等待期间撤权证明；缺口时 fail closed / M0 body binding and revocation proof; fail closed on gaps |
| R8 §80 / Cancellation and uncertainty | 未发送可取消；已发结果未知先只读对账，禁止盲发 / Cancel unsent work; reconcile unknown sent outcomes without blind retry | 超时、丢响应、重启、并发幂等、部分成功 / Timeout, response loss, restart, concurrency and partial success |
| D1 §9–11 / Entry point from NyxID | 最新指示明确退出本地 Open app；官方等价入口须单独证明，否则保留差异 / Latest instruction removes local Open app; prove an official equivalent separately or retain a gap | OIDC 直接登录可独立验；没有入口不能把 D1 判通过 / Direct OIDC may pass separately; missing launch entry cannot pass D1 |

个人 DEV 的 `executionApproval=exact` 是可选 operator 策略，不是 v0.7 普遍要求；关闭额外 exact 不关闭 NyxID 本身适用的审批。旧 exact 或 command-proof 任务不得自动降级、换 actor、重新入队或复活。新的合法确认应产生独立记录并保留旧授权历史；uncertain 任务优先只读对账。

Personal DEV `executionApproval=exact` is an optional operator policy rather than a universal v0.7 requirement. Disabling that additional policy does not disable applicable native approvals. Existing exact or command-proof tasks cannot be downgraded, re-actorized, requeued, or revived automatically. New lawful confirmation creates a separate record and preserves prior authorization history; uncertain work is reconciled read-only first.

## 3. M0 能力边界 / M0 capability boundary

普通 service-origin delegation 与 OAuth catalog delegation 必须分开。前者没有 OAuth receiving client/live CatalogDelegationGrant，不能仅补 scope 就路由 `/api/v1/delegation/operation-catalog`。Delegated subject 不支持再次 token exchange。任何 OAuth 备选都必须基于合法 direct OAuth 来源、同一用户和范围，以及官方支持的流程。

Service-origin delegation and OAuth catalog delegation are distinct. The former lacks an OAuth receiving client and live CatalogDelegationGrant and cannot become catalog delegation through a scope configuration. Delegated subjects cannot be exchanged again. An OAuth alternative requires a legitimate direct OAuth source, the same user and scope, and a supported native flow.

官方普通 proxy 的组织 RequireApproval + PerRequest 由当前 Admin 决策，并可能在等待结束后自动发送同一缓冲请求。源码中的 method/resource/短描述不是全文批准证据。CMS beforeDispatch 只发生在调用 NyxID 之前，不能声称已经覆盖 NyxID 等待结束后真正出站的时刻。M0 必须分别证明正文与精确连接的持久绑定，以及受支持取消/分阶段机制；轮询不能代替这两个证明。

The official ordinary proxy can apply organization RequireApproval + PerRequest, ask the current Admin, and automatically send the buffered request after waiting. Method/resource/short description alone does not prove approval of the full body. CMS beforeDispatch occurs before calling NyxID and does not prove a check at the eventual outbound moment. M0 must separately prove durable body/connection binding and a supported cancellation or staged execution mechanism. Polling does not establish either guarantee.

在 M0 未通过前，组织自动外部分发与正式迁移保持阻塞；不关闭审批、不改成人工流程后宣称完成。精确源码定位、隔离网络/端口/数据库上的最小复现和真实调用结果应与本次交接一起交付。模拟测试只证明 CMS 行为，不能证明官方接口能力或真实外部账号资格。

Until M0 passes, organization automatic external distribution and production migration remain blocked. Approval is not disabled, and replacing automation with a manual flow is not reported as completion. The handoff must contain exact source references, an isolated reproduction, and actual runtime results. Mocks establish CMS behavior only, not native capability or real external account eligibility.

当前交付的保守执行边界：所有普通 proxy 写入（包括个人）返回 `NATIVE_DISPATCH_UNSUPPORTED`，因为调用前检查不能覆盖原生等待审批后的自动发送；只读代理继续可用。原生 exact 的先批准、再 redeem 流程保留给合法 direct OAuth 来源；service-origin delegation 请求 exact 返回 `NATIVE_EXACT_UNSUPPORTED`，不二次 exchange，也不替换用户身份。这是显式功能限制，不能把个人或组织自动外部分发整体标为通过。原生审批“可能支持”不等于审批后的 CMS 安全检查已经成立。

The current conservative boundary rejects every ordinary proxy write, including personal writes, with `NATIVE_DISPATCH_UNSUPPORTED`: a check before calling NyxID cannot guard its automatic send after approval waiting. Read-only proxy requests remain available. Native exact approval followed by redeem is retained for legitimate direct OAuth credentials; service-origin exact requests return `NATIVE_EXACT_UNSUPPORTED`, without another exchange or identity substitution. This is an explicit functional limit, not acceptance of personal or organization automatic external distribution. Possible native approval support does not prove the CMS checks remain effective after that wait.

## 4. 官方版本与部署清单 / Official release and deployment inventory

| 项目 / Item | 固定要求 / Required value |
| --- | --- |
| 官方源码 / Official source | `ChronoAIProject/NyxID` commit `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5` |
| 后端镜像 / Backend image | `ghcr.io/chronoaiproject/nyxid/backend@sha256:989c2af8e68d843ca2f1e65ab99323d44190f87d16285db49778de37aa59e5f2`；M0 已解析固定版本 / M0 resolved the pinned version |
| 前端镜像 / Frontend image | `ghcr.io/chronoaiproject/nyxid/frontend@sha256:d211a8ca3db156966ea6a2ed2542322ee99c28673a315f19ad1e21d5b20f97c4`；M0 已核对镜像身份，尚未启动 / M0 inspected image identity; not yet started |
| 现补丁 / Existing patches | backend `049ee1c2ca811a002590dc8330ce646078bb1158`；portal `c65dc4bedb7da79cf0fb477e6f5bd809f03aec9b`，仅作为当前状态和回滚版本 / Current state and rollback versions only |
| issuer / Identity issuer | `http://localhost:3001`，不得改成容器 DNS / Must not become container DNS |
| CMS / CMS runtime | 3457 catalog 目标；3458 `ec3f0ef` 验收环境、出站暂停且无 Worker / 3457 catalog target; 3458 baseline acceptance runtime paused without worker |
| NyxAgent | 8088，源码不改 / Port 8088; no source change |
| LAN | `https://192.168.3.48:9443` 及现有 Discovery/relay，逐项保留 / Preserve current Discovery/relay behavior |
| 另机 OAuth client / Remote client | `9df5301c-9566-4567-9bee-a7707251d89d`；`openid profile proxy`；原 secret / Preserve original secret |
| 精确回调 / Exact callbacks | `https://192.168.3.39:8443/auth/callback`、`https://192.168.3.39:8443/connections/return` |
| Docker / Docker runtime | `colima-blogsystem`，6 GiB；宿主机端口仅 loopback，容器内监听 `0.0.0.0` / Host ports use loopback; containers listen on `0.0.0.0` |
| 保留服务 / Preserved services | 四 Ghost 3468/3469/3478/3479 与 baseline 2468/2469；不重建、不停机 / Do not rebuild or stop the four Ghost sites or baseline pair |

两镜像 digest 已按 M0 的实际 `docker image inspect` 结果填写，OCI revision 均匹配官方 SHA；隔离后端 health 返回 `0.75.0` / `38bae2f7825b`，前端当前只有镜像身份验证，不能算 UI 验证。其余 `REQUIRED` 尚待真实输入。模板的占位符不是可运行的锁定值。本文件不把官方 tag 或本地补丁镜像算成同等版本。现行配置、密钥值和注册完整预像仅存私有目录，不入库。

Both image digests come from actual M0 docker image inspection, and both OCI revisions match the official SHA. The isolated backend health reports `0.75.0` / `38bae2f7825b`; frontend image identity alone does not establish UI verification. Other REQUIRED inputs remain outstanding. Placeholders are not runnable pins. An official tag alone or a local patched image is not an equivalent version. Current configuration, secret values, and full registration preimages remain in private storage outside Git.

## 5. 可复跑操作 / Reproducible operations

迁移入口为 [migration script](../scripts/native-nyxid-migration.ts) 和 [manifest template](../infra/native-nyxid/manifest.example.json)。默认 `plan` 只报告输入缺口。所有有副作用的操作都要显式 `--execute`。本轮未执行正式 capture、stage、activate 或 rollback；`plan` 与独立合成数据库测试不能算实际迁移验证。

Use the migration script and manifest template. `plan` reports missing inputs without changes. Every mutating mode requires `--execute`. No production capture, stage, activation, or rollback is asserted here. Plan output and synthetic database tests do not establish a successful real migration.

```bash
node scripts/native-nyxid-migration.ts plan /absolute/private/manifest.json
node scripts/native-nyxid-migration.ts preflight /absolute/private/manifest.json
node --test scripts/native-nyxid-migration.test.ts
# 以下仅在实际前置条件满足时执行 / Run only after actual prerequisites hold:
node scripts/native-nyxid-migration.ts capture /absolute/private/manifest.json --execute
node scripts/native-nyxid-migration.ts stage /absolute/private/manifest.json --execute
node scripts/native-nyxid-migration.ts verify /absolute/private/manifest.json
node scripts/native-nyxid-migration.ts activate /absolute/private/manifest.json --execute
node scripts/native-nyxid-migration.ts rollback /absolute/private/manifest.json --execute
```

1. **先暂停并排空。** 将所有 CMS 数据库的 `outbound_paused` 设为 `true`，停止全部 Worker（包括 native 进程），等待已发送请求落入确定或 uncertain 状态。任何仍在 NyxID 等待批准、可能自动发送的请求都必须先处理；暂停 CMS 不能撤回它。脚本只读检查暂停和无 running job，不会静默改队列。

   **Pause and drain first.** Set every CMS database's outbound pause, stop all workers including native processes, and settle sent requests to a known or uncertain state. Resolve requests still buffered by NyxID before capture: pausing CMS cannot recall them. The script checks pause and absence of running jobs without silently editing the queue.

2. **备份再切换。** `capture` 保存一致 SQLite snapshot、当前 Mongo 全量 `mongodump --oplog`、JWT keys、TUF state、原生与目标容器 env、LAN/relay/门户/CMS 配置、服务和 OAuth 注册完整预像及所用 hook。Mongo dump 配置必须支持 replica set 全量导出，不限定单个 database；失败就阻断。配置与密钥目录在备份前后核对摘要，检测并发修改。备份使用既有 AES-256-GCM envelope，独立 `NATIVE_MIGRATION_BACKUP_KEY` 仅由环境提供，不与备份打包。输出为 0600，私有目录为 0700。Mongo dump 配置路径必须位于明确核对过的现有 Mongo container 内；不连接 37018 测试 helper，不使用共享 27019。

   **Capture before switching.** Capture consistent SQLite snapshots, a full Mongo dump including oplog, JWT keys, TUF state, native/container environments, LAN/relay/portal/CMS configuration, full service/OAuth registration preimages, and reviewed hooks. The Mongo configuration must support a full replica-set dump without a database restriction; failure blocks migration. Configuration/key fingerprints before and after capture detect concurrent change. The existing AES-256-GCM backup envelope uses a separate environment-only `NATIVE_MIGRATION_BACKUP_KEY`. Private files/directories use 0600/0700. The dump configuration lives inside the explicitly identified current Mongo container. Test helpers never use live relay 37018 or shared test port 27019.

3. **独立验收与唯一写入者门禁。** `stage` 和 `activate` 要求 `status=ACCEPTED` 的独立记录，准确绑定 CMS SHA、官方 SHA、两镜像 digest，且 `organizationApproval=PASSED`、`realInputsVerified=true`、`blockers=[]`。开发方不能自行填“通过”；缺失记录时脚本阻断。`stage` 在 Docker up **之前**执行 `stopPrevious`，停止旧 native backend/portal 并关闭其自动重启；随后必须通过单独的 `verifyPreviousStopped`，才能启动官方候选。不能让两个后端同时连接并写入共享 Mongo。这个顺序意味着计划停机，不能用先开候选、后切流隐藏双写窗口。M0 的隔离实验与此正式迁移脚本分开运行。

   **Independent acceptance and sole-writer gate.** Staging and activation require an independent `ACCEPTED` record binding the CMS commit, official commit and both image digests, with organization approval passed, real inputs verified and no blockers. Development cannot self-approve it. Before Docker up, staging stops the previous native backend/portal, disables automatic restart, and requires a separate stopped-state verification. The candidate cannot start while the previous backend can write the shared Mongo database. This imposes planned downtime; starting a candidate before routing changes would create an unacceptable overlap. M0 runs separately on isolated data.

4. **容器与地址复验。** manifest 必须显式指定已存在的 Docker network 与候选 loopback 端口；默认示例 33003/33000 不抢占当前 3003/3000。后端 `DATABASE_URL` 不能仍指容器自己的 `127.0.0.1`。服务注册中指向 macOS 的 3457、3458、8088 及其他现有地址需通过受支持 API、带预像校验改成容器可达地址；不能改 issuer/audience 来凑通。`verify` 从后端容器发只读探测，并检查 discovery 的 issuer。

   **Verify containers and addresses.** Specify an existing Docker network and candidate loopback ports; example ports 33003/33000 do not replace active 3003/3000. Backend DATABASE_URL must not address its own loopback. Adjust macOS-hosted service addresses through supported APIs with preimage checks and prove reachability from the backend container. Never alter issuer/audience to make a request pass. Verification probes from the backend container and checks discovery issuer.

5. **部署 hook 必须重新准备。** `quiescence`、`stopPrevious`、`verifyPreviousStopped`、`switchToOfficial`、`switchToPrevious` 是部署相关的可执行文件，manifest 锁定文件 SHA-256，执行前复查。它们必须读取私有配置，按 PID+启动时间+命令指纹验证进程、按配置/注册预像验证无漂移，并输出 `{status:"OK",outboundPaused:true,workersStopped:true,activeWrites:0,pendingNyxidRequests:0}`。停机与停机复核 hook 还必须返回 `previousBackendStopped:true`、`previousPortalStopped:true`、`previousAutoRestartDisabled:true`，否则不启动候选。`quiescence` 和 `verifyPreviousStopped` 必须只读；进程已停不能仅凭 HTTP 不通判断，须核对原 PID incarnation/监督器、监听进程和禁止重启状态。`switchToOfficial` 只负责 relay/portal 路由与服务注册，不得负责延迟停止旧 backend，更不得重启它。模板不包含尚未经独立审查的 hook；这是实际切换的明确输入缺口，不应自行填空实现。所有 hook 必须保留 LAN、NyxAgent 和精确回调；禁止调用旧 `native-backend-control.py rollback --execute`。

   **Prepare fresh deployment hooks.** The manifest pins reviewed hooks for quiescence, stopping the previous runtime, independently verifying it stopped, switching to official, and switching back. All verify process incarnation and configuration/registration preimages and return the paused/quiescent contract. Stop and stopped-state verification must also attest that the previous backend/portal are stopped and automatic restart is disabled. Quiescence and stopped-state verification are read-only; HTTP unreachability alone is insufficient—verify the original process incarnation, supervisor/listener ownership and restart settings. Switching to official only changes routing/registration; it cannot defer stopping or restart the previous backend. No unreviewed hook is supplied by the template. Every hook preserves LAN, NyxAgent and exact callbacks; the older native-backend-control rollback is forbidden.

6. **切换后仍暂停。** 登录、JWKS/kid、身份、组织、连接、scopes、回调、四 Ghost、NyxAgent 和服务操作逐项读回。记录 Open app 退出后 D1 的差异。旧任务保持原 actor 和状态；uncertain 先对账。只有独立验收和单独解除暂停决策后才恢复 Worker/出站；本脚本没有 resume 操作。

   **Remain paused after switching.** Read back login, JWKS/kid, identities, organizations, connections, scopes, callbacks, Ghost, NyxAgent and service operations. Record the D1 gap after removing Open app. Preserve old actors and task states, and reconcile uncertainty before writes. Resuming workers/outbound requires a separate decision after acceptance; this script has no resume mode.

## 6. 回滚与风险 / Rollback and risk

`rollback` 先验证暂停、备份/manifest/compose 未变以及六个保留站点仍为原 container ID/image，然后**先停止官方候选 backend/frontend，并以 Docker inspect 确认全部停止，才调用 `switchToPrevious` 恢复旧实例与地址**。stop 或 inspect 失败时不得重启旧 backend。它不删除 volumes、不导入 Mongo、不恢复旧 SQLite、不重排任何任务。回滚恢复软件版本、配置和地址，保留当前数据库和审计前进；外部副本不能通过恢复数据库来撤销。若数据库迁移不兼容，保持暂停并进入单独审查的恢复流程。

Rollback verifies pause, unchanged backup/manifest/compose inputs and the six preserved site containers, then stops the official candidate backend/frontend and verifies via Docker inspect that all are stopped **before** invoking switch-back to restore the previous runtime and addresses. A stop or inspection failure cannot restart the previous backend. It never deletes volumes, imports Mongo, restores old SQLite, or requeues work. Restore software, configuration and routing while keeping current data and audit history. Database incompatibility requires a separate reviewed recovery procedure while remaining paused.

状态在每个副作用前落盘。旧实例停机或复核失败保留 `STOPPING_PREVIOUS` 且没有启动候选；候选部分启动失败保留 `STAGING` 和已建立的 container ID；回滚停机/检查失败保留 `STOPPING_CANDIDATE`，旧实例不启动；旧实例恢复失败保留 `CANDIDATE_STOPPED`，两侧均停止，可再次回滚。以上状态均保持出站暂停。故障注入行为测试核对执行事件顺序和同时存活的后端数量，不仅检查 manifest 字段。真实进程 hook 和正式停机/恢复仍待独立环境验证。

State is persisted before every effect. Failure to stop/verify the previous runtime leaves STOPPING_PREVIOUS without starting candidates; partial candidate startup retains STAGING and created container identities; a rollback stop/inspection failure leaves STOPPING_CANDIDATE without starting the previous backend; failure to restore it leaves CANDIDATE_STOPPED with both backends stopped and rollback retry available. Outbound stays paused. Fault-injection tests assert execution order and concurrent backend count, not just manifest fields. Real process hooks and production shutdown/recovery remain subject to independent validation.

主要未决风险是官方审批正文/目标绑定与等待期间撤权，以及切流 hook 和真实账号输入。普通 proxy 的个人外分发同样受阻，不只是组织流程。容量也需预检：Colima 只有 6 GiB，候选后端上限 2 GiB、前端 256 MiB，并不能保证剩余服务有足够余量。M0 不应触发全量 Rust 编译挤占运行服务。备份恢复验证、生产 RPO/RTO、真实个人/组织自动外分发和公开发文授权均不得由本次脚本单元测试推断通过。

Open risks include native approval body/destination binding and revocation during its wait, current deployment hooks, and real account inputs. Personal ordinary-proxy external writes are blocked as well as organization writes. Capacity also needs verification: the 6 GiB Colima runtime has candidate limits of 2 GiB backend and 256 MiB frontend, which do not guarantee sufficient headroom for existing services. M0 must not starve running services with a full Rust build. Script unit tests do not establish restored backup integrity, production RPO/RTO, real personal/organization distribution, or authorization for a public post.

Metadata continuation 的授权范围是有限的：发布后派生 projection 与显式 `sync-links` 都保存受影响原文的 release/revision、remote ID、站点与 Admin route、署名映射及允许的 hreflang 目标快照。确认后增加目标、改变目的地或署名会返回 `PROJECTION_SCOPE_CHANGED`，要求新的 `sync-links` 确认；旧 actor 和快照不被覆盖。原集合允许缩减：已下线原文不会收到写入，剩余原文可移除指向它的陈旧链接。已经发送但结果丢失的 metadata 修正任务复制原快照，在每次写入最后一个异步权限检查后再次验证，不因重试默许扩展授权。没有快照的历史 projection 不自动转换。

Metadata continuation has bounded authority. Both release-derived projections and explicit `sync-links` confirmations retain snapshots of affected release/revision identities, remote IDs, sites and Admin routes, credited-author mappings, and permitted hreflang destinations. Adding a target or changing routing/byline returns `PROJECTION_SCOPE_CHANGED` and requires a new `sync-links` confirmation without overwriting the old actor or snapshot. The original set may shrink: retired originals receive no write, while remaining originals may remove stale links to them. Corrections after an uncertain metadata response copy the original snapshot and revalidate it after the final asynchronous permission check before every write. Retries never expand authority, and historical projections without snapshots are not automatically converted.
