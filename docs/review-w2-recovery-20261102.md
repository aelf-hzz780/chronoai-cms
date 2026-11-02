# W2 当前版本隔离恢复复验（2026-11-02）

本轮范围为 Gist v0.7 的 R8/R10、D9，以及受影响的 D2/D4/D5/D7/D8、A47–A51。未新增定时发布、自助开站、外部平台或 NyxID 全部凭据模式要求。显式补图／单独 sync-links 是已有实现选择；以下时间是本机实验测量，不是原文 SLA。

## 固定版本与结论

- 源业务：`0b0e9d11dacd0c4c069bc0ee9ce8706142036922`。
- 恢复及受影响业务复验：`83b4b8e5fa28cb18a6926f3a10d2205e04f49ab1`，分支 `codex/w2-current-recovery`。
- 本轮有界本地恢复通过。真实四站 Ghost／MySQL、新卷、加密包及素材文件均实际运行；当前授权协议另以受控签名 issuer／代理验证。不能将此描述为全套 Native NyxID 或真实外部平台验收，也不提升整体 D1–D9 状态。
- 证据目录：`/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/parallel-local-20261102/w2/`。`private/` 内含凭据、数据库与备份，禁止上传或贴入报告；公开摘要仅含计数、状态与摘要值。

## 修复与审查

原版存在两个相关恢复缺口：正常快照中的 queued 补图优先于新只读复核 Actor，旧来源撤销后当前授权用户仍被阻断；crash 数据中的 running 补图在 job 被归档后可能永久保留 running。后者与清洁 capture 不同：capture 本身会拒绝 active Worker。

隔离恢复及显式只读复核现在把旧 queued/running 补图按 `public_files` 终结为 blocked/partial，并记录原因与审计。原 Actor、revision、确认 digest、Trace ID、已公开计数保持不变；正在执行的 Worker 不可被抢占。后续补图须新命令和当前有效权限，原幂等键不会重新排队。

TDD 原版 8 项中 7 失败，修复后 8/8；相关回归 47/47、typecheck、diff-check 通过。独立 reviewer 另验 SQLite 10 组以及并发、事务回滚、幂等、入队后撤权 5 组。证据见 `static-review/review.json` 与 `sqlite-regression/review-fix/review.json`。

## 实际演练

| 检查 | 实际结果与证据 |
| --- | --- |
| 源准备 | 两 owner × EN/ZH 四个新 Ghost 站，实际正常带图发布；另有 Ghost 接受后响应丢失、两图只完成一图、queued 补图和待执行 org 发布。`source-review.json` |
| 完整备份 | 真实 capture CLI：SQLite、原始 Markdown／私有图、平台与 Ghost 配置、额外配置、四 MySQL dump、四 content tar，AES-256-GCM；独立验证 manifest 和源文件指纹。`restore-execution.json`、`full-audit/archive-comparison.json` |
| SQLite | 36 表全部列／BLOB／schema／索引对照，16 revisions、8 assets、54 条原审计、5 command authorities、2 derivations、queued media history 及其唯一索引保留。仅有预定义恢复状态转换、旧会话／OIDC 清除和新增恢复审计。`full-audit/sqlite-comparison.json` |
| 四 Ghost | 源站全部停止后恢复到新卷及独立 backend 端口；四站数据库、content、配置、原远端身份和已有公开图恢复。新 backend 端口为 3688/3689/3698/3699，通过本任务内部 relay 保留原 loopback public origin；未改写发布 Actor 或 revision。`source-stopped-proof.json`、`full-audit/mysql-comparison.json` |
| 私有 staging | 每站 `.chrono-private-staging` 的残留字节与 hash 保留；按 Worker UID 重新预置 0700。四站共 20 条私有路径访问均 404，残留未迁入 public。`full-audit/archive-comparison.json` |
| 暂停与只读认回 | outbound paused 时使用当前授权，旧来源失效不阻断只读核对；Ghost 新写 0、materialize 0，已接受原文恢复为同一 remote ID，缺失私有图保持 404。`restored-review.json` |
| 恢复后可用性 | 旧未到期 cookie 401；CMS/service 原始 Markdown、状态与非空指标一致，其他 owner 403；译文链接保留。撤权 pending 阻断且无远端副本，当前新补图仅公开剩余图片，不重发 Ghost 原文；新个人稿带图发布成功，逐稿远端唯一。`restored-review.json` |
| 分发状态 | 非空 file-backed SQLite 专项经真实业务方法及 service 路由建立 5 deliveries/payloads、2 approval fences；个人／组织 uncertain 同 ID 只读认回，queued 连接归属漂移或批准过期阻断，旧 Actor／command／批准绑定保持。远端是 loopback fixture，未访问真实 DEV。`delivery-regression/latest-result.json` |
| 失败与保护 | 错误 key、篡改密文均在创建恢复目标前拒绝；真实源与恢复卷保留。准备阶段的 DTO 字段、Fetch 禁用端口 3659、Ghost 重建后 staging UID 问题及处置均有记录。`archive-failure-checks.json`、`source-setup-failures.json` |

加密 capture 实测 **2.138 秒**，恢复 CLI 从新卷建立到四站 healthy 实测 **38.298 秒**；本任务 public-origin 接线、后续校验时间分别记录，不计为已约定的生产 RTO。该静止快照没有发现内容丢失、同一被测发布的重复副本或未授权私有图片公开。

## 运维与回滚

本轮只使用 W2 自有 checkout、源／恢复 Compose projects、端口、数据库、卷与私密配置。重负载期间独占 `runtime-heavy.lock`。完成后停止 W2 自己的 18 个容器，保留 18 个数据卷、加密包及数据库；释放锁。现有 18 个容器继续运行，原 CMS `outbound_paused=false`，未改 NyxID 数据、W1 凭据或 heartbeat。证据见 `cleanup.json`、`original-environment-preserved.json`。

共享运行环境从未切换到 W2 版本，无需线上回滚。补丁未新增 schema；需要撤销时可在集成分支 revert 该修复提交，并保留审计和旧副本。恢复重试须使用新目录／project／卷，不覆盖现有恢复结果。失败输入已保留在受限目录，禁止把备份 key 随加密包交付到同一公开位置。

## 证据边界与交接

本轮当前数据与新增表／素材实现均重新演练，未用旧 `0418652` 恢复成功替代。历史 Native NyxID 双入口／权限证据仅作为已有能力背景；W1 负责当前 Native 来源及 R031。整合此补丁时，W1 应补验“pending media 下显式 reconcile 使用当前 Actor”及“后续补图使用新有效授权”，不可把不同 SHA 的两项成功直接汇总为最终版本通过。

生产域名、正式账号／外部平台、订阅付款方、保留策略、离机备份和生产容量／恢复目标仍属于整体交付依赖；它们没有阻止本轮本地 W2 工作完成。本轮不宣称真实 DEV／Hashnode 发布或恢复、不向 NyxID 上游推送、不自合并、不宣称整体 D1–D9 完成。
