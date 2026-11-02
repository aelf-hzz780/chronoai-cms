# 最终版本的本地 NyxID 注册与发现复验

本目录绑定 BlogSystem `386b9652dc431bb83e4864d5b046b378110ee88d` 与 NyxID 本地补丁 `049ee1c2ca811a002590dc8330ce646078bb1158`。`report.json` 给出结果与边界，`manifest.json` 校验本目录文件；证据均使用相对路径。NyxID 不是未修改的 upstream `38bae2f`。服务注册是独立测试注册，完成后已停用，不能作为正在提供服务的生产注册使用。

## 前提与隔离

1. 使用上述 Blog commit 的新源码副本，安装 lockfile 对应依赖，Node `24.18.0`。运行真实 `src/main.ts`，使用独立 SQLite、media、connections 文件及新随机加密/跟踪密钥；不启动 worker。源码执行前后按 `source-lock.json` 校验。本次检查了 133 个文件。
2. 使用经审查且当前运行的 NyxID `049ee1c`。本次 native binary 与运行副本 SHA-256 为 `37bbb047eef49e460bde3b8acb669bcecafe1439aec1d05565a0813e1e41a7e1`；不要仅凭 `/health` 的版本字符串推断源码。
3. 新建测试用户、confidential client、catalog service 与个人 UserService。所有操作只指向这次新建的 ID。复跑应换用新的用户名和唯一 slug，不能重新启用本轮已撤销的 key 或修改现有 CMS 注册。
4. 本次 App 使用 `http://localhost:3560`，NyxID 使用 `http://localhost:3001`。显式设置 `HOST=127.0.0.1`、`PORT=3560` 与 `PUBLIC_URL=http://localhost:3560`；容器或relay场景须按实际网络将监听端口映射到PUBLIC_URL的外部端口。仅设置PUBLIC_URL不会修改监听端口，源码未设置PORT时默认3100。端口、issuer、audience 和 callback 均需按实际目标填写；仅本地 HTTP 使用 `ALLOW_LOOPBACK_HTTP=true`。生产 HTTPS 与运营输入另行验收。

## 注册次序与精确请求

通过 NyxID 官方 API 完成以下步骤；管理 token、client secret、用户凭据和 API key 只留在权限 `0600` 的私有配置中，不打印或提交。

1. `POST /api/v1/admin/oauth-clients`：`client_type=confidential`、`redirect_uris=["<app-origin>/auth/callback"]`、`allowed_scopes=["openid","profile","proxy"]`。读回 callback 与 scope。实际 readback 的 `allowed_scopes` 是空格分隔字符串，比较时按集合处理。CMS 自身使用 Authorization Code、state、nonce 与 PKCE S256；本轮不把 client readback 中不存在的 `require_pkce` 字段宣称为已验证配置。
2. `POST /api/v1/services`：`name`、唯一 `slug`、`base_url=<app-origin>`、`auth_method=none`、`service_category=internal`、`visibility=public`。`public` 是本次本地 catalog 可见性，不能照搬为生产授权决策。
3. `PUT /api/v1/services/{catalog-id}` 设置 `identity_propagation_mode=jwt`、`identity_jwt_audience=<service-slug>`、`identity_include_user_id=true`、`inject_delegation_token=true`、`delegation_token_scope="account:read proxy:*"`、`introspection_client_ids=["<confidential-client-id>"]`、`homepage_url=<app-origin>/auth/login`。官方 GET 读回一致后再运行 App。
4. 启动真实 App，读取 `/openapi.json`。`PUT /api/v1/services/{catalog-id}` 同时提交 `openapi_spec_url=<app-origin>/openapi.json` 和一段真实 `description`。本地049仅更新 spec URL 时返回400“至少一个字段”，同时提交 description 的操作已成功；保留该限制，不需修改 NyxID 源码。
5. `POST /api/v1/services/{catalog-id}/discover-endpoints`，随后 `GET /api/v1/services/{catalog-id}/endpoints`。比较完整 `(normalized name, method, path)` 集合与真实 OpenAPI。当前为35项；数量是这一版的事实，不是产品需求。
6. 以新用户 `POST /api/v1/keys` 建立 `service_slug=<service-slug>` 的独立个人连接，使用相同 JWT identity/audience/delegation 配置。这里返回的 `id` 是 UserService ID，不能与 catalog ID 混用。设置 `/api/v1/approvals/service-configs/{user-service-id}` 为 `approval_required=true, approval_mode=per_request`。
7. 为该用户新建 `POST /api/v1/api-keys`，`scopes="proxy"`，`allowed_service_ids=["<exact-user-service-id>"]`，`allowed_node_ids=[]`，`allow_all_services=false`，`allow_auto_connected_services=false`，`allow_all_nodes=false`。

## App 的无密钥配置交接

`configuration.example.json` 区分 CMS access audience、delegation audience 与 identity service audience。实际 issuer 必须来自 discovery，不能从端口猜测；本地三者中的前两者恰好均为 `http://localhost:3001` 不代表所有部署相同。

CMS 的 `openid profile` 仅授予读取；本次写入能力映射需显式 `proxy`。service 的只读 baseline 是 `account:read`，额外能力是 `account:read` 与 `proxy:*` 同时满足。它们不是所有上游都提供的细粒度业务 scope。scope 不替代当前 owner、组织权限、精确连接或批准。专用 `X-NyxID-Command-Authority` 是049本地协议的一部分；本轮发现检查不代替新写命令来源撤权检查。

## 真实发现与最小调用

1. 新用户读取 `GET /api/v1/mcp/config`，只选择对应的 UserService，比较全部35个 endpoint。
2. `POST /mcp`，使用 `X-API-Key: <fresh-exact-key>`、`Accept: application/json, text/event-stream`、`MCP-Protocol-Version: 2025-03-26`。依次执行 `initialize`、`notifications/initialized`、`tools/list`。该 API-key 路径是 stateless，initialize 没有返回 MCP session header；不要假定必须存在。
3. 比较所有 `<slug>__<normalized-operation-name>` 工具集合。`nyx__search_tools` 可补查，但本轮即使请求 limit100，实际只返回25项，不能将 search 上限误记为操作丢失。
4. 调用 `nyx__call_tool`，参数为 `{"tool_name":"<slug>__getworkspaces","arguments_json":"{}"}`。保留原批准策略；通过新用户的 `/api/v1/approvals/requests` 找到**此次**新产生、精确 slug、`GET /api/service/me` 的请求，再对该 request ID 执行 `POST .../{id}/decide {"approved":true}`。核对返回 subject 等于新用户且含本人 personal workspace。
5. 原始 API key 放在 `Authorization: Bearer` 时，本地 MCP 返回403；`X-API-Key` 通过。本轮只验证这一精确路径，不扩展为所有凭证或 transport。

`downloadMarkdown` 必须导入为 `/articles/{id}/markdown-file` 的 `application/json` 响应，`revision` 必填。客户端解码 base64 后校验 byteLength/SHA-256 再保存 `.md`。`materializeOriginalMedia` 必须保留 `ownerId/revisionId/rightsConfirmed/idempotencyKey` 四个必填字段。本轮验证导入 schema；35项操作的执行并未全部经 MCP 重跑。原始二进制私有图片和 REST 能力不因本轮 MCP 发现而被宣称全部通过。

MCP `tools/list` 的名称集合与必填结构完整，但 Nyx schema 生成器简化了 `listArticles.limit` 的 `minimum=1/maximum=100` 和 `offset` 的 `minimum=0`，仅保留整数类型；Admin endpoint 和 MCP config 保留这些约束。固定 Blog `src/content.ts:88` 仍在运行时验证 `limit` 为1–100整数、`offset` 为非负整数。不将35项工具集合一致表述为每个 JSON schema 字段等价。

本地 `GET /api/v1/catalog/{slug}/endpoints` 动态抓取 loopback spec 会被 SSRF 策略拒绝400。Admin 触发的 OpenAPI 抓取/解析导入（`POST discover-endpoints {}`）成功，持久化 MCP config/tools/list 可用。真实目标的公开 spec URL 仍需对应环境检查，不把该目标检查降为 N/A。

## 清理与证据边界

按精确 ID 撤销本次 API key，停用本次 UserService/catalog/client/user；client 使用 `PATCH /api/v1/admin/oauth-clients/{id}`。确认 key 再次 MCP initialize 返回401，catalog/client/user inactive。仅终止本次 App PID并核对3560关闭，私有 SQLite保留审计，不动现有3457、NyxID、Ghost、baseline或任何Mongo数据。

attempt03 的抓取失败源于隔离 Node 随启动外壳退出而停止；以独立进程会话重启后，同一个 `POST discover-endpoints {}` 成功。这与用户 catalog 动态抓取的 SSRF400 是两个不同原因，没有跳过 OpenAPI parser 手工构造35个 endpoint。

`attempt-*.json` 和 `supplementary-probe-corrections.json` 保留 harness兼容性、HTTP400、MCP头部、stateless初始化与search上限的失败/修正。最终 `report.json` 根据保存的实际响应集合和source hashes重新计算；cleanup阶段覆盖过早期汇总的事实也已记录。私有数据库、用户样本、raw token/Cookie、key、client secret及完整环境不在本包，不能声称本包包含全量公开原始数据。

Document完成注册交接；Local完成本机真实注册/导入/发现和一个受批准的读取。生产/外部账号及D1–D9整体Live验收仍未完成。
