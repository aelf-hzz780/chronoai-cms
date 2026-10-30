# I17 R031 临时来源保护与真实 OAuth 撤权验证

业务修复：`abfb988854ca7b0a90a41a663aab6fbac81598b9`。**临时来源写入保护已获root Local专项及独立App3447实际重放的有界PASS，见[独立报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/actual-nyxid/review.json)；R031完整key/child命令来源能力仍为OPEN/BLOCKED上游。** root另在复验旧确认凭据过期／撤销后当前合法Admin只读认回uncertain远端的疑似回归，本页原有R004 fixture结论不证明这些场景完整通过。R029／R030保留原范围有界CLOSED，完整D/A与Live未签收。[I16](review-i16.md)保留保护前的契约研究及root复现。

## 目标、决策与影响范围

目标是在无法从官方签名与在线契约证明原来源当前有效时阻止queued外发，同时保留真实OAuth来源的service执行路径。没有实现或自造API key/child命令授权、没有延长credential或identity有效期，也没有以只读request-proof或无审批service-wide introspection代替原逐请求批准。

沿用统一Policy组合业务权限与NyxAuthority来源校验，不引入新的策略层或数据库schema。`Policy.publish`默认使用`queued-write`目的，NyxAuthority重新验签保存credential并从签名claims检查`oauth_lineage`：consents必须为数组且最多3项，引用必须包含client、openid scope及非空consent ID/revision；session/delegation引用必须非空，整条链至少保留一种来源。随后仍须通过官方在线introspection和既有scope、client、audience、service绑定检查。**本地形状检查不构成授权；在线active、当前组织／Publisher、精确连接及逐动作批准仍是必要条件。** 只看Actor自报字段、任意header或token decode不会授予权限。

官方缺少原key/child来源时，博客无法可信区分具体key、其他无lineage代理来源及旧快照，因此保守拒绝**全部不具备可核验lineage的propagated发布能力路径**，包括仍正常的API key来源。不能把这一保护称为key功能交付。CMS和显式allowlist中的直接OAuth client继续使用各自已验签token与官方在线授权；带真实签名OAuth lineage的service路径继续工作。

新增业务错误为403 `SOURCE_AUTHORITY_UNPROVEN`：

> 当前代理授权无法持续核验，待发操作已阻止。请使用支持持续授权的服务登录后重新确认；原稿保留。

普通读取、草稿编辑继续使用原权限；取消待发任务仍要求当前发布scope、owner和组织发布权限，但不新增外发来源要求。读取连接／打包等目前共用publish入口的功能也会保守拒绝缺lineage来源；尚未单独细分这些入口。`/me`的canPublish仍表示角色／scope能力，实际发布会返回上述明确错误，不代表已获得可排队的来源授权。

## Worker、复核与最后写入边界

确认原创、创建／授权分发、两个Worker及其发送前检查均共用上述默认保护；AlternateService／AlternateWorker及自动metadata重试也经过同一publish入口。原文和分发复核在保存新的recovery Actor前，另检查原确认Actor的queued-write来源；Worker再次检查原来源。原来源检查不重复要求原Publisher仍保有组织角色，当前复核者仍须有发布权限。现有R004 fixture仅证明原credential仍有效时新Admin接管离组Publisher；原credential过期／撤销后的合法只读对账仍待root独立复验，不能把写入保护有界PASS外推到该能力。

复核仍只能读取和核对远端结果，不能重新发送。abfb988当前实现也会阻止缺lineage、过期／撤销原credential的复核；这是待复验的行为描述，不能据此降低R8／D7／D9／A36／A50要求的先核对避免重复及R10当前caller权限要求。普通排队失败为blocked并记录原Trace及错误码，恢复中的任务保留uncertain／verifying语义和错误码；已有不确定结果不能被误称为安全未发送。保留原稿、原确认及已知远端信息，不以新确认或重发替代只读对账，不自动搬迁或换源重发。

## 本地 TDD 与回归

缺lineage断言先red；新增14条子场景覆盖两个Worker的无lineage、空链、畸形consent、空session、recovery Actor替换、有效链只读恢复，以及最后写入边界撤权。伪造的Actor来源字段不能补足签名token缺口，草稿保留可编辑。R030合法代理正控fixture补入明确的签名session lineage，不再用无来源token冒充可持续授权。

strict TypeScript及全量 **141/141** 通过，授权专项55/55。首次全量发现原来源检查误要求旧Publisher成员资格，已改为仅检查其来源，R004原fixture恢复通过；该fixture不覆盖旧credential过期／撤销。原有1秒identity fixture在跨秒时偶发过期，测试改为2秒并等待其实际过期；没有放宽生产identity校验。首次失败和修正后输出均保留于`.runtime/r031-guard/`的`authorization-red.log`、`check.log`、`focused.log`、`authorization-final.log`、`check-final.log`，不隐去失败。

## 真实官方 NyxID 正反控

环境为root确认ready后的唯一官方本地backend，源码`38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`。另建App3437、client `d7ac171c-a1e7-49a8-841a-df54dc69cce7`、catalog service `6c2b5ddf-1dfa-4bed-a2b4-0ba4d8d7528f`、UserService `bfe2bf82-67ba-4339-9158-d1e1d67d7815`／slug `blog-r031-guard`，复用本任务原隔离person。未操作root App3427/3417或测试对象、旧App3117、Ghost/dev/baseline，没有改官方源码／审批策略／platform operation policy。

通过真实Authorization Code + PKCE及官方consent选择精确资源，再使用取得的**OAuth access token**调用service proxy。每个非GET动作仅批准当前用户、独立service、对应method及精确资源的新pending request，没有durable或通配grant。实际release确认保存的delegation含官方签名的原client consent ID/revision；未伪造lineage。

| 真实来源与状态 | ReleaseWorker | DeliveryWorker | adapter调用／授权写入 |
| --- | --- | --- | --- |
| OAuth consent有效，原来源未变 | published | published | 各1／1，均为隔离模拟写入 |
| 撤旧consent，再以openid profile重新授权，proxy scope已撤回 | blocked | blocked | 各0／0，IDENTITY_UNAVAILABLE |
| 独立删除consent | blocked | blocked | 各0／0，IDENTITY_UNAVAILABLE |
| 实际key delegation无lineage，key仍有效 | blocked | blocked | 各0／0，SOURCE_AUTHORITY_UNPROVEN |
| 同key精确服务列表移除 | blocked | blocked | 各0／0，SOURCE_AUTHORITY_UNPROVEN；新proxy403 |
| 同key删除 | blocked | blocked | 各0／0，SOURCE_AUTHORITY_UNPROVEN；新proxy401 |

**scope撤回方法有明确限制**：官方普通review合并现有scopes，较小scope登录不能撤权。本次通过官方DELETE原consent后重新授予openid profile，读取官方consent确认已无proxy，再运行旧队列。这证明旧lineage在撤销并重授权较小范围后不会复活，不声称独立验证了某个原地scope PATCH撤权契约。独立consent删除分支在重新获得完整OAuth授权后另建queued并执行。

证据边界：release队列来自实际service API；Worker使用一致SQLite私有副本和实际NyxAuthority、签名/JWKS/introspection。Delivery由实际DistributionService在有效来源时预先排队，目标连接／provider与发布readback使用本地fixture；不是实际NyxID外部连接／精确外部批准或真实provider发布验收。两个Worker的网络guard仅允许官方本地NyxID origin，写计数在beforeWrite／beforeDispatch之后；没有Ghost/provider网络请求。

保护已部署后，实际key的逐次批准release POST返回403 SOURCE_AUTHORITY_UNPROVEN，无法再通过真实API创建该不安全队列。因此历史key队列回归仅在私有副本，将**从已验签真实proxy ingress取得的原样加密key Actor**放入旧任务位置；不改token或其签名，不向源DB注入队列，不冒充保护下API成功排队。另实际调用官方普通introspection确认删key后的旧delegation仍active，但queued-write校验明确拒绝。

脱敏开发证据位于工作树`.runtime/r031-guard/`：`integration-result.json`包含16条业务HTTP、9次精确本地动作批准、6组／12次Worker结果；`key-active-after-delete.json`记录active与拒绝的差别；`cleanup.json`记录源7条release全部cancelled、queued=0、13个源／副本DB均outbound_paused=true、临时key维持deleted。App3437保留但无Worker进程，private目录0700、文件0600。凭据及加密Actor不进入Git或公开报告。

最初4次harness失败另存`actual-attempt1.log`至`actual-attempt4.log`：依次为未授权精确服务、create-key响应缺resource_uri导致错误参数、delivery fixture未返回核验结果、误以为较小scope review会替换旧scope。修正配置／fixture及官方撤权方法后`actual.log`为通过记录；不把前述失败改写为业务通过。

## 上游只读核对与剩余门禁

只读查询远端HEAD `2a1f278ddf9dcf1390f8f316a10f2f04183af6f5`及最新release [v0.76.0](https://github.com/ChronoAIProject/NyxID/releases/tag/v0.76.0)（2026-10-29发布）。该HEAD的JWT claims、identity delegation生成、OAuth authority校验及lineage模型4文件与本地固定revision逐字节一致，未补原key/child命令lineage。另在独立bare仓库比较两个revision，844个变更文件中选择9个相关backend契约／测试检查diff；proxy、approval与assistant authority的变更为shared-agent访问约束等，没有为普通逐请求proxy写补来源命令授权。证据见`upstream-review.json`、`upstream-compare.json`及`upstream-changed-contracts.diff`。GitHub compare API曾403限流，后用独立bare仓库完成检查；未对官方工作树fetch／checkout／修改，未外发问题。

R031完整能力仍需[I16的官方来源／命令契约](review-i16.md#方案与可安全执行范围)，尤其原key与child incarnation、当前精确UserService／operation／批准绑定的在线核验，以及撤销／轮换／scope与批准漂移的真实测试。root临时来源写入保护有界PASS不覆盖上述完整能力或待复验的过期／撤销原credential只读恢复，不关闭R031、不降N/A、不静默转CMS，不提升完整Local／D1–D9／A01–A52或Live。

## 部署与回滚

无schema或密钥迁移。App和所有Worker须一起升级至该业务SHA，先暂停外发、检查旧queued与恢复任务，核对OAuth service正反控后再按有效来源开放；不自动重发旧blocked任务。若需回滚代码，必须保持outbound_paused=true并停止外发Worker，不能恢复保护前的无lineage执行行为。source／phase0／baseline和正式验收第1节起9750字节保持原文。
