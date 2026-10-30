# API 使用指南

同一用例在 `/api/cms` 与 `/api/service` 可用；服务器每次按真实 owner 与实时权限判断。完整操作、参数和响应见运行实例 `/openapi.json`。CMS 需 OIDC cookie，写入另需 `/me` 返回的 CSRF；service 使用已验证的人类 Bearer access token 或 NyxID 签名 identity+delegation。不要在 shell 历史中粘贴真实 token。

## 内容到原文

1. `/me` 取得可访问 workspace 与当前 canPublish；`GET /articles?ownerId=...&q=...` 搜索有权 revision。
2. `POST /articles` 创建，或 `POST /articles/import?ownerId=...&language=en&title=...&creditedAuthor=...` 用 `Content-Type:text/markdown` 原始 UTF-8 bytes 导入。BOM/CRLF 保留；非法 UTF-8 拒绝。
3. `PATCH /articles/:id` 必带 expectedRevision；旧版本返回409。文件替换也可用 `PUT /articles/:id/markdown?expectedRevision=...`。`GET .../markdown?revision=...` 下载指定原文，不从 HTML 反推。
4. `POST .../assets` 上传 MIME+base64，保存返回的 asset 引用；预览和私有下载仍鉴权。`POST .../submit` 固定 revisionId，不自动发布。
5. `POST .../releases` 明确 ownerId/revisionId/creditedAuthor/action/rightsConfirmed/idempotencyKey；普通组织成员没有发布权限。Worker 核验正文、作者、owner、语言和图片后才 published。
6. 查询 `/articles/:id/releases`，queued 可 cancel；verifying/uncertain 使用 `/releases/:id/reconcile`，不新建重发来绕过未知结果。update/unpublish 仍是独立确认动作。

`GET /articles/:id/preview?revision=...`可预览指定的有权历史修订；省略revision时使用调用人当前可见版本。参数不扩大私人草稿／素材的访问范围。渲染时仅处理首个编码BOM，存储和下载仍保留原始字节。

## NyxID MCP 原始文件交付

MCP `downloadMarkdown`使用`GET /api/service/articles/:id/markdown-file?revision=...`，返回application/json文件封装：`articleId`、`revisionId`、`filename=article.md`、`mediaType=text/markdown`、`encoding=base64`、`byteLength`、`sha256`、`data`。`data`是原始UTF-8文件字节的标准base64，包含BOM及原始换行。调用方须解码、核对长度与SHA-256后写出`.md`文件；MCP text中的JSON是传输封装，不能把JSON或渲染后的Markdown当作原始文件。

在NyxID通过`nyx__search_tools`重新发现`<service-slug>__downloadmarkdown`，再以`nyx__call_tool`传`arguments_json`（包含文章`id`和必需的`revision`）。将返回text中的JSON对象保存为`envelope.json`，可按下例输出原始文件；输出路径显式指定，已有文件不会被覆盖：

```sh
node --input-type=module - envelope.json original.md <<'JS'
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const file=JSON.parse(await readFile(process.argv[2],'utf8'));
assert.equal(file.encoding,'base64');
assert.equal(file.mediaType,'text/markdown');
const bytes=Buffer.from(file.data,'base64');
assert.equal(bytes.toString('base64'),file.data);
assert.equal(bytes.length,file.byteLength);
assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
await writeFile(process.argv[3],bytes,{flag:'wx',mode:0o600});
JS
```

CMS及直接HTTP的`GET /api/{cms|service}/articles/:id/markdown?revision=...`继续返回原始attachment，不改变旧路径；新`markdown-file`接口也在两个入口共用同一revision可见性授权。更新服务后必须重新导入／发现OpenAPI端点：operationId保持`downloadMarkdown`，路径从`/markdown`迁至`/markdown-file`，操作总数仍34。旧catalog会继续取得可能丢BOM的MCP text，不能据此宣称保真。直接HTTP兼容路径不再作为MCP下载操作登记。真实验证边界见 [I19](review-i19.md)。

## 成功响应契约

`/openapi.json`逐操作声明实际成功状态、顶层JSON类型与媒体类型。对象响应允许具体用例字段；调用方应读取返回的state，不将202解释为已发布。

| 操作 | 成功状态 | 响应 |
|---|---|---|
| createArticle、importMarkdownFile、uploadPrivateImage | 201 | application/json object |
| confirmOriginal、confirmDistribution | 202 | application/json object；后续可能等待批准、worker、公开核验或人工处理 |
| listArticles、listRevisions、listOriginals、listDestinations、listOwnerConnections、listDistribution、readAudit、getPublishedAlternatesStatus | 200 | application/json array，元素为object；空列表为[] |
| downloadMarkdown | 200 | application/json文件封装；base64解码并核对byteLength／sha256后得到指定revision的原始.md字节 |
| getPrivateImage | 200 | image/png、image/jpeg、image/gif或image/webp原始二进制字节，按Content-Type解码 |
| 其他操作 | 200 | application/json object |

译文各自文章、各自发布；`POST /articles/:id/translation` 指定 sourceArticleId/sourceRevisionId。源文更新只标记过期。已发布关系冻结，投影异步同步 hreflang 和可见导航；通过 link-status 查看、sync-links 重试。

## 分发与指标

`GET /targets`、`GET /owners/:id/connections` 列出当前 owner 的目标和精确连接。`POST /releases/:id/deliveries` 选择 target/connectionId/create|update|remove/full|excerpt/rightsConfirmed/idempotencyKey；纠错和移除需 copyId。当前自动只启用英文；个人 DEV、组织 DEV/Hashnode。原文未核验公开时不能创建／更新副本。

CMS“分发与副本管理”中，每条分发记录保留当前状态与公开链接，并可展开“状态历史”按API顺序查看各次状态、事件时间及存在的诊断码／Trace ID；同一目的地的多条记录各自保留历史。service返回同一history，历史中的submitted／reviewing不代表已published。

组织自动写需 native exact request/authorize；个人不额外加组织批准。`GET /articles/:id/deliveries` 返回各目标独立状态／URL／历史。cancel 仅阻止未发送；uncertain 先 reconcile。辅助目标通过 package 准备材料，通过 report 分开记录 submitted/reviewing/rejected/manual_action_needed/published/removed；公开链接与来源可读核验后才记 published，人工回报不能证明平台 editorial acceptance 的全部过程。removed仅允许已确认的remove动作，必须保留known copy remote ID与精确URL并核验该URL为404/410；可省略url使用已记录地址，传入时必须与已知地址相同。原文下线不禁止移除。

`GET /metrics?ownerId=...&from=YYYY-MM-DD&to=...&article=...&language=...&destination=ghost` 返回 PV、每日估算 UV、热门、趋势、来源与分发。外部支持目标先 `POST /deliveries/:id/metrics/refresh`；缺失授权或数据为 Unavailable/null，不能填0。外部是累计计数快照，日期选择采集时间，不冒充区间流量；不计算跨平台唯一人数。

每个错误含 code/message/traceId，HTTP响应有 x-trace-id。遇到409需读取当前状态和修订后重新确认；遇到 unknown effect 不自动重复发送。角色管理仅当前组织 Admin 可用，业务账号没有 Ghost Admin 权限。

分发状态日期以该 delivery 的确认创建时间（UTC，d.created_at）筛选；Ghost 原文状态以原文确认时间（r.created_at）筛选。它们不是按状态变更的事件时间过滤。外部counter仍按snapshot采集时间过滤，各口径随响应dateBasis/coverage返回。

辅助公开核验要求唯一可见article、匹配h1、已准备的正文/摘要、可见Author与准确Original锚点和图片。无法可靠定位内容、被遮蔽或格式不同到无法证明时返回PUBLICATION_UNVERIFIED，保留人工待核状态；不能据此保证编辑部接受。采集写入失败记coverage gap，所选owner/文章/语言/日期内总量为Unavailable而非零，后续成功不抹去历史缺口。

译文纠正的`link-status`记录包含`attempts`和`next_attempt_at`。`retry_wait`表示保留纠正职责并等待指数退避；第6次自动失败或终止错误进入`manual_action_needed`。排障后使用当前授权调用`POST /api/{entry}/articles/:id/sync-links`重新同步，再验证公开链接；paused期间不会执行metadata写入。
