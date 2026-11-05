# 008. CMS 外部发布登记与 NyxBot DEV 闭环 / External publication registration

## 范围与需求 / Scope and requirements

本工作包实现个人 DEV 外部执行：CMS 验证已发布的 Ghost 原文并冻结精确发布材料，NyxBot 以自身顶层 NyxID 工具授权调用 DEV，CMS 独立读取 DEV 并登记已核验副本。CMS 的嵌套 Worker 写入限制不代表 NyxBot 顶层 DEV 工具不可写。组织 DEV/Hashnode 的具体内容、目的地、动作 Admin 授权要求保持不变；本路径拒绝组织请求，不回退个人账号。不修改需求 v0.7，也不代表 D6/D7 全部通过。

This work package implements personal DEV execution outside CMS: CMS verifies the published Ghost original and freezes exact material; NyxBot uses its own top-level NyxID tool authority to call DEV; CMS independently reads DEV and registers the verified copy. Restrictions on nested CMS Worker writes do not imply that NyxBot's top-level DEV tool cannot write. Exact content, destination and action Admin authorization remains mandatory for organization DEV/Hashnode. This path rejects organization requests without falling back to a personal account. Requirements v0.7 remain unchanged, and this is not acceptance of all D6/D7 outcomes.

| Requirement | 本实现 / Implementation | 边界 / Boundary |
| --- | --- | --- |
| R6 | 准备时读回验证 Ghost 的冻结原文 / Verify the frozen Ghost original at preparation | 原文验证失败拒绝准备 / Fail closed when original verification fails |
| R7 | 个人 DEV 指定 NyxID connection/account，精确材料交接 / Exact personal DEV material and selected NyxID connection/account | 组织路径仍拒绝；公开动作需要具体授权 / Organization path rejected; public action needs explicit approval |
| R8 / D7 | 双入口相同登记、状态、URL、历史、只读对账与同步 / Shared registration, state, URL, history, read-only reconciliation and sync | 本地取消不能撤回独立工具请求 / Local cancellation cannot revoke an independent tool request |
| R9 | 从原指定连接读取可用指标并保留上次有效数据 / Read supported metrics using the exact connection and retain last valid data | 失效授权和不可用指标显式显示 / Expired authority and unavailable metrics remain visible |
| D6 | 可复验个人闭环实现与真实外部证据分级 / Reproducible personal implementation with layered evidence | 草稿和 mock 均不算正式公开发布通过 / Drafts and mocks do not prove public publication |

## 架构选择 / Architecture

复用 `DistributionService` 的冻结 CopyPayload 和 `DevAdapter` 的 request/normalize/metrics 逻辑，通过独立 `ExternalPublicationService` 编排“准备—核验—登记—观察”。控制层只负责身份与 DTO，服务层负责生命周期和授权复查，Store 保存 intent、幂等映射与观察。平台 Adapter 隔离 DEV 契约；不新增跨系统授权协议。

Reuse frozen CopyPayload generation in `DistributionService` and request/normalize/metrics behavior in `DevAdapter`. A separate `ExternalPublicationService` coordinates preparation, verification, registration and observation. Controllers handle identity and DTOs, the service enforces lifecycle and renewed authorization, and Store persists intents, idempotency and observations. The platform Adapter isolates the DEV contract without introducing a cross-system authorization protocol.

选择在既有 delivery 旁增加外部执行记录，保留已有发布历史和查询入口。与复用“计划”或创建 Worker job 相比，这能明确区分实际外部执行与未来提醒，并保持旧任务语义。只有新建且带有外部记录的 delivery 能进入本流程；旧 blocked/uncertain 任务不能转成外部模式，外部 intent 也不能被旧 Worker 接管。

An external execution record accompanies the existing delivery, preserving history and read surfaces. Compared with reusing a future plan or creating a Worker job, this makes execution ownership explicit and preserves legacy semantics. Only newly created deliveries carrying the external record enter this flow. Old blocked/uncertain tasks cannot be converted, and the old Worker cannot take over an external intent.

CMS 与 DEV 调用是独立的授权与网络事务。准备只冻结材料，不证明 DEV 请求已发送；成功登记必须由 CMS 经原连接独立 GET 核验。登记前后检查 owner、连接指纹、冻结内容和状态。取消只关闭本地待处理 intent，不能保证阻止已由 NyxBot 发出的请求；已经发送但丢失回执必须只读对账，不能自动再次 create。

CMS and DEV calls are independent authorization and network transactions. Preparation freezes material without proving dispatch. Successful registration requires an independent CMS GET through the original connection. Owner, connection fingerprint, frozen content and state are checked around remote reads. Cancellation closes the local pending intent and cannot guarantee prevention of a request already sent by NyxBot. A lost receipt requires read-only reconciliation, never an automatic second create.

## NyxBot 调用顺序 / NyxBot operation order

1. 调用 `getWorkspaces`、`listArticles` / `getArticle`、`listOriginals` 与 `listOwnerConnections`，选定个人 workspace、确定 revision 的已发布 Ghost release 和 DEV 账号。确认文字、图片权利及具体公开内容/目的地/动作。

   Call `getWorkspaces`, `listArticles` / `getArticle`, `listOriginals` and `listOwnerConnections`. Select a personal workspace, a published Ghost release at a known revision and the exact DEV account. Obtain confirmation for rights and the specific public content, destination and action.

2. 调用 `prepareExternalPublication`：`POST /api/service/releases/{releaseId}/external-publications`，body 为 `target:dev`、`connectionId`、`action:create|update`、`format:full|excerpt`、`rightsConfirmed:true`、稳定的 `idempotencyKey`；update 另传 `copyId`，excerpt 另传 `excerpt`。返回 `intentId`、冻结 revision/digest 和完整 `request`。这是可审阅发布预览，不是已经发布。

   Call `prepareExternalPublication` with `target:dev`, `connectionId`, `action:create|update`, `format:full|excerpt`, `rightsConfirmed:true` and a stable `idempotencyKey`; include `copyId` for updates and `excerpt` for excerpts. The result contains `intentId`, frozen revision/digest and the complete `request`. This is a reviewable preview, not a publication result.

3. 在独立顶层 DEV 工具调用中使用原选定 connection/account 和原样 `request`，由 NyxID 执行该工具自身的权限及审批。不得将 CMS 的 Bearer 或准备结果当作 DEV 授权，不得改变 title、body、canonical、published 或另选账号。未获公开动作授权时停在此预览，把准确材料交给协调者。

   Use the original connection/account and unchanged `request` in an independent top-level DEV tool call, subject to that tool's own NyxID authorization and approvals. Neither the CMS Bearer nor preparation output grants DEV authority. Do not change title, body, canonical, published or account. Without approval for the public action, stop at this preview and hand the exact material to the coordinator.

4. 获得 DEV `id` 后调用 `registerExternalPublication`：`POST /api/service/external-publications/{intentId}/register`，仅传 `remoteId` 与稳定 `idempotencyKey`。不传客户端 URL，也不把 Bot 自述成功视为证据。CMS 只接受平台返回的可信 HTTPS URL，并核验 ID、账号、标题、全文、署名、source/canonical 和公开状态。未公开草稿不能登记为 published。

   After receiving the DEV `id`, call `registerExternalPublication` with only `remoteId` and a stable `idempotencyKey`. Do not supply a client URL or treat the Bot's claim as evidence. CMS accepts only a trusted HTTPS URL returned by the platform and verifies ID, account, title, full body, attribution, source/canonical and public state. An unpublished draft cannot be registered as published.

5. 超时或丢失 ID 时调用 `reconcileExternalPublication`。搜索必须唯一匹配；零匹配、多匹配或扫描不完整均不允许自动重发。后续用 `getExternalPublication` / `syncExternalPublication` 查看观察结果；纠错需要新冻结 update intent 与独立具体动作授权，人工移除用 `followUpExternalPublication` 跟踪。

   On timeout or missing ID, call `reconcileExternalPublication`. The search must prove a unique match. Zero matches, multiple matches or incomplete enumeration never authorize resending. Use `getExternalPublication` / `syncExternalPublication` for subsequent observations. Corrections require a newly frozen update intent and independent action authorization; track manual removal through `followUpExternalPublication`.

所有上述业务接口同时提供 `/api/cms` 与 `/api/service`，权限、状态与历史共用。Studio 展示材料、回执登记和只读刷新；它不承诺 CMS 页面一键发送 DEV。OpenAPI operationId 是注册源，NyxID catalog 中实际工具名需重新读取确认，不凭旧名字猜测。

Every operation is available under both `/api/cms` and `/api/service` with shared permissions, state and history. Studio exposes material, receipt registration and read-only refresh; it does not promise a CMS one-click DEV write. OpenAPI operation IDs are the registration source. Inspect the refreshed NyxID catalog for actual tool names instead of guessing stale names.

`reconcileExternalPublication`、`syncExternalPublication` 和 `cancelExternalPublication` 只使用 path `id`，OpenAPI 不声明 `requestBody`。HTTP POST 不发送 payload 或 JSON Content-Type；generated tool 只传 `id`。这修复了 008-IR05：必填空 object 无法被 NyxID 展平为有效 body 字段。prepare、register、follow-up 的真实必填 body、认证和 path 约束保持不变。

`reconcileExternalPublication`, `syncExternalPublication` and `cancelExternalPublication` use only the path `id` and omit OpenAPI `requestBody`. Their HTTP POST sends neither a payload nor a JSON Content-Type, and the generated tool receives only `id`. This fixes 008-IR05, where NyxID could not flatten a required empty object into valid body fields. Required bodies for prepare, register and follow-up, authentication and path constraints remain intact.

只有刚完成在线原文与连接核验的 `prepare` 响应可返回 `executionAllowed:true`，它仍不是 DEV 授权，也不能保证后续独立调用的原子性。`get` 及其他观察响应中的该字段为 false；重新取到历史预览不能替代新一次准备核验。同一 prepare 幂等 key 的重试会重新核验仍待执行的 Ghost 原文。

Only a `prepare` response that has just verified the original and connection online may return `executionAllowed:true`. It is still not DEV authority or an atomicity guarantee for the later independent call. The field is false in `get` and other observation responses. Reading an old preview does not replace fresh preparation checks. Retrying the same prepare idempotency key re-verifies an original whose external intent is still pending.

早期查询和事务内并发命中的 prepare 幂等记录共用同一复核路径：核验实际返回 intent 的冻结原文、连接和最终状态，不能借用竞争请求的候选材料证明。update 幂等重放先于旧副本的可更新状态检查，因此成功纠错使旧副本 superseded 后，相同输入/key 仍返回已存在结果且不可再次执行；当前身份授权和同 key 异参冲突检查始终保留。

Prepare idempotency hits from either the early lookup or the concurrent transaction share the same validation path. Checks bind to the returned intent's frozen source, connection and final state, never the competing request's candidate payload. An update replay resolves before testing whether its predecessor can be updated: after a successful correction supersedes that predecessor, the same input/key returns the existing result without permitting another execution. Current identity authorization and same-key input conflicts remain enforced.

人工移除先记录 `followUpExternalPublication {action:"removal"}`，实际操作由原账号在 DEV 完成。随后 `{action:"verify-removal"}` 只读核验指定远端 ID 的 404/410，并复查当前身份与连接后才登记 removed；这不调用 DELETE。相关历史副本保留最后有效 URL/证据，仍未解决的独立请求继续阻止新 create。

For manual removal, first record `followUpExternalPublication {action:"removal"}` and complete the actual removal on DEV using the original account. Then `{action:"verify-removal"}` checks the selected remote ID for 404/410 and rechecks identity and connection before recording removed; it never calls DELETE. Related historical copies retain their last valid URL/evidence, and unresolved independent requests continue to prevent a new create.

移除读取还绑定同一 owner、connection、target、remoteId 的关联记录集合及版本。读取期间有新登记、更新或观察改变关联记录时，旧的 404/410 不再有效，必须重新读取；不能覆盖刚成功的新副本，也不能因此放开重复 create。

Removal reads also bind to the set and versions of records sharing the same owner, connection, target and remoteId. A registration, update or observation that changes those records while the read is pending invalidates its 404/410 proof and requires another read. A stale result cannot overwrite a newly verified copy or permit a duplicate create.

## 只读同步运行 / Running read-only synchronization

使用与该 CMS 相同的配置和数据库运行 `npm run sync:external`。这是独立只读进程，不启动 delivery Worker，也不消费积压 jobs。`EXTERNAL_SYNC_INTERVAL_MS` 默认 900000（15 分钟，范围 60000–86400000）；`EXTERNAL_SYNC_POLL_MS` 默认 30000；`EXTERNAL_SYNC_BATCH_SIZE` 默认 20。单进程串行执行，SIGINT/SIGTERM 停止轮询并关闭 DB。不要为了同步而启动被暂停的正式 Worker。

Run `npm run sync:external` with the same configuration and database as the intended CMS. This is a separate read-only process: it neither starts the delivery Worker nor drains pending jobs. `EXTERNAL_SYNC_INTERVAL_MS` defaults to 900000 (15 minutes, range 60000–86400000), `EXTERNAL_SYNC_POLL_MS` to 30000 and `EXTERNAL_SYNC_BATCH_SIZE` to 20. Processing is sequential within the process; SIGINT/SIGTERM stops polling and closes the database. Do not start a paused production Worker to enable sync.

同步继续使用保存的调用者和指定连接并在线验证。短期 delegation 到期会要求同一 owner 重新授权/手动刷新，不回退管理员或其他账号，也不把临时 token 视为永久读取凭据。远端内容变化、429、连接失效和私有指标不可读均保留观察与错误分类，最后一次有效证据不被“Unavailable”覆盖。正常同步永不发布、更新或删除 DEV 内容。

Synchronization uses the retained caller and selected connection with online validation. An expired short-lived delegation requires the same owner to reauthorize or manually refresh. It never falls back to an administrator or another account, and a temporary token is not a permanent read credential. Remote changes, rate limits, disabled connections and unavailable private metrics remain visible as observations and classified errors while the last valid evidence is retained. Synchronization never publishes, updates or deletes DEV content.

批量同步只预选 ID；处理每条记录时从同一最新快照读取状态、到期时间、凭据和 generation。批次等待期间已刷新且未到期的记录会跳过，失败也绑定实际使用的快照版本，避免旧凭据的失败覆盖新授权后的成功。

Batch synchronization selects IDs only, then reads each record's state, due time, credential and generation from the same current snapshot. Records refreshed while waiting in the batch are skipped until due. Failure recording remains tied to the snapshot actually used, so a stale credential failure cannot replace a success under renewed authorization.

`DEV_API_URL` 为运维配置的 DEV API 根地址，`DEV_PUBLIC_HOSTS` 为平台返回文章 URL 的精确可信 hostname 列表（默认 `dev.to`），不可由客户端传入。URL 必须为 HTTPS、无用户信息/非标准端口/query/fragment，并且身份及内容验证同时通过；可信域不是发布成功证明。

`DEV_API_URL` is the operator-configured DEV API base. `DEV_PUBLIC_HOSTS` is the exact trusted hostname list for returned article URLs (default `dev.to`), never client input. URLs must use HTTPS without user information, nonstandard ports, query or fragment, and identity/content verification must also succeed. A trusted domain alone is not evidence of publication.

## 验证、上线与回滚 / Validation, rollout and rollback

验证分为 Document（契约与需求）、Local（单元/集成/UI/并发/安全负例）、Live（真实模型、真实 NyxID→DEV 读取、真实 DEV 写入分别记录）。精确记录固定 commit、命令、结果、账号、数据版本和脱敏证据。只有原协调对话的独立环境复验及明确授权的公开动作完成后，才能据相应范围给出验收结论。

Evidence is separated into Document (contracts and requirements), Local (unit/integration/UI/concurrency/negative cases) and Live (real model calls, real NyxID→DEV reads and real DEV writes recorded separately). Pin the commit, commands, results, account, data version and sanitized evidence. Acceptance is scoped to independent verification by the coordinator and completion of the specifically authorized public action.

新表为增量迁移，部署前保存 CMS DB 与配置；新接口和独立同步进程可先在隔离实例运行。停止同步进程即停止新观察；回滚应用前保留新表/数据与记录，不将外部任务转换为 Worker job，不删除已发布 DEV 内容。回滚 CMS 不能撤回外部工具的网络请求；发生未知结果时保留 intent 并人工只读核对。每个错误沿用 Trace ID，日志仅记安全错误码，不记录 token、connection secret 或原始远端错误对象。

The schema change is additive. Back up the CMS database and configuration before deployment, then run the new routes and separate sync process in isolation. Stopping sync stops new observations. Preserve the new tables/data when rolling back the application; never convert external tasks into Worker jobs or delete DEV posts. CMS rollback cannot revoke an external tool request. Preserve an intent with unknown outcome for manual read-only investigation. Errors retain Trace IDs and logs contain safe classifications without tokens, connection secrets or raw remote error objects.

## 2026-11-05 个人 DEV 真实闭环 / Personal DEV live validation

具体公开创建、同文更新与读回已获得授权并执行。[测试文章](https://dev.to/aelfhzz780/verifying-a-nyxid-managed-publishing-workflow-5bmh) 的 remoteId 为 `4980723`。配置为 `gpt-6.1-sol` 的真实 NyxBot 经顶层 DEV 工具成功创建一次、随后更新同一篇文章；CMS 独立核验并登记，旧 create 为 `superseded`，update 为 `published / verified`。协调对话第一版 21 项、第二版 32 项检查通过。原始创建与更新在正常 `src/main.ts`、固定 `829b537` 上完成，已替换本任务自己的 33417 fixture；此前“未获公开授权、正向未运行、正式入口未验证”属于历史状态。

The specific public create, same-article update and readback were authorized and executed. The [test article](https://dev.to/aelfhzz780/verifying-a-nyxid-managed-publishing-workflow-5bmh) has remoteId `4980723`. Actual NyxBot calls configured for `gpt-6.1-sol` performed one successful create and one update through the top-level DEV tool. CMS independently verified and registered both versions; create is `superseded`, and update is `published / verified`. The coordinator passed 21 checks for the first version and 32 for the second. Creation and update used normal `src/main.ts` at `829b537`, replacing this task's own 33417 fixture. Earlier missing-authorization, unexecuted-positive-path and unverified-normal-entry statements are historical.

真实验收发现的 008-IR05 已在 `eff6c5fecee106f52addaf93297010670bd9bb02` 最小修复，标准检查 514 项通过。刷新原 NyxID catalog 的三条操作后，真实 generated `syncExternalPublication` 仅传 `id` 即成功，返回 `published / verified`，同步时间为 `2026-11-05T09:25:35.168Z`。早期 operator 只读 sync 与修复后的真实 generated sync 分别保留证据；此前 localhost 超时、422 canonical URL 拒绝也保留，成功阶段次数不代表历史总请求次数。

The live-discovered 008-IR05 received a minimal fix at `eff6c5fecee106f52addaf93297010670bd9bb02`; all 514 standard checks passed. After refreshing three operations in the existing NyxID catalog, the actual generated `syncExternalPublication` succeeded with only `id`, returning `published / verified` at `2026-11-05T09:25:35.168Z`. Earlier operator read-only sync and the repaired generated sync have separate evidence. Prior localhost timeout and 422 canonical URL rejection remain recorded; successful-phase counts do not describe all historical requests.

脱敏证据、版本 hash、独立读回及剩余边界见 [真实闭环证据索引](evidence/external-publication-20261105/public-positive/README.md)。原文仍为专用 loopback Ghost，已明确接受用于本轮技术闭环，不证明公网部署。组织具体 Admin 授权、整体 D1–D9、完整 D6/D7 与 PR 仍未宣告通过；另九个既有无参数操作的空 body 契约问题单独记录，不纳入本次三条最小修复。

See the [live evidence index](evidence/external-publication-20261105/public-positive/README.md) for sanitized evidence, version hashes, independent readbacks and remaining boundaries. The dedicated Ghost original remains on loopback, explicitly accepted for this technical test without proving public deployment. Organization-specific Admin authorization, overall D1–D9, complete D6/D7 and a PR remain unaccepted. The empty-body contract issue in nine legacy parameterless operations is recorded separately from this three-operation fix.
