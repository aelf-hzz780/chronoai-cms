# 新版 Studio 与 DEV 本机联调 / Local Studio and DEV integration

2026-11-04，v0.7 有界交付。新版 Studio、真实 NyxID 登录与权限、CMS 原文发布和 DEV 本地确认链路已运行；DEV 公开写入仍等待本次具体授权，D1–D9 保持 **NOT_ACCEPTED**。

Bounded delivery against v0.7 on 2026-11-04. Studio, real local NyxID authentication and permissions, original publication, and the CMS DEV confirmation path run locally. Public DEV writes await specific authorization; D1–D9 remain **NOT_ACCEPTED**.

## 版本与入口 / Versions and entry points

业务 commit 为 `ea8bb6592a9c100f5b95a1d391b308dedb1c9af2`，基于重新 fetch 核验的 UI `ed77c70aca6bfc169b53956b0229fa2e7d171ced`，集成已审查的 Nyx GraphQL 根路径修复 `2284973`。交付分支为 `codex/005-cms-dev-live-integration`，远程为 `git@github.com:aelf-hzz780/chronoai-cms.git`。本报告之后的证据文档提交不改变已验证的业务文件。

The business commit is `ea8bb6592a9c100f5b95a1d391b308dedb1c9af2`, based on freshly fetched UI revision `ed77c70aca6bfc169b53956b0229fa2e7d171ced`, with reviewed Nyx GraphQL root-route fix `2284973`. The delivery branch is `codex/005-cms-dev-live-integration` on `git@github.com:aelf-hzz780/chronoai-cms.git`. Subsequent evidence-only commits do not change the verified business files.

| 入口 / Entry | 地址与边界 / Address and boundary |
| --- | --- |
| 新版 Studio / New Studio | <http://localhost:3458/studio>；真实 OAuth，无测试登录后门 / Real OAuth, no test-login bypass |
| 新版 API / New API | <http://localhost:3458/openapi.json>；独立 SQLite，容器 `blogsystem-cms-dev-live-20261104` |
| 本次原文 / Test original | <http://localhost:3468/chrono-5c71a85d-1e45-40ae-85c5-4ecd2dd14824/>；仅本机可达 / Localhost only |
| 原实例 / Preserved instance | <http://localhost:3457>；仍为 `c16cde700963959d3fd7fc226853b71f5551573a` |
| NyxID | 门户 / Portal <http://localhost:3000>，issuer/API <http://localhost:3001> |

NyxID 后端 `049ee1c`、门户 `c65dc4be` 仍为已披露本地补丁。新 OAuth client 仅登记 `http://localhost:3458/auth/callback`，scope 为 `openid profile proxy`；身份、发布 capability、实时 owner/角色和 Nyx 连接授权分别校验。已有 service catalog 仍指向 3457，本次不宣称新版 Nyx service 入口已重跑。两个 localhost 端口的 cookie 域相同，浏览器复验使用独立 context。

NyxID backend `049ee1c` and portal `c65dc4be` remain disclosed local patches. The separate OAuth client registers only `http://localhost:3458/auth/callback` with `openid profile proxy`; identity, publishing capabilities, current ownership/roles, and connection authorization remain separate checks. The existing service catalog still targets 3457; this run does not claim renewed service-entry validation on 3458. Browser checks use separate contexts because localhost cookies are shared across ports.

## 本轮结果 / Results

| 层级 / Level | 结果 / Result | 证据 / Evidence |
| --- | --- | --- |
| 自动化 / Automated | TypeScript、431 tests 全过，0 skipped；含 fixture，不能代替真实平台 / All passed; fixtures are not live acceptance | [verification](evidence/cms-dev-live-20261104/verification.json), [log](evidence/cms-dev-live-20261104/npm-check.txt) |
| 独立代码审查 / Independent review | 27 项针对测试及隔离 CLI 执行探针通过，无可执行发现 / 27 targeted tests and isolated CLI probe passed, no actionable findings | [verification](evidence/cms-dev-live-20261104/verification.json) |
| 真实本地 NyxID / Real local NyxID | 初次33项；固定 commit 后29项，4类账号；Member组织发布、自提权、跨个人读取被拒绝；注销重放401 / Initial 33 and fixed-commit 29 assertions, four roles, denials and logout replay checked | [auth summary](evidence/cms-dev-live-20261104/auth-summary.json) |
| 真实本地 Ghost / Real local Ghost | CMS 确认→真实 ReleaseWorker→Ghost 201→公开页/正文渲染核验；仅新增1篇，既有文章不变；projection complete / One new original, verified rendering, existing posts unchanged, projection complete | [receipt](evidence/cms-dev-live-20261104/original-receipt.json), [browser](evidence/cms-dev-live-20261104/original-browser.json) |
| 真实 DEV 读取 / Real DEV reads | Nyx 精确 connection→`@aelfhzz780` 账号4223973；既有草稿4969744仍未公开 / Exact connection and existing unpublished draft verified | [DEV read](evidence/cms-dev-live-20261104/dev-read.json) |
| CMS DEV 准备 / CMS DEV preparation | 真实 Studio 选择连接、全文和权利确认→唯一 queued delivery；无外部写入 / Real UI confirmation, one queued delivery, zero external writes | [readiness](evidence/cms-dev-live-20261104/dev-readiness.json), [preflight](evidence/cms-dev-live-20261104/dev-preflight.json) |

真实 OAuth 验证使用官方登录、授权和 callback HTTP 流程，再以同一会话访问 Chromium Studio；未把 fixture 身份或门户密码表单点击当作本次证据。最终复验复用 consent，未改变已排队任务的授权来源。

The real OAuth checks use the official login, authorization, and callback HTTP flow, then load Studio in Chromium with that session. They are neither fixture identities nor evidence of clicking through the portal password form. Final checks reuse consent without changing the queued task's authorization lineage.

固定 `ea8bb65` 后另做[原文只读复验](evidence/cms-dev-live-20261104/original-fixed-readback.json)：真实 Ghost 验证通过，网络记录全部为 GET，未重复发布。

An additional original readback on fixed `ea8bb65` passed the real Ghost verifier using only GET requests, without repeating publication.

## 单任务执行与当前暂停 / Single-task execution and pause

新增 `Queue.claim(..., resourceId)` 同时限定排队领取和过期 lease 回收；`DeliveryWorker.once(id)` 保留原文、实时权限、连接 fingerprint 和最终发送检查。默认 CLI 只读 SQLite，不迁移、不解密身份、不联网；`--execute` 才执行指定 delivery 一次，不自动 resume 或重排队。命令与退出语义见[运维指南](operations.md#单次指定外部分发)。这使用既有队列/适配器边界，无需新增调度器或独立业务分支。

The optional resource ID scopes both queue selection and expired-lease recovery. `DeliveryWorker.once(id)` retains original, current-authority, connection-fingerprint, and final-dispatch guards. The CLI defaults to read-only SQLite inspection without migrations, credential decryption, or network calls. Explicit `--execute` runs one selected delivery without resuming or requeuing it. See the operations guide for commands and exit semantics. Existing queue and adapter boundaries are reused without a new scheduler.

当前新库 `outbound_paused=true`，没有常驻 Worker；本地 release/projection 已完成。DEV delivery `f582b12e-406f-43d2-ab0e-9c997048457a` 为 `queued`，无 remote ID、无 lease、未发送。当前入口用于受控验证，后台任务需运维按明确范围执行。旧 3457 的 Worker 与暂停设置保持原状，Heartbeat 仍暂停。

The new database is paused with no background worker; local release and projection work is complete. DEV delivery `f582b12e-406f-43d2-ab0e-9c997048457a` is queued, has no remote ID or lease, and has not been sent. This is a controlled validation runtime whose jobs require explicitly scoped operator execution. The old 3457 worker and pause settings are unchanged; the heartbeat remains paused.

## 数据保护与回滚 / Preservation and rollback

旧库使用 SQLite 在线一致备份；仅独立新 volume 中的副本执行 v1→v4 迁移，36张原表所有既存行保留，integrity 与 foreign keys 通过。既有四 Ghost、baseline 两 Ghost、Nyx 与3457均健康。新容器 Ghost 素材卷只读；本次原文无图片，未把图片物化宣称为本轮真实通过。

An online SQLite backup precedes v1→v4 migration of only the independent volume. All existing rows in the original 36 tables survive, with integrity and foreign-key checks passing. Four current Ghost sites, two baseline sites, Nyx, and 3457 remain healthy. Ghost media volumes are read-only in the new container; the test original has no images, so live media materialization is not claimed.

回滚可停止本次新容器，继续使用未切换的3457；保留独立新库及新文章，不用旧备份覆盖新写入。需撤下本次 Ghost 原文时，通过 CMS 对确切 release 执行 unpublish。DEV 发送前可取消 queued 任务；发送后 DEV adapter 没有启用删除路由，不能承诺自动回滚，须经作者账号另行授权操作。projection 完成后的末尾检查曾与父任务新增 DEV 队列竞争而报错，保留原失败记录，并以[只读补证](evidence/cms-dev-live-20261104/projection-concurrency-readback.json)确认实际 projection complete 且 DEV 未领取；未重跑写入。

Rollback can stop the new container and continue using unchanged 3457. Preserve the new database and article rather than overwrite new writes with the old backup. Unpublish the exact Ghost release through CMS if requested. Before DEV dispatch, cancel the queued task; after dispatch, removal requires separately authorized author-account action because the adapter has no enabled deletion route. A final projection assertion raced with the parent's new DEV queue insertion; the failure was preserved and read-only evidence confirmed projection completion and an unclaimed DEV job, without repeating writes.

## 外部授权与剩余项 / External authorization and remaining work

已准备账号、完整[待发布正文](evidence/cms-dev-live-20261104/proposed-dev-body.md)、精确[请求方案](evidence/cms-dev-live-20261104/dev-proposal.json)和本地原文链接。拟议动作仅公开新建1篇并只读核验，不更新既有草稿4969744，不自动更新/删除。当前 canonical 为 localhost，不能证明公网原文可达；若明确授权此公开技术测试，结果也不能替代正式 A30 或 D6 签收。正式路径仍需可公网访问的 Ghost 原文和适用真实组织流程。

The account, complete proposed body, exact request proposal, and local original are prepared. The proposed scope is one new public article plus readback, without updating draft 4969744 or automatically updating/deleting articles. A localhost canonical does not prove Internet reachability; even an explicitly authorized public technical test would not complete formal A30 or D6 acceptance. Formal delivery still needs a publicly reachable original and applicable organization workflows.

个人 Nyx proxy 的逐请求审批与组织 exact-service receipt 不同。CMS 当前远程总超时为12秒，人工等待可能导致 uncertain；必须只读对账后再决定后续动作，不盲目重发。本轮未改审批策略或全局 timeout。Hashnode Pro、其他外部平台、生产责任、RPO/RTO 与未覆盖 v0.7 场景继续保持各自未完成状态。

Personal Nyx per-request proxy approval differs from an organization exact-service receipt. The current total remote timeout is 12 seconds; human approval delays can produce an uncertain result requiring read-only reconciliation before any further action. This run changes neither approval policy nor the global timeout. Hashnode Pro, other external platforms, production ownership, RPO/RTO, and uncovered v0.7 scenarios remain outstanding.

执行脚本的独立审查还确认：当前个人 legacy proxy 在批准前不返回可与本次 HTTP 请求绑定的 approval ID，列表/status 也不含正文摘要；同账号、slug、method、path 和时间窗不足以排除该账号并发请求。因此本轮不启用基于轮询猜测的自动批准。用户的公开内容授权与 Nyx 实际请求批准仍是两个步骤；在取得可靠请求关联或由账号持有人处理 Nyx 请求前，不运行该外部写入。现有组织 exact-service 路径不能直接冒称已覆盖个人流程。

Independent execution-script review also confirmed that the personal legacy proxy exposes no pre-decision approval ID correlated to the current HTTP request, and its list/status responses contain no body digest. Matching the account, slug, method, path, and time window cannot exclude a concurrent request by the same account. Polling-based automatic approval is therefore disabled for this run. Public-content authorization and the actual Nyx request decision remain separate steps; external execution waits for reliable correlation or account-holder handling. The existing organization exact-service path does not establish personal-path coverage.
