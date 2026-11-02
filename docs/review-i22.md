# I22 R031 V1 command authority consumer（候选）

## 状态与范围 / Status and scope

2026-11-02 按已确认的本地 NyxID V1 契约实现 BlogSystem consumer，关联 R031/P1、A09/A15、D2/D3/D5/D9。本页记录本提交的候选实现和本地模型证据；NyxID 后端固定 SHA 的真实联合验证、独立验收及完整 R031 关闭尚未完成。原独立业务基准仍为 `0418652`，文档交付基准为 `6ea9ecd`；历史 I16/I17 及正式矩阵保留。

On 2026-11-02 the BlogSystem consumer implements the agreed local NyxID V1 contract for R031/P1, A09/A15 and D2/D3/D5/D9. This report covers the candidate implementation in this commit and modeled local evidence. Actual integration against a fixed backend SHA, independent acceptance and complete R031 closure remain pending. The independently reviewed business baseline remains `0418652`, with documentation delivered through `6ea9ecd`; I16/I17 history and the formal matrix are preserved.

目标是让真实已批准、具备可信命令来源且在线核验通过的 key/child 请求进入原发布流程；不是扩大 scope、延长凭据、跳过 Publisher 或批准。V1 上游适用范围仅为个人 owner key/child、个人无凭据 HTTP catalog 连接、已注册 confidential resource client，以及 AutoAllow 或本次 per_request 批准。grant 复用、assistant、org-specialist、provider、node、已有 operation policy 和转换 override 等不受支持的来源仍须上游拒绝、consumer fail closed。个人 NyxID 连接的 subject 在博客中仍可按当前角色作为组织 Publisher。

The goal is to admit genuinely approved key/child requests with signed command provenance and successful online validation into the existing publishing flow. It does not expand scopes, extend credentials or bypass Publisher and approval checks. Upstream V1 supports personal-owner keys/children, personal credential-free HTTP catalog connections, registered confidential resource clients and AutoAllow or the current per-request approval. Reused grants, assistant, org-specialist, provider, node, existing operation-policy and transform-override paths remain unsupported and must fail closed. A personal NyxID connection subject may still act as a BlogSystem organization Publisher when currently authorized.

## 设计与传递 / Design and transmission

采用既有 Adapter／Policy 组合：HTTP 层只保留真实请求字节，`CallerAuthorization` 验签及恢复来源，`NyxAuthority` 负责官方在线契约，业务服务负责事务内命令绑定，Worker 负责执行与最终写入边界。没有把来源 proof 当成业务角色，也没有从 Nyx 内部 snapshot 推断权限。

The implementation composes the existing adapters and Policy: the HTTP layer retains actual request bytes, `CallerAuthorization` verifies and restores provenance, `NyxAuthority` checks the official online contract, services bind commands transactionally, and workers enforce execution and final-write boundaries. Source proof does not confer business roles, and Nyx internal snapshots are never interpreted as authority.

专用 `X-NyxID-Command-Authority` 必须与真实 identity/delegation 一同进入 service 接口。通过已配置 issuer 的 JWKS 验证 RS256、精确 `typ=nyxid-command-authority+jwt`、issuer/sub/catalog audience、jti/iat/exp、UserService、来源结构与 delegation SHA；proof expiry 不得晚于原 delegation，不续期。`command_request` 必须与实际请求逐字段匹配。proof 和实际 descriptor 只随既有加密 Actor 保存，不作为明文 API 响应或日志输出。

The dedicated `X-NyxID-Command-Authority` must accompany signed identity and delegation at service ingress. Configured issuer JWKS verify RS256, the exact `typ=nyxid-command-authority+jwt`, issuer, subject, catalog audience, jti/iat/exp, UserService, source structure and delegation SHA. Proof expiry cannot exceed the original delegation and is never renewed. Every `command_request` field must match the actual request. The proof and actual descriptor travel only in the existing encrypted Actor snapshot and are not exposed in plaintext API responses or logs.

两个原待确认点现已按后端回执确定：path/query 是资源服务器实际收到的最终 URL path 加原样 query（含 base URL 路径，已剥 Nyx proxy 前缀，不含 scheme/host）；body hash 是最终转发 buffer 逐字节 SHA256，空 body 也计算，不能对解析后的 JSON 重新编码。所有 SHA256 为小写64hex、无前缀；delegation hash 对最终 delegation header 原始 UTF-8 字节计算。Content-Type 与 Idempotency-Key 使用单一 header 原值，不规范化；不存在时 descriptor 为 null、在线 form 省略。重复 header 拒绝。Fastify JSON parser 保留原始 buffer，同时沿用原 JSON 安全解析器。

Both previously open details are now confirmed by the backend: path/query is the resource server's final URL path plus unchanged query, including the base URL path and excluding the Nyx proxy prefix, scheme and host. Body SHA256 covers the final forwarded buffer byte for byte, including an empty body; parsed JSON must not be re-encoded. SHA256 values use 64 lowercase hex characters without a prefix. Delegation SHA covers the final delegation header's original UTF-8 bytes. Content-Type and Idempotency-Key retain their single raw header values without normalization; absence is null in the descriptor and omitted from the online form. Duplicate headers are rejected. Fastify retains the original buffer while preserving its existing safe JSON parser.

`POST /oauth/introspect` 使用现有配置 URL 和 confidential client，发送 `token_type_hint=command_authority`、原 proof、catalog `service_id`、原 descriptor 参数与 delegation SHA。响应必须同时满足 `active:true`、`token_type:command_authority`、`scope:proxy`、`independent_commands:true`、`authority_version:1`、`permissions:string[]`，并精确匹配所有公共字段、原 descriptor 和 source。`permissions` 不替代本地 RBAC；普通 delegation introspection 仍独立执行。在线 inactive、错误、断连、超时、畸形或绑定漂移均拒绝，结果不缓存到下一执行边界。

`POST /oauth/introspect` uses the configured URL and confidential client, with `token_type_hint=command_authority`, the original proof, catalog `service_id`, original descriptor parameters and delegation SHA. The response must include `active:true`, `token_type:command_authority`, `scope:proxy`, `independent_commands:true`, `authority_version:1` and `permissions:string[]`, and exactly match every public field, original descriptor and source. Permissions do not replace local RBAC; ordinary delegation introspection remains a separate check. Inactive authority, errors, disconnects, timeouts, malformed responses and binding drift deny execution. Results are not cached across execution boundaries.

## 持久绑定与写入 / Durable binding and writes

新增 `command_authorities` 用 `(issuer,jti)` 唯一绑定 token digest、命令 kind/resource ID 和不可变输入摘要；与原 release/delivery/projection 创建同一 SQLite 事务提交。相同命令可以多次核验／幂等读回，跨任务／内容／动作不能复用。幂等重试不会替换原 Actor。`command_derivations` 仅显式记录 release→自动 metadata projection 及 projection→纠错 projection 的后继；不能派生 delivery。显式 sync-links 必须有自己的新 proof。解码 jti 只作持久索引，授权仍由前述验签和在线核验完成。

The new `command_authorities` table binds `(issuer,jti)` uniquely to the token digest, command kind/resource ID and immutable input digest, in the original release/delivery/projection creation transaction. The same command may be revalidated or read idempotently; other tasks, content or actions cannot reuse it. Idempotent retries never replace the original Actor. `command_derivations` records only explicit release-to-metadata and projection-to-correction continuations; it cannot derive a delivery. Explicit sync-links requires its own proof. Decoding jti serves only as a durable index; signature and online validation establish authority.

ReleaseWorker／DeliveryWorker 在任务执行和最终发送前检查当前任务与持久绑定，再执行既有 Policy。Nyx adapter 完成异步连接／批准检查后，再等待 `beforeWrite` 的当前来源与 Publisher 检查，随后执行同步 queue/source/connection guard，才调用 proxy 或 exact redeem。组织分发原 request authority 保留在原密文中；authorize 的新 proof 仅绑定到该 delivery 的独立批准事件，不能换源或复活原 request。原 owner、Publisher、exact connection、内容批准、原文公开核验和 lease/pause 守卫继续成立。

ReleaseWorker and DeliveryWorker match the current task to its durable binding at execution and final dispatch, then apply the existing Policy. After asynchronous connection and approval lookups, the Nyx adapter awaits current source and Publisher validation in `beforeWrite`, runs the synchronous queue/source/connection guards and only then calls proxy or exact redeem. Organization delivery retains its original request authority in its original ciphertext; a new authorize proof binds only an independent approval event for that delivery and cannot replace or revive the request source. Owner, Publisher, exact connection, content approval, public-original verification and lease/pause guards remain mandatory.

只读恢复继续使用当前 caller 的 access 授权，不要求原 key/credential 仍有效；`beforeWrite` 继续报 `RECOVERY_READ_ONLY`。恢复 Actor 不能凭 reconcile proof 自动继承 metadata 新写，须另作有权的显式 sync-links。原确认密文和审计 Trace 保留。旧无来源 key 队列不自动开放或重发。

Read-only recovery continues under the current caller's access authority without requiring the original key or credential to remain valid; `beforeWrite` still raises `RECOVERY_READ_ONLY`. A recovery Actor cannot inherit metadata write authority from a reconciliation proof and must use a separately authorized explicit sync-links command. Original confirmation ciphertext and audit traces remain intact. Legacy key queues without provenance are not automatically reopened or resent.

## 验证与限制 / Verification and limits

新增契约测试覆盖专用签名、subject/issuer/audience/expiry/原 delegation 与 descriptor 绑定、在线权威标志及公共字段精确比较、网络错误、唯一 jti 跨命令拒绝、DB 重开和隔离 snapshot/restore 保留 fence。实际 App parser／认证／业务服务加两个 Worker 的模型测试覆盖有效 child、模拟删 key／缩 scope／child 撤销与轮换、错服务／标志／503／坏 JSON、最终 beforeWrite 及 adapter 内发送前撤权零写；还覆盖原始 JSON 空白／query／header 字节、重复 header、无 proof 拒绝、幂等重试、组织 Publisher／独立 exact approval 不换源，以及显式／自动 metadata 绑定。

New contract tests cover signatures, subject/issuer/audience/expiry, original delegation and descriptor binding, exact online flags and public fields, network errors, cross-command jti rejection, DB restart and isolated snapshot/restore preserving the fence. Modeled tests use the actual App parser, authentication, services and both workers for a valid child, simulated key deletion/scope reduction/child revocation or rotation, wrong service/flags, 503, malformed JSON and zero writes after final-write or adapter-dispatch revocation. They also cover raw JSON whitespace/query/header bytes, duplicate headers, missing-proof denial, idempotent retry, organization Publisher and separate exact approval without source substitution, and explicit/automatic metadata bindings.

最终 `npm run check` 的 strict TypeScript 与247/247测试通过；额外在实际 Nyx adapter 单测中确认异步最后核验拒绝发生在 proxy／exact redeem 之前，相关4项通过，最终 typecheck及 diff check通过。正式矩阵第1节起9750字节未变，SHA256仍为 `894869259cb8977cb01fff97535c6e1fe820f67527d40d13ee8adc54ea8b18cd`，本轮5份入口／候选文档的93个本地链接／anchors有效。

The final `npm run check` passed strict TypeScript and all 247 tests. Additional assertions in the real Nyx adapter unit tests verify that an asynchronous final-authority rejection occurs before proxy or exact redemption; all four related tests passed, followed by final typecheck and diff checks. The formal matrix remains 9,750 bytes from section 1 onward, with SHA256 `894869259cb8977cb01fff97535c6e1fe820f67527d40d13ee8adc54ea8b18cd`; 93 local links/anchors across the five entry/candidate documents are valid.

所有本轮测试仅使用临时本地签名 issuer、临时 SQLite 与安全 adapter；模拟 sourceActive 不代表真实 NyxID key/child 撤权已验收。真实 backend 固定 SHA 的 JWKS/header/在线 contract、原审批、child 轮换及四 Ghost 联合验证由 root 在隔离环境继续执行。未访问现存 NyxID 服务或 restored-r1/dev Ghost 栈，无真实外部 provider 写入。测试输出、red 比较与失败尝试在 `.runtime/r031-consumer/` 保留；测试数量与最终检查结果见固定提交交接。

All tests in this round use a temporary local signing issuer, temporary SQLite and safe adapters. Simulated source activity does not establish actual NyxID key/child revocation acceptance. Root will validate actual JWKS/header/online behavior, original approval, child rotation and four-Ghost integration against a fixed backend SHA in isolation. This work does not access existing NyxID services or restored-r1/dev Ghost stacks and performs no real external provider writes. Test output, red comparisons and failed attempts remain in `.runtime/r031-consumer/`; exact counts and final checks accompany the fixed-commit handoff.

首次消费者 fixture 将仅适用于 Delivery adapter 的 dispatch-revocation 场景误用于 Release adapter，导致一次预期值失败；已将该场景限定为 Delivery，Release 的最终 beforeWrite 撤权场景保持。系统 Python 的 archive API 不支持 `filter` 参数使 red harness 初次退出，改为检查本仓库 Git archive 的路径后解包。均保留原输出，不计为业务缺陷或通过证据。

The first consumer fixture mistakenly applied the Delivery-only adapter dispatch-revocation case to the Release adapter, producing an expectation failure. It now scopes that case to Delivery while retaining Release final-beforeWrite revocation coverage. The system Python archive API also rejected the red harness's initial `filter` argument; the harness now checks this repository's Git archive paths before extraction. Original output is retained; these attempts are not counted as business defects or passing evidence.

## 部署与回滚 / Deployment and rollback

必须先暂停外发并停止所有旧 Worker，备份 SQLite／配置后，将 API 和所有 Worker 一起升级；注册 confidential resource client 并对齐 catalog service ID、issuer/JWKS、专用 introspection 和原样 header/body 转发。两张新增表随 SQLite 全量快照备份；隔离恢复保持 outbound pause，先只读认回。proof/delegation 当前上游最多300秒，过期必须拒绝，不自动换新凭据、续期或重新执行。真实联调前不得解除隔离或凭本地 fixture 提升签收。

Pause outbound and stop all old workers, back up SQLite/configuration, then upgrade the API and every worker together. Register a confidential resource client and align catalog ID, issuer/JWKS, specialized introspection and unmodified header/body forwarding. Both new tables travel with full SQLite snapshots. Isolated restore remains paused and begins with read-only reconciliation. Upstream proof/delegation lifetime is currently at most 300 seconds: expiry must deny execution without credential replacement, renewal or automatic replay. Modeled fixtures do not authorize leaving isolation or promoting acceptance.

回滚可保留新增表，但必须继续 outbound pause、停止写 Worker；不能回到保护前无 lineage 仍写出的版本。正式生产部署、真实外部分发账号／内容动作授权、运维责任与 RPO/RTO 等门禁继续保留，整体为 `NOT_ACCEPTED`。

Rollback may retain the additive tables but must keep outbound paused and write workers stopped; it must not restore the pre-protection behavior that wrote without lineage. Production deployment, real external-provider accounts/content-action authorization, operations ownership and RPO/RTO gates remain open. Overall status remains `NOT_ACCEPTED`.
