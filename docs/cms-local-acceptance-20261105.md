# 006 本机升级与验收 / Local 006 upgrade and acceptance

2026-11-05（Asia/Shanghai）。应用源码固定为合并候选 `ec3f0ef8c504923c08aa408f8f1a696564620bc5`，包含 004 与 005。此次不修改 `src/` 或 Studio 产品源码；追加改动仅涉及隔离预览 harness、浏览器测试和本交接证据。实际账号、CA、运行地址、数据库备份及运行脚本留在本机私有运维目录。

Application source is pinned to merged candidate `ec3f0ef8c504923c08aa408f8f1a696564620bc5`, containing both 004 and 005. This delivery changes only the isolated preview harness, browser tests and handoff evidence, with no production application changes. Accounts, CA material, runtime addresses, backups and operational scripts remain private to the local operator.

## 本轮结果 / Results

| 验证 / Check | 结果 / Result | 边界 / Boundary |
| --- | --- | --- |
| TypeScript / Studio / standard tests | PASS, 455/455 | 固定合并源码独立导出 / Isolated export of the merged source |
| Local publishing flow | PASS, 4/4 | 真实 CMS/Worker/Adapter，Nyx/Ghost/DEV 为本地模拟 / Real application modules, simulated providers |
| Actual CMS API browser flows | PASS, 7/7 | 隔离身份及 SQLite，修正旧保存文案断言后 / Isolated identity/database, after saved-label assertion fixes |
| Preview sign-in | PASS | 普通登录进入四类测试身份选择页，不请求虚构远端 issuer / Local identity picker, no fake remote OIDC call |
| Real NyxID read-only acceptance | PASS, 65 checks across four accounts | fresh PKCE login, identity/roles, isolation, Markdown, preview, existing release and logout |
| Data preservation | PASS | 8 business tables unchanged, integrity ok, FK errors 0 |
| Existing Ghost sites | 6 healthy | 只读核验；没有新增发布 / Read-only; no publication |

日志、源文件/构建 hash、合同差异及脱敏摘要见 [evidence manifest](evidence/cms-local-acceptance-20261105/manifest.json) 和 [summary](evidence/cms-local-acceptance-20261105/summary.json)。455项标准测试和4项模拟发布检查绑定原合并源码；7项浏览器验收绑定该应用源码加本次 harness 修复，不把不同层级合计为真实平台验收。

Logs, source/build hashes, contract differences and the sanitized summary are linked above. The standard and simulated publishing checks bind the original merge; the seven browser flows use the same application source with this harness patch. Counts across these layers are not added into a live-provider acceptance claim.

## 登录故障与预览入口 / Login incident and preview entry

旧 API 进程的新登录可稳定复现 callback `REMOTE_UNCERTAIN`，Nyx 认证及 authorize 成功，但 CMS 换票在约7毫秒内失败。受信任 TLS、Discovery/JWKS 读回及配置检查正常。保留配置与 SQLite 一致性备份后，重启为固定006应用进程，新鲜登录恢复。历史日志没有底层 cause，不能断言由证书、缓存或某种网络原因导致。仅在本机启动器增加脱敏诊断：记录允许的端点路径、错误名称和 cause code，不记录 URL query、body、Cookie、Token 或客户端密钥；不改变 fetch、TLS、issuer、PKCE 或权限行为。

Fresh logins on the old API process reproduced `REMOTE_UNCERTAIN` during the callback after successful Nyx authentication/authorization, failing in roughly seven milliseconds. Trusted TLS, Discovery/JWKS and configuration checks passed. After preserving configuration and a consistent SQLite backup, restarting on the pinned 006 application restored fresh logins. Historical logs lack the underlying cause; no specific certificate, cache or network root cause is claimed. A local launcher diagnostic records only allowlisted endpoint paths, error names and cause codes, without changing request or authentication behavior.

第一轮四账号检查在 Admin 的在线 introspection 遇到一次 `TimeoutError`（35项通过后停止）；失败记录保留。随后使用全新会话补验65项全部通过，最长请求约2.4秒。旧传输故障恢复与此次上游超时分别记录；没有延长超时、缓存权限或跳过在线校验。

The first four-account run stopped after 35 checks because Admin introspection timed out. That failure is retained. A fresh-session rerun passed all 65 checks, with the slowest request around 2.4 seconds. The old transport incident and later upstream timeout remain separate observations; timeouts and online permission checks were not relaxed.

4174为隔离预览，真实联调使用已交接的 HTTPS `/studio`。预览的普通登录按钮原来会请求 `identity.example` 并返回502；现在仅在 `--serve` harness 内跳到 `/__acceptance`，明确选择 Solo、Member、Admin 或 Publisher。底部提示和 `/__acceptance/environment` 显示版本；重启会重置样例。身份选择页使用同源 CSS，沿用现有 CSP。生产 `src/main.ts` 不导入此 harness，没有新增测试登录后门。

The loopback preview is separate from the real HTTPS `/studio` environment. Its ordinary sign-in button previously requested `identity.example` and returned 502. Only the `--serve` harness now redirects to `/__acceptance`, offering explicit fixture identities. The notice and environment endpoint show the revision, and restarting resets fixture data. The identity picker loads same-origin CSS under the existing CSP. Production `src/main.ts` never imports this harness.

四处浏览器断言仍等待旧 `Saved` 文案，合并后实际为 `Draft saved`，导致初轮7项中2项超时。已改为精确可见文本等待；前后日志分别保留。保存、提交及发布的业务逻辑未改。

Four browser waits still expected the old `Saved` label, causing two of seven initial flows to time out after the UI changed to `Draft saved`. Exact visible-text waits now pass; both logs are retained. Save, submit and publishing business logic is unchanged.

## 数据、安全与回退 / Data, safety and rollback

真实库的6篇文章、9个修订、4次投稿、1条已发布 release、2个 job、0条 delivery、6个站点及1条Publisher授权记录在升级前后逐表摘要一致。已有发布正文、版本及公开页保留；projection继续 queued。真实验收只读内容，登录/注销会产生会话与审计。外发保持 paused，未启动常驻或单次真实发布 Worker。

Business-table hashes remain unchanged across the upgrade: six articles, nine revisions, four submissions, one published release, two jobs, zero deliveries, six sites and one Publisher grant. The existing original and queued projection remain intact. Real content checks are read-only; login/logout legitimately affect sessions and audit. Outbound writes stay paused, and no real publishing worker was started.

回退保留旧代码、配置和一致性备份，优先切回兼容代码/配置。不能用旧数据库覆盖已发布事实；不恢复过期授权，不执行 queued projection。旧数据库 schema 与006均为 migration 1–4，没有本轮业务迁移。

Rollback retains previous code/configuration and a consistent backup, preferring a compatible application/configuration rollback. Never overwrite completed publication facts with an older database, reuse expired approval, or run the retained projection. Both versions use migrations 1–4; this upgrade introduces no business migration.

## 需要配合的剩余项 / Remaining coordination

1. **Nyx service**：当前合同49项，旧注册证据35项；新增14项、无移除。旧35项的响应合同均有差异，其中 `confirmDistribution`、`reportAssistedSubmission` 请求也变化，不能只追加14项。见 [合同差异](evidence/cms-local-acceptance-20261105/service-contract-diff.json) 与 [待替换 origin 的模板](evidence/cms-local-acceptance-20261105/openapi-006-registration-template.json)。需 Nyx 主机核对实际服务目标/版本、注册及签名委托 trust，再读回并补验。此 LAN 实例的 service audience/scopes/client 白名单仍刻意关闭，不应直接把 catalog 指向它。保留原 issuer/client，不能扩大成所有服务授权。
2. **媒体/主题**：六站健康，但当前平台 public-media 目录为空，API运行配置未准备私有 staging，Ghost仅挂载自己的 content volume。需要补每站路径、权限和实际共享拓扑，再做隔离媒体验收；文字首发不代表图片链路完成。正式主题维护邮箱及资源策略仍待。
3. **指标**：真实实例仍关闭采集、未授予 metrics capability；本轮只保留隔离指标回归，没有未经批准开启跟踪。
4. **发布及运维**：Publisher更新、个人/中文实际发布、真实DEV/Hashnode、人工渠道恢复、公开博客域名及具名运维交接仍单列。所有真实内容写入等待对应确认。D1–D9整体仍未签收。

1. **Nyx service:** compare all 49 operations with the prior 35, including response-contract changes and the two changed request bodies. The linked import template intentionally has an invalid placeholder origin. The Nyx operator must confirm the destination version, registration and signed delegation trust, then verify readback and execution. This LAN instance still disables service access; do not simply redirect the catalog to it or broaden grants.
2. **Media/theme:** all six sites are healthy, but the platform public-media root is empty, private staging is not configured for the API runtime, and Ghost only mounts its own content volumes. Prepare and verify exact site-specific shared paths before media acceptance. Text-only publication is not image-path acceptance. Release theme metadata/resources remain outstanding.
3. **Metrics:** collection and its capability remain disabled on the real instance. Isolated metrics regressions do not establish live collection, and this run did not enable tracking.
4. **Publication/operations:** Publisher updates, personal/Chinese publication, real external providers, assisted channels, public blog reachability and named operational handoff remain separate. Actual writes require the corresponding confirmation; overall D1–D9 acceptance remains incomplete.
