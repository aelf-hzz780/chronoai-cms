# CMS B acceptance matrix / 验收矩阵

本矩阵按已接受的 14 页面、WP00–08 和 C01–C10 验收。实现存在、固定版本测试、本机真实服务联调和远端正式签收分别记录。NyxID 在另一台主机，用户已明确把真实 NyxID 联调后置。没有新的生产部署、外部文章发布或角色修改授权。

This matrix covers the accepted fourteen-page scope, WP00–08 and C01–C10. Implementation, fixed-version tests, actual local-service integration and remote sign-off are distinct. The user deferred live NyxID integration on the other host. No production deployment or real external-platform publication is implied.

| Page / 页面 | Required behavior / 必须行为 | Current evidence / 当前证据 |
| --- | --- | --- |
| Login 登录 | Existing OIDC; bound one-use state; safe Studio return; logout invalidates session; no token in browser storage | Auth return tests and actual session/CSRF local browser; real Nyx deferred |
| Onboarding 引导 | Current authorized workspace inventory; explicit directory outage; each language's actual site blocker | C01/C04 tests; Studio M1 |
| Content 内容库 | Authorized server pagination/counts; draft/submission/live independent; no private UUID/title leak | C02 tests; actual API browser; EN/ZH and mobile screenshots |
| Editor 编辑器 | Distinct articles and immutable revisions; save/submit/conflict; exact Markdown bytes; scoped images; explicit translation peers | Actual API browser, BOM/CRLF download, private media denial, stale translation tests |
| Publish 发布确认 | Exact owner/site/language/revision/byline/action/rights; stable retry intent; 202 only queues | b8d1daf actual API browser and UI failure/race fixtures PASS |
| Distribution 分发详情 | Frozen payload and copy identity; current exact connection/approval; manual workflow; persistent plans/notes; historical-copy observation | C07–09 backend fixed gate PASS; final Studio workflow in progress |
| Tasks 全局任务 | Authorized paginated aggregate; exact snapshot/asset access; bounded polling; unknown result never resends a write | C03/WP03 fixed gate and actual API frozen-readback/cancel/mobile PASS; plan persistence, due state and private-read extension PASS |
| Analytics 数据 | Availability/source/capture-time/coverage; UTC daily estimates; external lifetime snapshots; authorized refresh | 1745f44 actual API browser: unavailable counters remain null/Unavailable; filters, UTC/capture semantics and precise refresh fixture regressions PASS |
| Connections 连接 | Subject/owner/target-bound attempt; trusted callback requery; binding_required; no implicit personal fallback | C06 fixture and actual session tests PASS at d761db7; UI pending, live provider deferred |
| Settings 设置 | Actual per-language site configuration, read-only unsupported settings | C04/Studio M1; no false save form |
| Members 成员 | Current org directory; Admin+roles:write; eligible live target for grant; revoke possible during directory outage | C05 + real API browser grant/revoke/directory-outage/current-Admin revocation PASS |
| Guide 帮助 | Current permissions and meaningful recovery links; automatic/manual and approval/publication distinguished | WP06 permission-aware bilingual guide, real settings/sites, local browser and fixture navigation PASS |
| Public home 公开首页 | Ghost-native feed, locale, navigation, pagination, stable URLs, no private CMS API | Official GScan; local EN/ZH actual upload/render/rollback |
| Public story 公开文章 | Correct byline, canonical/hreflang, content, code/tables, consent; remains readable with CMS stopped | Actual local CMS API → workers → dual Ghost, consent and offline-read acceptance PASS |

## Cross-cutting gates / 跨页面门禁

- Authorization: current membership and scopes at service boundary; no stale UI capability grants authority. Test wrong owner, revoked access, absent CSRF, missing directory, changed connection fingerprint and mismatched exact approval.
- 权限以当前服务端校验为准。必须分别验证 Admin、Publisher、Member、个人 owner，切换工作区后迟到请求不能覆盖新上下文。
- State: every POST result is followed by an authoritative read; unknown publishing results reconcile, never auto-resend. Plans create no outbound job, and becoming due does not authorize execution.
- 状态：冻结确认与当前工作稿分开；待批准不是待用户点第二次运行；人工提交不是已公开；备注不是核验证据。
- Durability: versioned additive migration, idempotent reopen, persistent notes/plan consumption; preserve old UI and legacy data. A UI rollback never restores an old database over real external effects.
- 持久化与回退：迁移、双入口相同用例、旧响应兼容、OpenAPI/操作集变化须有固定版本证据；远端注册更新后置，不把本地生成合同算成已注册。
- Privacy: private assets require exact task snapshot references; ordinary members cannot read unpublished delivery excerpts or internal notes merely because the source article was public. Public analytics respects decline, withdrawal, GPC and DNT.
- 隐私：已在本机双 Ghost 验证统计许可和撤回；该次联合测试不覆盖 Docker 共享卷的私有图片提升。既有素材挂载证据保留原版本边界。

## Evidence boundaries / 证据边界

- Baseline `ce4fb1a`: typecheck and 307/307 tests in an isolated export.
- M1/C03/theme-source `ce4203b`: typecheck and 353/353 tests; separate actual Fastify/SQLite/session/CSRF browser acceptance.
- WP03+C05/C06 `b8d1daf`: typecheck and 379/379 tests; independent exported source with actual API browser M1/WP03, 2/2 PASS. Screenshots under `docs/evidence/cms-b-wp03`.
- WP05/WP06 `0a7c931`: isolated typecheck + 402/402 tests PASS; separate actual API governance and legacy/Studio parity browser scenarios PASS.
- Ghost theme: `docs/evidence/ghost-b-local/` contains both-language native rendering and restoration results.
- CMS→Ghost: `docs/evidence/cms-ghost-local/` contains both-language publishing, attribution, translation and consent evidence. Test articles are intentionally drafts after cleanup, so their public URLs now return 404.
- 所有本机身份来源均明确为隔离 fixture；生产模块没有注入测试登录。真实 Nyx、外部分发渠道、公开域名/素材、目标注册更新、维护邮箱和具名运维签收另列，不据本机测试推定通过。

The final fixed-source suite, page navigation review and rollback rehearsal will be recorded when the remaining implementation packages finish. This file does not claim full completion.

其余包完成后补固定版本全套、全站导航复核与回退演练；本文件不提前宣告全站完成。
