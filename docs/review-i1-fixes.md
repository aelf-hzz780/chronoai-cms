# I1 独立验收退回修复

原审查：5eb51a753899b94ff97750143239313e07fc7b33，结论 CHANGES_REQUESTED。以下为开发修复说明，关闭仍以原任务独立复验为准。

正式回归文件：`test/review-i1.test.ts`，导入当前开发代码；没有执行绑定旧 review 树的复现脚本冒充修复验证。

| 编号 | 修复 | 回归 |
|---|---|---|
| R001 | 引入 Queue lease token＋generation，所有原文状态、远端映射、完成与 job 结算在同一事务中核对当前租约；过期或被接管的 Worker 不再落库。Ghost 写请求和素材处理也在实际调用前检查租约。 | 迟到成功／false／异常均不能覆盖更新版本；旧 Worker 收尾不能结算正在运行的新租约。 |
| R002 | 按冻结 revision 重新产生受控渲染，用 DOM 内容证明比较完整 Admin readback 与公开页受控片段；核验正文后才允许公开素材。保留代码块空白语义。 | Admin／公开正文替换而保留 marker 均拒绝；等价正常内容接受；代码改变、重复 marker 拒绝。 |
| R003 | 区分写入应答与后续核验阶段；已知写入后读失败保留 verifying，未知发送结果保留 uncertain。下线核验由 Worker 单独执行，恢复只查远端不再发送 create/update/unpublish。 | publish 与 unpublish 成功后临时 GET 异常均可对账完成，写入计数不增加。 |
| R004 | recovery_actors 独立保存当前恢复请求者及 Trace ID；不改原确认 actor。只读恢复使用当前有权请求者，恢复路径拒绝新的写入；恢复权限不足保留可重试的未知状态。 | 原确认人退组，另一当前 Admin 成功发起对账；原确认审计仍为原人，未新增写入。 |
| R005 | SQL 先生成每文章有权 revision 关系，搜索授权正文后再 LIMIT/OFFSET；返回前再次执行权限检查。 | CMS/service 首个搜索页找到较旧唯一匹配；发布者无法搜到他人提交后新增的私人工作稿内容。 |

验证：`node --test test/review-i1.test.ts`。最初 10 个故障回归全部 red；修复后加 1 个正文正例，共 11 项 green。`npm run check` 继续执行 strict TypeScript 和全部当前本地测试。

本组为本地故障与交错验证，不代表目标 NyxID、四 Ghost、外部平台或 D1–D9 已通过。
