# I15 保存授权的当前绑定与撤权（开发记录）

R030修复业务源码：`76595bcc5883f826aaf49acb3e3575531e41cb26`；关联A09/A15、D2/D3/D5/D9，前置R029为`2d65bc0`。**R029／R030已由原任务在该业务SHA独立有界关闭，结论为PASS_BOUNDED_R029_R030；不提升正式D/A签收。**

## 发现与修复

原任务独立复验发现四条失败路径：删除整个service capability mapping、从direct service白名单移除client、更换CMS client、切换legacy mapping同时更换CMS client。新认证已拒绝，旧queued仍能写；legacy CMS旧session还可直接沿用旧Actor发布。原6场景包含不变配置与仅移除publish key两条正控，均以明确的Local签名／introspection fixture和隔离适配器复现，不是真实Ghost/provider写入。

修复采用组合方式提取`CallerAuthorization`，让AuthManager首次认证与NyxAuthority的保存Actor重验共用discovery、access token验签、client绑定与capability计算。相比在各Worker复制规则，此方式使会话、原文队列和分发队列服从同一当前配置；Worker继续调用既有Policy及beforeWrite／发送守卫，不更改出站业务与状态机。

加密Actor新增来源绑定：CMS和direct service保存签名client及audience；propagated保存入口已验证的service ID、slug、identity audience及delegation audience。每次保存授权核验均检查当前issuer、入口、来源配置、signed subject、有效token及在线introspection，并按当前entry mapping、legacy global mapping或raw scope重算能力。即使整个mapping消失也不跳过；旧Actor中的每项capability须仍被当前配置和签名scope允许，不自动提升保存任务的权限。

CMS session在所有模式下重新认证原access token，始终检查当前CMS client；不再在legacy模式直接信任旧Actor。direct service在三种模式下均要求显式client白名单，禁止delegated token改走Bearer路径。propagated入口仍核验两个签名及最长60秒identity assertion；延时任务使用入口已验证并加密保存的来源绑定，重验仍有效的delegation，不要求原短assertion永久有效，也不延长delegation有效期。

迁移边界：旧CMS session可由原签名token按当前配置重新认证；缺来源绑定的旧队列将blocked，需要当前有权用户重新认证并确认，不手工补来源。mapping、client、issuer或audience撤销后的旧任务不得直接恢复出站。运行配置与迁移说明见[NyxID交接](nyxid-registration.md)。

## TDD与固定源码验证

新增`test/auth-revocation.test.ts`：实际Store持久化后关闭／重开，实际AuthManager、NyxAuthority、Policy、ContentService、PublishingService、ReleaseWorker与DeliveryWorker；只用本地RS256/JWKS/HTTP introspection及隔离适配器，在实际beforeWrite／beforeDispatch之后计数。

- 20种配置／来源场景×2个Worker，共40分支；旧源码28分支失败，修复后40/40通过。Node计入父测试为41项。
- 覆盖整个mapping删除、publish key删除、raw fallback与client撤销、CMS legacy切换、client／issuer／service／两类audience变更。
- 正控覆盖不变direct、raw、CMS、兼容legacy及propagated。propagated正控等待入口短identity实际过期，新的相同请求拒绝，而保存队列在delegation仍有效时正常通过beforeWrite；没有用过期assertion签发新权限。
- strict TypeScript、完整127/127测试与相关51/51通过；原独立6场景脚本仅更换root/out后在固定修复源码重跑，6/6通过。

证据在Git忽略的`.runtime/r030-auth/`：`red.log`、`green.log`、`targeted.log`、`typecheck.log`、`tests.log`；`config-revocation.ts`、`config-revocation-result.json`及`original-six.log`保留原独立脚本重跑。Local fixture不作为真实NyxID或外部分发通过。

## 真实NyxID增补

沿用真实官方NyxID 0.75.0／`38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`及独立App3117、DB/media、client/org/service；App已按固定修复源码重启。新增独立命名service-first用户；不修改NyxID源码或原有测试Admin/client。固定SHA增补结果为`PASS_ACTUAL_LOCAL_NYXID_R030_DELTA`：4组检查、20条记录业务HTTP、4条Worker正反控，实际结果与边界见`integration-result.json`。

真实queued撤权流程为：Admin授予Publisher→Publisher分别从CMS与实际签名proxy创建并确认queued→保留queued时Admin撤销Publisher→复制实际SQLite到私有隔离副本→实际ReleaseWorker通过官方签名／introspection／组织API重验权限→blocked、适配器零写。隔离副本仅放行选定job，适配器不访问Ghost；源数据库queued随后由Admin通过CMS取消。该证据使用真实NyxID授权与真实持久化Actor，出站写计数是明确的隔离适配器证明。

其他增补为真实`openid profile`只读CMS的release POST拒绝，以及新用户先从service代理进入并创建个人稿件、随后CMS OIDC读取同subject／workspace／稿件；不变授权的CMS/service queued还通过同一隔离Worker正控，各在beforeWrite后计一次模拟写，源队列均取消。它们补足I14的queue→cancel→revoke→重新confirm、只读canPublish/create以及先CMS后service的覆盖边界。

脚本为`integration.mjs`及`worker-probe.mjs`；脱敏结果为`integration-result.json`、`worker-<releaseId>.json`。证据按同一固定SHA分段：`actual-delta-final.log`完成三个缺失分支，`actual-positive-retry.log`续跑不变授权正控并退出0；结果汇总这两段，不声称一次连续无失败运行。第一轮service-first后续CMS页面等待超时；另一轮个人owner未配site而拒绝正控，已改为预先注册site的组织Admin。`actual-positive.log`还保留一次callback后me瞬时401；同一保存token随后独立验签与在线introspection通过，重试通过，首次原因未明，未修改产品或放宽校验。`integration-last-attempt.json`保留此前停止信息。私有数据库副本与凭据仍在`.runtime/r029-nyxid/private/`，文件0600，避免输出token／cookie／完整授权头。

`source-fingerprint.json`确认72个源码／测试／配置文件与业务SHA逐字节一致；`document-verification.json`确认48个本地链接／anchor有效、两份来源checksum正确，正式acceptance第1节起9750字节以及phase0／baseline／manifest保持原文。

本轮没有真实Ghost/provider写入，没有操作四Ghost/dev/baseline/恢复卷，没有push／merge。App3117及NyxID保留供原任务独立复验；真实外部账号／具体内容动作授权／目标部署运维责任与正式D/A仍需相应输入和独立结论。


## 独立有界闭合（2026-10-30）

原任务根报告为[review.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/76595bc/review.json)，reviewedAt为2026-10-30T05:13:13.823926+00:00，业务固定`76595bcc5883f826aaf49acb3e3575531e41cb26`，文档`c86e3892b2902470d841580aa816ff91dad951a1`无业务差量。独立判定为`PASS_BOUNDED_R029_R030`，两项均CLOSED，无新增发现。当前登记R001–R030共30项已关闭，其中29项必需缺陷、R021非门禁。

独立strict与127/127通过；`auth-review/`下原6＋新增27条绑定／模式／时间分支共33/33通过。这部分明确使用Local签名／introspection fixture，包含identity过期而有效delegation仍可执行的延时正控，不放宽token expiry或入口60秒约束。

原任务另建自己的真实官方NyxID账户、client、org、service及App3417／私有DB，完成HTTP OIDC code/PKCE及官方明确consent、真实proxy双签名／introspection，7＋3组实际分支与39条业务HTTP记录通过；这是独立HTTP流程，不宣称独立浏览器重放。`actual-nyxid/`下的`actual-http-review.json`、`role-readonly-review.json`、`worker-final-review.json`记录：

- 全新service-first个人owner从0→1，随后CMS为同主体；双入口BOM／CRLF／中文Markdown逐字节下载与跨owner拒绝。
- 只读CMS及account:read service的实际release POST均403；两入口Member可投稿但拒发，Admin可确认同份投稿并取消。
- 实际退组后组织内容拒绝、个人内容仍可读；同口径metrics查询及越权通过，仅空隔离数据集，不作为新增readership测量。
- 两入口保持真正queued后撤Publisher，重开一致SQLite副本的实际ReleaseWorker均blocked／FORBIDDEN，adapterCalls=0、authorizedWrites=0。只有Worker外发adapter为安全替身，未执行真实Ghost/provider写入；不能将该结果替代真实NyxID结合四Ghost的发布差量。

`actual-nyxid/environment-review.json`公开保留root两次harness修正：官方loopback consent交接可为200 HTML callback链接，原302预期已改；metrics每次查询的distribution.updated_at为读时刻，不应要求逐次相同。最终独立流程未使用重试兜底或压制授权失败。开发侧瞬时401仍原因未明，root最终独立流程未复现，保留上述记录。

root源6条release均经实际Admin API取消，剩余queued为0；成员及service scope已恢复，App3417已停。NyxID与开发App3117保持现状。本次仅同步文档，不重跑全检／恢复，不启动Ghost Worker或新栈。

Local modeled统计仍为51 PASS／A05 BLOCKED，Live／正式D1–D9仍未完成。原任务继续实际NyxID门户／CMS入口与OpenAPI注册、实际多组织／受限代理，以及真实NyxID和四Ghost发布、指标及必要恢复差量的独立验收；当前Local待办不能写为0。真实provider账号／订阅／具体内容动作授权、目标部署／付款／运维／隐私／RPO-RTO及Git远端输入仍缺，缺陷有界闭合不代替这些门禁。
