# I11 分发历史与文档入口（开发记录）

R025业务源码：`2b5f9e2b94355fff4a760f5fec79a4dbebe60a35`，关联D7、A35/A39；R026文档：`557518dfcad933135fd0616ba110606688e3b258`，关联D9、A52。两项独立专项复验待返回，不提升正式D1–D9／A01–A52签收或Live状态。

## R025：逐条分发历史可检查

固定74978bc的API已返回每条delivery的history，CMS却只显示当前state、原始created_at、error和url。修复仅在状态列表的每条记录下增加可展开的“状态历史”，按API事件顺序显示state、created_at，以及存在的诊断code和trace_id。每条记录独立渲染，原当前状态、HTTP(S)链接和release／delivery／copy选择器不变。采用createElement、textContent和text node，不解析事件字段中的HTML；API、授权和生命周期逻辑没有修改。

原独立probe重绑当前开发树并增加断言，先在旧UI复现历史缺失，再在修复UI通过；固定2b5f9e2再次运行通过。实际Fastify／DistributionService＋Chrome按CMS记录submitted→reviewing→rejected，4条历史全部可检查；扩展第二个目的地的诊断事件，逐项对照事件数量、state、时间、code与Trace，HTML诊断仅显示文字且没有创建img；原链接、当前delivery和known-copy选择器仍正确。原文、身份、连接为明确的Local fixture前置条件，providerCalls=0，不是Live Medium／HackerNoon验收。

证据在开发树Git忽略的`.runtime/r025-history/`：probe.mjs、red.log、green.log、fixed-sha.log、probe-result.json和history-rendered.png。node --check与git diff --check通过。本次UI改动未重复无变化的后端81项suite；此前81项独立全检仍只对应74978bc。

## R026：当前实现与证据导航

README移除当前仍为phase0／CMS及service、分发、指标未实现的过时断言，介绍已实现模块和有界Local证据，提供运行、API、NyxID、运维、交付台账、验收矩阵和最新独立Local恢复入口。acceptance首段提供当前证据导航，dev／ops补文档互链、Chromium依赖和749恢复证据。phase0及迁移双站复验保留为历史，不将Local身份fixture、provider契约或模板升级为Live／生产证据。

41条本地文档链接检查通过；acceptance从“1. 交付追踪”起与a96f8d2逐字节一致，docs/source的两份v0.7原文和manifest也完全不变。文档检查记录`.runtime/r026-doc-links.json`。本项无需后端测试。

## 环境与剩余验收

dev八容器和baseline四容器已由原任务恢复healthy；本任务未操作root source／restore、dev或Ghost环境，没有外发、push或重做四Ghost恢复。R001–R024历史已登记问题有界关闭（R021非门禁）；R025/R026等待独立复验。A50非空delivery恢复补证由原任务负责，完整角色／入口／时序分支核算、真实NyxID／provider／目标部署、运行责任、保留策略与约定RPO/RTO仍保持原未签收边界。
