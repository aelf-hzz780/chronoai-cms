# I13 CMS状态反馈刷新（开发记录）

R028修复源码：`804e7c49bc9b6e6a6d1b17f55325a5e3d885a322`；关联D7、A35/A38。开发定点6/6、独立专项4/4通过，R028已独立有界关闭；完整D/A及Live未整体签收。

独立实际CMS取消组织待发稿后，API与列表为cancelled、Worker不认领且新私有图404，但role=status仍报原文queued，手动刷新也不清除。该发现的安全行为已通过，本次仅修反馈一致性。

最小改动限web/app.js三处：共享refreshStatus完成GET与绘制后写中性刷新提示并返回记录；原文取消／对账、分发取消／对账／关联批准的处理从刷新结果查同一id并报告当前state。找不到记录则保留中性提示；请求失败仍沿用既有错误与Trace反馈。选择器、逐记录历史、链接和布局保持，无轮询或后端变更。对账POST可返回请求时uncertain而Worker已完成published，因此操作提示使用与列表一致的GET读回。

开发实际Fastify App、PublishingService/ReleaseWorker、DistributionService/DeliveryWorker及Chrome采用随机loopback端口，合成actor、OriginalAdapter、connection与本地Target，禁止所有非fixture浏览器请求。固定SHA的6项通过：

- 原文queued取消后提示／列表／选择一致。
- 外部完成取消后手动刷新清除queued提示。
- 原文对账POST仍uncertain而刷新GET为published，提示published。
- 分发取消后提示／列表／选择一致。
- 分发对账POST仍uncertain而刷新GET为published，提示published。
- 再次刷新用中性提示替换上次操作提示。

早期probe以networkidle作为等待条件，断言抢在操作读回前，已改为等待实际刷新响应及DOM预期。同一修正后的probe加载修复前app.js时，完成取消和读回后仍queued而稳定失败；修复后与固定SHA均通过。node --check与git diff --check通过；未重复后端全套或已过安全测试。证据在开发树Git忽略的`.runtime/r028-status/`：probe.mjs、baseline-app.js、red-confirmed.log、green.log、fixed-sha.log、result.json。

原任务固定804e7c4独立4/4 UI定点复验PASS，R028已关闭：取消后notice／record一致，手动刷新无旧queued，原文reconcile恢复published，分发POST旧uncertain而GET当前published时按GET反馈；history／Trace／三个选择器／原文链接保持。报告为原任务Git忽略的`.runtime/acceptance-review/reviews/804e7c4/status-feedback/review.json`，明确采用合成identity、OriginalAdapter和memory provider，零外部provider请求，不代表Live。R027亦按b1d30b2独立7/7及strict报告关闭。未操作Docker、root/dev、3398/3399或相关验收端口；无真实Ghost/provider访问，未push。正式D1–D9/A01–A52、目标身份与provider、生产部署／责任／RPO/RTO继续保留未签收边界。


## 独立 Local 收尾（2026-10-29）

原任务综合账目为Git忽略的`.runtime/acceptance-review/integration-review/case-ledger-current.json`，recordedAt为2026-10-29T11:09:28.646402+00:00，业务源码固定804e7c4；证据按各自固定源码及影响边界组合，不将历史结果无条件提升为当前全套重跑。R001–R028共28项登记问题全部有界关闭，其中R021非门禁；27项门禁缺陷已关闭。

| 层级 | 独立结果 | 保留边界 |
| --- | --- | --- |
| Document | 48 PASS、4 BLOCKED（A01/A05/A06/A52） | 真实注册、目标值和交接责任仍缺输入 |
| Local | 51 PASS、1 BLOCKED（A05） | A05缺具名目标部署／付款／运维输入；可独立推进Local工作为0 |
| Live | 52 BLOCKED | 必需共享门禁A01/A05/A06及各场景外部输入未满足 |
| 正式交付 | D1–D9均未签收 | fixture、文档和缺陷关闭不代替必需真实目标证据 |

最终差量已独立补齐：A04四角色有效CMS/service凭证访问四Ghost的32次拒绝及4个Integration正控；A07 service个人与实际CMS组织的新正文update上线且URL／remoteID保持；A19两入口含新PNG待发任务取消后Worker不认领、新图404／私读正确、旧公开图hash不变；实际Admin revoke/grant及两入口取消audit完整。L1 Native的owner／多组织／禁用连接／approval mutations／DEV同ID更新／rights／assisted／cancel共14个功能分支及R027 Trace回归通过；L4秘密、完整HTML、原始403与审计证据合并通过。A43/A44无需为了Unavailable或未经授权的外部计数增加无条件数字门禁。

证据入口（均相对原任务Git忽略的`.runtime/acceptance-review/`）：`integration-review/final-ghost-delta/`下review.json、ghost-admin-boundary.json、service-update-cancel-review.json、cms-update-review.json、cms-cancel-review.json、role-cancel-audit-proof.json；`reviews/2b5f9e2/distribution-delta/review.json`；`integration-review/security-audit-evidence-review.json`。逐场景来源与剩余外部输入以综合账目为准。

仅剩外部输入：真实NyxID环境与app/service注册、角色／委托／精确连接批准；平台有权账号与具体内容／动作写入授权；目标域名／HTTPS／容量、具名付款／运维／访问审批／监控维护责任、隐私保留／备份异地策略及数值RPO/RTO和目标验证；Git远端访问。原任务10:59Z只读检查仍Repository not found，未push／merge。

短资源窗口已结束：原任务review App／Ghost／identity均停止，全卷／keys／证据保留；dev8与baseline4已由原任务恢复并验证healthy。本任务仅同步文档，不操作环境、不重复测试；后续等待外部输入或新的具体缺陷。
