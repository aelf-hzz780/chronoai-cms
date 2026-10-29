# I3 P2 修复批次（待独立复验）

基于bf0a4f9与P1批次2a82ee8。以下为开发回归结果，不宣布独立关闭。

| 项 | 变更 | 回归 |
|---|---|---|
| R006 | Ghost接受POST/PUT但缺id/url抛uncertain；按slug/revision只读恢复 | review-i1.test.ts，publish/update×缺id/url四组合，写入均为1 |
| R011 | 辅助材料包含可见署名；article/h1/全文或摘要/来源anchor/image选择逐项核验；code/pre保留空白 | distribution.test.ts，可见正确材料正例，metadata/comment/其他作者/正文/模板反例 |
| R012 | 已知DEV/Hashnode remoteId读回必须相同 | targets.test.ts：其他文章ID即使body/account/canonical匹配也不结算 |
| R013 | projection冻结published release/关系快照，最终metadata-write重验；部分写后漂移排队纠正 | alternates.test.ts：旧投影await、新下线清理、旧投影继续，无链接复活且有纠正job |
| R014 | paused时只认领显式请求的只读recovery，新写边界再次检查pause | distribution/review-i1.test.ts：原文和delivery可读对账，新create/metadata不发送 |
| R015 | 外部分发date filter使用delivery.created_at，响应明确dateBasis | metrics.test.ts：原文10/1、delivery10/2各日期反例 |
| R016 | 采集异常保持GIF和发布可用，保存owner/article/lang/date gap并显示Unavailable；完全DB不可写保留进程内gap | metrics.test.ts：observations写失败HTTP200但指标null/Unavailable，其他语言不受影响 |

验证：strict TypeScript、60项本地测试；前端语法、diff检查。最终四Ghost与恢复会另外生成当前源码指纹证据，旧证据不提升为新版本验收。
