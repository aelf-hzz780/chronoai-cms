# I18 R033 当前调用人的只读恢复授权

业务修复：`4a27487bac6c74459c7f65a6e9c2cf4c63ea36f1`。独立 **R033/P1（A36/A49/A50、D7/D9）开发修复通过，待root独立复验**，不自行关闭。root在abfb988对release／delivery × 原credential自然过期／在线撤销独立复现，真实官方NyxID撤consent后fresh owner亦复现；不重开旧R004。[R033独立依据](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/independent-auth/R033.json)与[实际撤consent依据](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/actual-nyxid/recovery-regression.json)保留原结论。

## 目标、决策与实现

目标是原确认credential失效后，当前有权Admin／owner仍可核对uncertain远端结果，避免重复外发。保留原确认、结果绑定和Trace，不延长旧credential、不把新恢复身份借给原任务的新写操作；R031完整key/child来源能力仍OPEN/BLOCKED上游。

沿用现有Policy的purpose区分和recovery Actor存储，不增加schema或新的策略框架。`PublishingService.reconcile`按当前caller执行`Policy.publish(..., 'access')`；`DistributionService.reconcile`按当前caller执行`context(..., 'access')`，两者删除对原Actor的queued-write重验。两个Worker在recovering时校验当前保存recovery Actor的access，其余排队任务继续queued-write。原确认密文保持不变；恢复请求保留独立Actor和审计Trace。

恢复仍要求当前scope、owner／组织发布权限、精确connection fingerprint及lease／fence；当前caller撤权或离组必须拒绝。原文adapter的beforeWrite、分发send的非读取守卫均继续以`RECOVERY_READ_ONLY`拒绝重发。暂停外发时只能显式只读恢复，普通新写仍阻断。复用既有异常捕获与错误码／Trace ID，未新增静默失败路径。

选择现有purpose与Worker恢复分支，使只读权限与外发来源检查在既有业务层组合；代价是调用处必须明确purpose，故测试同时覆盖恢复成功和新写拒绝。原方案要求原Actor持续有效，会把远端已成功但响应丢失的记录永久留在uncertain；以重新确认／重发替代会增加重复副本风险，因此未采用。

## TDD 与回归

`test/auth-recovery.test.ts`四个关键子场景先red后green：release／delivery分别覆盖原credential自然过期（等待真实签名token到期）及在线撤销；先由安全adapter模拟已接收但响应丢失进入uncertain，再由当前CMS Admin或有效但无queued-write lineage的delegated Admin恢复。

每分支核对当前recovery credential撤销、Admin membership移除时，API请求和已保存Actor的Worker均拒绝且零读取；delivery另覆盖connection漂移零读取。成功恢复各1次读取／0次新写，adapter主动尝试重发被拒，原Actor密文、审计Trace与outbound_paused=true保持。旧source始终不能新写，无lineage当前caller只能读取恢复。`test/auth-revocation.test.ts`同步将旧快照恢复改由真实reconcile业务方法保存当前Actor，仍断言旧source不能确认新写。

strict TypeScript、相关 **77/77**、全量 **146/146** 均通过。证据目录为工作树`.runtime/r033-recovery/`：`red.log`、`focused.log`、`check.log`；首轮失败证据保留，不将其改写为通过。相关业务修复已独立commit，后续本轮文档未改变源码。

## 实际官方 NyxID 验证与边界

将本任务App3437安全重启至固定业务源码，使用[I17](review-i17.md)的独立client／catalog service／UserService；没有Worker daemon。真实Authorization Code + PKCE与精确资源consent后，经实际service API创建release队列，非GET只逐次批准本任务精确本地请求。实际Worker在一致SQLite私有副本以安全adapter模拟uncertain；通过官方DELETE仅撤本任务client的consent，再fresh CMS owner登录，保存当前Actor并只读恢复。身份、签名、JWKS、introspection均为官方本地NyxID 0.75.0。

| 恢复对象 | 原来源 | 当前caller | 远端读取／新写 | 结果 |
| --- | --- | --- | --- | --- |
| ReleaseWorker | 实际OAuth delegation，原consent已撤销 | fresh CMS owner | 1／0 | published，主动重发被拒 |
| DeliveryWorker | 实际OAuth delegation，原consent已撤销 | fresh CMS owner | 1／0 | published，主动重发被拒 |

两者原Actor密文不变、旧source新写拒绝、outbound_paused=true。结果见`recovery-run-result.json`；完整脚本及输出为`actual.mjs`、`recovery-probe.mjs`、`actual.log`、`integration-result.json`。真实网络轮仅覆盖个人owner与consent撤销；自然过期、组织Admin及当前caller失权／connection漂移由本地签名issuer专项覆盖，不外推为真实组织或完整A49/A50通过。

同一业务SHA另完成R031六组／12Worker正反控：OAuth有效两Worker各1次模拟授权写；撤旧consent后缩scope重授、独立删consent、实际无lineage key有效／撤服务范围／删除，两个Worker均零adapter／零写并blocked。各结果在`oauth-positive-workers.json`、`oauth-scope-revoked-workers.json`、`oauth-consent-revoked-workers.json`、`key-current-workers.json`、`key-scope-revoked-workers.json`、`key-deleted-workers.json`。scope缩减采用官方撤consent后窄scope重授，普通review会合并scope，不能当作原地PATCH撤权证据。

release来源为实际API；delivery连接／provider、远端结果及lost-response均为fixture。历史key队列只在私有副本使用真实已验签proxy ingress的原样加密Actor模拟，不声称保护下API能创建无lineage新写（实际确认返回403）。Worker网络guard只允许官方NyxID origin，无Ghost/provider网络写入。实际验证中19条业务HTTP记录及六组Worker报告不等于真实外部平台发文或精确外部批准签收。

首轮harness在完成R033与OAuth分支后因读取ingress密文路径错误失败，保留`actual-attempt1.log`；首轮临时key已删除，见`attempt1-cleanup.json`。修正为本任务App3437 recorder的既有私有路径后完整通过，未改业务源码。

`cleanup.json`记录当前临时key已从官方列表消失、源queued release=0，14个私有副本及源DB共15个均outbound_paused=true。副本可保留queued历史以便审阅，未启Worker daemon。private目录0700、文件0600；凭据／Actor不进入Git或公开报告。未操作root3447／3417、旧3117、Ghost/dev/baseline或其对象，未改变角色／Publisher与官方源码。

## 部署、回滚与剩余门禁

无schema／密钥迁移。App与全部Worker一起升级至固定业务SHA；先暂停外发，检查uncertain与旧queued，再由当前有权caller显式只读对账。保持R031新写保护，不自动重发、换源或复活旧blocked任务。若回滚代码，保持outbound_paused=true并停止外发Worker；回滚到abfb988会恢复R033限制，需人工保留并跟进uncertain。

R032文档问题已独立有界关闭，当前状态统一链接[root台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)，不硬编码随验收变化的当前统计。R033待独立复验；R031完整能力仍OPEN/BLOCKED上游；完整D1–D9／A01–A52与Live未签收。正式验收第1节起9750字节、source／phase0／baseline保持原文；`document-verification.json`及`source-fingerprint.json`绑定固定业务SHA与逐文件内容。
