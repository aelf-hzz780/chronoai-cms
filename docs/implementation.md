# 实施设计与迭代

# Implementation Design and Iteration

2026-10-28；正式范围继续以 v0.7 两份原文为准。本文件记录工程选择，不改变产品权限。

2026-10-28; the formal scope continues to follow the two v0.7 source documents. This file records engineering choices and does not change product permissions.

## 技术选择

## Technical Choices

- Node.js 24.18.x + TypeScript strict，Fastify 负责 HTTP、输入边界与统一 Trace ID。采用模块化单体与独立 Worker，共享应用用例，避免双入口复制业务判断。
- Node.js 24.18.x + TypeScript strict; Fastify handles HTTP, input boundaries, and a unified Trace ID. Use a modular monolith with an independent Worker and shared application use cases to avoid duplicating business decisions across the two entry points.
- SQLite（Node 内置 `node:sqlite`）保存平台数据，使用 WAL、外键、事务、唯一约束和迁移版本。首个部署为单主机持久卷，API 与 Worker 同盘；不支持跨主机共享数据库或无限并发。相较 PostgreSQL，可减少本地和初期运维依赖；扩容前须压测并迁移数据库 Adapter。Ghost 继续各自使用官方支持的 MySQL。Node SQLite 当前实验性警告计入运维限制。
- SQLite (Node's built-in `node:sqlite`) stores platform data with WAL, foreign keys, transactions, unique constraints, and migration versions. The first deployment uses a single-host persistent volume, with the API and Worker on the same disk; cross-host shared databases and unlimited concurrency are unsupported. Compared with PostgreSQL, this reduces local and early operational dependencies; before scaling, load-test and migrate the database Adapter. Ghost continues to use its officially supported MySQL per site. Node SQLite's current experimental warning is an operational limitation.
- 浏览器 CMS 使用原生表单与独立 JavaScript 模块，Markdown textarea 提供导入、导出与鉴权预览；不把编辑器状态当作源文。`markdown-it` 渲染并经 `sanitize-html` 净化，禁止原始 HTML、危险协议和远端图片抓取。
- The browser CMS uses native forms and independent JavaScript modules. A Markdown textarea provides import, export, and authorized preview; editor state is not treated as source content. `markdown-it` renders content and `sanitize-html` sanitizes it; raw HTML, dangerous protocols, and remote image fetching are forbidden.
- `jose` 验证 OIDC／服务 JWT；生产没有本地登录或测试身份头。当前成员、委托、连接和精确批准经 NyxID Authority Adapter 查询；使用固定官方 native 契约；目标实例 Live 尚未验证，保持 blocked。
- `jose` verifies OIDC/service JWTs; production has no local login or test identity header. Current memberships, delegations, connections, and exact approvals are queried through the NyxID Authority Adapter. The fixed official native contract is used; target-instance Live validation has not yet occurred and remains blocked.
- Node test runner 进行业务与 HTTP 参数化测试；TypeScript 检查协议边界；正式外部 Adapter 用可控 HTTP 服务器验证契约与不确定结果。Mock 证据仅为 local。
- The Node test runner performs parameterized business and HTTP tests; TypeScript checks protocol boundaries; formal external Adapters use controllable HTTP servers to verify contracts and uncertain results. Mock evidence is local only.

## 边界与模式

## Boundaries and Patterns

控制层只处理协议、输入校验、会话／scope；应用服务编排用例；Policy 集中授权；Store 封装事务与查询；外部 Adapter 隔离供应商差异。显式状态机和事务 outbox 处理确认版本、每目标状态与进程中断。远端已发送而结果不明时转 uncertain，禁止盲目重发。

The control layer handles only protocols, input validation, and sessions/scope; application services orchestrate use cases; Policy centralizes authorization; Store encapsulates transactions and queries; and external Adapters isolate vendor differences. An explicit state machine and transactional outbox handle confirmed versions, per-target state, and process interruption. When a remote request was sent but its result is unknown, transition to `uncertain` and prohibit blind retries.

owner、credited author、actor 分开保存。组织 Admin 不自动获得未提交他人草稿读取／改写能力；提交与确认固定 revision，后续编辑不改变快照。实时身份与权限查询失败时拒绝受保护操作，错误保留 Trace ID，不回显授权材料。

Store owner, credited author, and actor separately. An organization Admin does not automatically gain the ability to read or rewrite another person's unsubmitted draft. Submission and confirmation fix a revision, and later editing does not change the snapshot. If a real-time identity or permission query fails, reject the protected operation, retain the Trace ID in the error, and do not echo authorization material.

## 交付顺序

## Delivery Order

1. 权限／源文／修订／投稿／双入口 API 与 CMS，先反例测试再实现。
2. OIDC／服务验证、四个原版 Ghost 站点、确认版本与图片、译文独立发布。
3. NyxID 精确连接与批准、DEV／Hashnode 自动 Adapter、辅助投稿、生命周期与恢复对账。
4. 指标采集和查询、隐私、隔离备份恢复、运维与独立验收修复。

1. Authorization, source content, revisions, submissions, the two-entry API, and CMS; write counterexample tests before implementation.
2. OIDC/service verification, four unmodified Ghost sites, confirmed versions and images, and independent translation publication.
3. Exact NyxID connections and approvals, automatic DEV/Hashnode Adapters, assisted submissions, lifecycle handling, and recovery reconciliation.
4. Metrics collection and queries, privacy, isolated backup recovery, operations, and independent acceptance fixes.

不新增可选产品范围。每次增量更新交付台账，真实提交交原任务独立复验；开发 verified 不等于验收通过。

Do not add optional product scope. Update the delivery ledger for each increment and submit real changes for independent revalidation by the originating task; development `verified` does not mean acceptance passed.

## 回滚与外部依赖

## Rollback and External Dependencies

保留现有实验、数据卷及官方 Ghost 镜像；开发采用独立端口／project／凭证。应用回滚先暂停准入与出站，保留审计／远端映射，对 uncertain 记录只读对账，外部副本通过生命周期动作处理。数据库迁移与 Ghost 升级必须先备份并在隔离环境演练。

Retain existing experiments, data volumes, and official Ghost images; development uses independent ports, projects, and credentials. During application rollback, first pause admission and outbound work, retain audit records and remote mappings, perform read-only reconciliation for `uncertain` records, and handle external copies through lifecycle actions. Back up database migrations and Ghost upgrades first and rehearse them in an isolated environment.

Live 仍需：真实 NyxID issuer、应用／服务注册和调用人契约、测试角色及组织、精确连接与批准；DEV 个人／组织账号、Hashnode 组织 Pro；具体测试内容与外部发文授权；Medium／HackerNoon 人工负责人；HTTPS 域名、付款责任及生产 RPO／RTO。缺失项不以文档或 Mock 宣称完成。

Live still requires: a real NyxID issuer, application/service registration and caller contract, test roles and organizations, exact connections and approvals; DEV personal/organization accounts and Hashnode organization Pro; specific test content and external-publication authorization; Medium/HackerNoon manual owners; and an HTTPS domain, payment responsibility, and production RPO/RTO. Missing inputs must not be declared complete through documentation or Mock evidence.

## I2 实现决策

## I2 Implementation Decisions

NyxID bridge 已替换为官方 native introspection/orgs/user-services/catalog/exact request/redeem；payload token_type与双签名委托按固定官方源码契约校验。Adapter模式隔离NyxID与Ghost；Target Strategy隔离DEV/Hashnode/辅助流程，feature flag停用新写但保留已知copy人工跟进。组织redeem已经执行effect，不再proxy重复写。Live注册与真实账号仍缺失。

The NyxID bridge was replaced with the official native introspection/orgs/user-services/catalog/exact request/redeem flow. Payload `token_type` and dual-signed delegation are validated against the fixed official source contract. The Adapter pattern isolates NyxID and Ghost; Target Strategy isolates DEV, Hashnode, and assisted flows; a feature flag disables new writes while retaining manual follow-up for known copies. Organization redeem already applies its effect and is not proxied into a duplicate write. Live registration and real accounts remain missing.

事务outbox + lease token/generation fencing 使迟到Worker不能结算新holder或覆盖新版；已知write后read失败保持verifying/uncertain，恢复只读。DOM完整正文证明独立于marker，只有官方Ghost精确ref参数转换被允许。公开图片在正文证明后落共享卷，MIME/hash再次核验。author、owner可见归属与title同时核验。

Transactional outbox plus lease-token/generation fencing prevents a late Worker from settling a new holder or overwriting a newer version. A failed read after a known write remains `verifying`/`uncertain` and recovery is read-only. Proof from the complete DOM body is independent of the marker; only the official Ghost exact-ref parameter conversion is allowed. Public images are materialized on the shared volume after body proof, with MIME/hash checked again. Author, owner-visible attribution, and title are verified together.

译文采用投影：发布时冻结release_links，Worker只修改metadata codeinjection，正文保持不变；已下线/私有译文不参与导航。取舍是投影最终一致性，link-status/sync-links暴露失败与重试，不暗示瞬时跨站事务。

Translations use projection: freeze `release_links` at publication, let the Worker modify only metadata code injection, and keep the body unchanged. Unpublished/private translations do not participate in navigation. The tradeoff is eventual consistency in projection; `link-status`/`sync-links` expose failure and retry rather than implying an instantaneous cross-site transaction.

指标使用第一方显式consent collector；daily HMAC估算UV，既不保存rawIP，也不承诺跨日/平台去重。外部counter为授权API累计快照，缺值null；不会把采集时间过滤冒充流量时间窗。collector失败不阻断发布。proxy信任范围由配置明确限定。

Metrics use a first-party explicit-consent collector and a daily HMAC estimated UV. It neither stores raw IP addresses nor promises deduplication across days or platforms. An external counter is an authorized API cumulative snapshot; missing values are null. Collection time filtering is not presented as a traffic time window. Collector failure does not block publishing. The proxy trust scope is explicitly bounded by configuration.

恢复使用SQLite在线snapshot + Ghost各自MySQL dump/content，加密manifest包，新project恢复；期间需业务维护窗口，避免跨库不一致。采用独立backup key、GCM认证与源码指纹；恢复默认暂停出站与清session。单主机与跨库一致性边界详见operations.md。

Recovery uses an online SQLite snapshot plus each Ghost's MySQL dump/content, an encrypted manifest package, and restoration into a new project. A business maintenance window is required to avoid cross-database inconsistency. Use an independent backup key, GCM authentication, and source fingerprints; recovery defaults to pausing outbound work and clearing sessions. The single-host and cross-database consistency boundaries are detailed in `operations.md`.

CMS使用原生select选择有权文章/版本/连接/副本，保留服务器强制授权；未保存编辑阻止原文确认。指标卡片和表格标注source、更新时间及Unavailable。合成浏览器已实测保存/预览/查询，不能替代NyxID Live或完整交互验收。

The CMS uses native selects to choose authorized articles, revisions, connections, and copies while retaining server-enforced authorization. Unsaved edits block original-content confirmation. Metrics cards and tables label the source, update time, and Unavailable state. The synthetic browser has tested save/preview/query flows, but it cannot replace NyxID Live or complete interactive acceptance.
