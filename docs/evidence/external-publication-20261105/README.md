# 008 验证证据 / Validation evidence

业务实现固定于 `f7a1c8b5a1bcc60cd168b214d898bb8926a2b0f7`，本地 HTTP/Studio 集成与可复用现场脚本固定于 `858ff2f`。后续本目录提交仅归档证据，不将不同级别的验证混为正式验收。

Business implementation is pinned to `f7a1c8b5a1bcc60cd168b214d898bb8926a2b0f7`; local HTTP/Studio integration and reusable live scripts are pinned to `858ff2f`. Subsequent commits in this directory archive evidence without treating different validation levels as formal acceptance.

| 范围 / Scope | 结果 / Result | 证据 / Evidence |
| --- | --- | --- |
| TypeScript + 标准回归 / Standard regression | 501 PASS, 0 failed/skipped | `check.log` |
| 本地 HTTP/Studio / Local HTTP/Studio | 4 PASS：外部正向路径 + 3 个既有 exact API/恢复负例 / external positive flow plus three legacy exact API/recovery cases | `local-publishing.log`, `local-http-studio.json` |
| 交叉审查 / Cross-review | 三项发现已修复并独立复验 / three findings fixed and independently retested | `core-review-retest.jsonl` |
| 本地 UI / Local UI | 精确材料与核验登记 / exact materials and verified registration | `local-http-preview.png`, `local-http-registration.png` |

本地集成运行真实 CMS HTTP、OAuth/CSRF、SQLite、Studio、Ghost Adapter 和浏览器渲染；NyxID/Ghost/DEV 远端协议均为 loopback 模拟。独立模拟工具只写一次 DEV fixture，CMS 只读核验；重复登记和刷新没有新增写入。该结果不证明真实 NyxBot、真实 DEV 或公网 Ghost 通过。日志、报告和截图 hash 见 `local-manifest.json`。

Local integration runs production CMS HTTP, OAuth/CSRF, SQLite, Studio, Ghost Adapter and browser rendering against loopback NyxID/Ghost/DEV protocol simulations. An independent simulated tool writes the DEV fixture once; CMS verifies with reads. Repeated registration and refresh add no writes. This does not prove real NyxBot, DEV or public Internet Ghost acceptance. `local-manifest.json` contains log, report and screenshot hashes.

三项复验分别覆盖：重复 prepare 重新验证 Ghost 原文；DEV 同步失败给已有指标标记不可用并保留旧值/时间；手动同步期间撤销身份或改变 owner 后拒绝返回冻结正文。另有 39 项核心用例覆盖账号、内容、canonical、公开状态、URL、幂等冲突、并发、取消、丢回执、多匹配、只读同步、组织拒绝和旧 Worker 隔离，均包含在 501 项标准检查内。

The three retests cover renewed Ghost verification on idempotent prepare, marking existing metrics unavailable while retaining old values/timestamps after DEV sync failure, and refusing frozen-content responses when identity or owner changes during manual sync. The 39 core cases additionally cover account, content, canonical, public state, URL, idempotency conflicts, concurrency, cancellation, lost receipts, multiple matches, read-only sync, organization rejection and legacy Worker isolation; all are included in the 501 standard checks.

真实证据另见 `live-summary.json`（归档后提供）：其公开发布结论必须与本地正向模拟分开。历史未公开草稿被 CMS 拒绝登记，是负向边界通过，不是公开 DEV 闭环通过。组织发布、完整 D6/D7 和最终项目验收均未在此宣告通过。

Real-system evidence is recorded separately in `live-summary.json` when archived; its public publication verdict must stay separate from the local positive simulation. CMS rejection of the historical unpublished draft proves a negative boundary, not a public DEV publication loop. Organization publication, all D6/D7 outcomes and final project acceptance are not declared passed here.
