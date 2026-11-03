# I19 R034 MCP 原始 Markdown 文件交付

业务修复：`041865217bb876b4d885a88a1e1344cb11af4345`。**R034/P1（A08/A17、D2/D4）已在0418652／98bac5b独立有界CLOSED**，见[独立汇总](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/0418652/review.json)。独立155既有测试及23组／249 HTTP通过；实际官方MCP保存／读回七个.md（含修复前旧稿）、中英BOM／无BOM及LF／CRLF、旧／新revision、stale409和实际跨用户403通过，六次精确本地批准，原raw CMS字节一致，见[实际复验](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/0418652/actual-nyxid/R034-retest.json)。原问题及Trace／批准ID见[R034独立报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/4a27487/actual-nyxid/R034.json)：4a27487在实际官方NyxID MCP导入中文BOM＋CRLF原稿60字节，同token直接HTTP下载60字节及SHA保持，MCP仅返回57字节text，丢失UTF-8 BOM。原稿存储及上传没有损坏。

## 目标、方案与契约

目标是NyxID调用人直接取得可还原的原始`.md`文件，保留中英UTF-8 BOM、LF／CRLF及指定不可变revision。保留CMS和直接HTTP原始下载、当前权限及冲突保护；不改官方NyxID源码、MCP实现、账号角色或审批策略，不返回CMS链接代替文件。

官方0.75.0固定源码38bae2f的`mcp_service.rs`约6377–6405对图片使用bytes，其余响应使用charset-aware `response.text()`；实际`binary_artifact=true`没有生成Markdown文件。仅修改MIME或再声明binary不能证明保真。选择新增JSON文件封装，因为base64使用ASCII，可以通过现有MCP text传输而不受BOM解码影响，并能在调用方核验完整性；代价是体积约增加三分之一，调用方须显式解码保存。没有声称NyxID已支持原生文件附件或自动下载。

新增`GET /api/{cms|service}/articles/:id/markdown-file?revision=...`，返回application/json：

| 字段 | 契约 |
| --- | --- |
| articleId、revisionId | 本次授权并读取的文章及必需指定revision |
| filename、mediaType | `article.md`、`text/markdown` |
| encoding、data | `base64`与原始UTF-8文件字节的标准base64 |
| byteLength、sha256 | 原始文件字节数与小写hex SHA-256 |

必须将`data`解码为bytes，核对长度／SHA后写出`.md`；不能保存JSON封装或normalized text作为原文件。[API指南](api-guide.md#nyxid-mcp-原始文件交付)提供可执行解码命令。文件名为既有下载的通用文件名，不从用户标题构造路径。

业务层`ContentService.markdownFile`复用`markdown`及`visibleRevision`，取得已授权bytes后序列化文件；控制层仅验证必需revision并调用业务层，没有重复实现可见性或绕过owner检查。沿用统一异常／Trace机制，无schema、secret或第三方服务配置变化；序列化与hash为O(n)，文件仍受既有2 MB原始大小限制。

OpenAPI保留operationId `downloadMarkdown`，改指`/markdown-file`且revision必填，声明明确的JSON字段／base64编码。目录仍34操作，需要部署后重新导入／发现；旧catalog仍会调用`/markdown`并产生有损MCP text。兼容的`/api/{cms|service}/articles/:id/markdown?revision=...`继续返回原始attachment，未删除或改变旧HTTP行为，但不再把该路径登记为MCP下载操作。现有业务权限与调用scope未改变。

## TDD 与开发验证

`test/markdown-file.test.ts`先red，随后八组中英 × BOM有无 × LF／CRLF通过。测试以实际`Response.text()`模拟NyxID读取JSON的边界，解码比对原始bytes与SHA；两个入口的原始下载仍逐字节一致。后续修订不改变旧revision；stale替换409、缺revision400、跨owner403及Admin读取他人成员私稿403。调整`test/openapi.test.ts`使实际成功响应与新目录契约对应，图片二进制契约保留。

相关 **19/19**、strict TypeScript及全量 **155/155** 通过。证据目录为本工作树`.runtime/r034-mcp/`：`red.log`、`focused.log`、`check.log`。首次全检仅新测试的Buffer／DOM BodyInit类型不兼容导致typecheck失败，改为Uint8Array后通过；未放宽生产类型或内容检查。

## 真实官方 MCP 验证

仅重启自己的App3437至业务修复，并用原独立client／catalog service／UserService执行官方端点重新发现；`discovery.json`显示34操作，`downloadmarkdown`路径为`/api/service/articles/{id}/markdown-file`、响应application/json且revision必填。实际OAuth Code＋PKCE、精确服务resource consent和`/mcp`协议2025-03-26；通过`nyx__search_tools`发现、`nyx__call_tool`执行，没有绕过MCP直接调用业务冒充成功。

`actual.mjs`按中英 × BOM有无 × LF／CRLF八组，经MCP base64上传真实私稿，读取文件封装并实际解码写出`.md`，再从文件系统读回核对原bytes及SHA。逐组核对同源CMS原始下载、同OAuth token的service HTTP原始下载；再经MCP文件替换生成后续revision，下载旧／新revision，实际stale替换409后再次下载确认内容未变。另一真实用户仅在自己的3437通过CMS创建个人私稿，原MCP调用人及其CMS两种下载均403；没有修改角色／Publisher或跨owner读取私稿内容。

每个MCP非GET仅经官方审批API批准本任务精确service／method／resource的新pending请求；不建立durable或通配grant。实际八组共32个解码落盘.md核对通过，24次精确批准、61次MCP HTTP记录；最终结果见`integration-result.json`、`actual.log`，解码原稿及旧／当前revision文件在private目录，未提交Git。该证据限官方本地NyxID及本任务3437，不代表目标生产注册、门户Launch入口或真实外部provider发文验收。

最初两轮harness尝试相同配置PUT，被官方返回400“无更新字段”；后改为核对既有配置并直接discover。第三轮解析SSE误把`event: message`当JSON，修正为读取`data:`后继续；失败输出保留`actual-attempt1.log`至`actual-attempt3.log`，未改业务代码或上游实现。

## 部署、回滚与验收边界

先升级App至业务SHA，再重新导入／发现当前OpenAPI并检查`downloadmarkdown`的路径／描述／required revision；调用方按文件封装解码、验hash并保存。无schema／数据迁移；回滚代码同时恢复旧目录时，CMS／直接HTTP原始下载仍可用，但MCP保真文件能力恢复为未通过，不能继续声称R034已修复。已存原稿和所有不可变revision保留。

本轮不启动Worker、不创建发布任务，无Ghost／provider网络出站；自己的App3437验证后停止，源DB保持outbound_paused=true、queued release=0，私稿／修订及文件证据保留。未创建临时key。private目录0700、文件0600；不打印或提交token／cookie／Actor。`cleanup.json`与`document-verification.json`／`source-fingerprint.json`记录清理及固定业务SHA核查；正式验收第1节起9750字节与source／phase0／baseline保持原文。

R034已由root独立有界关闭；后续实际NyxID＋四Ghost联合验收的指定分支与未完成边界另见 [I20](review-i20.md)；[R033](review-i18.md)已独立有界关闭，不重开；R031完整key/child能力仍OPEN/BLOCKED上游。A01/D1普通用户门户Launch入口另有[root只读确认的上游契约缺口](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/4a27487/portal-contract-review.json)，注册homepage或管理员可见不能作为通过。完整D1–D9／A01–A52及Live未签收，当前状态以[root台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)为准。
