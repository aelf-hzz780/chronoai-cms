# I13 CMS状态反馈刷新（开发记录）

R028修复源码：`804e7c49bc9b6e6a6d1b17f55325a5e3d885a322`；关联D7、A35/A38。开发定点6/6通过，独立专项待返回，完整D/A及Live未整体签收。

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

已将固定SHA与有界范围交回原独立验收任务，尚不自行关闭R028。R027已按独立7/7及strict报告关闭。未操作Docker、root/dev、3398/3399或相关验收端口；无真实Ghost/provider访问，未push。正式D1–D9/A01–A52、目标身份与provider、生产部署／责任／RPO/RTO继续保留未签收边界。
