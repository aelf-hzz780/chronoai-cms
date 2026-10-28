# NyxID 注册与连接交接

实现依据：官方源码 revision `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`。这是可执行对接清单，当前没有目标 NyxID Live 注册或外部账号发文证据。

## 注册输入

1. OIDC confidential client：准确登记 `https://<cms-host>/auth/callback`，启用 Authorization Code + PKCE S256；登记实际 client ID/secret。issuer 是 discovery 声明的标识，允许字面 `nyxid`，不可擅自把 issuer 改成 API URL。
2. `NYXID_API_URL`、`NYXID_DISCOVERY_URL`、`NYXID_INTROSPECTION_URL` 使用实例真实 HTTPS endpoint。`NYXID_TOKEN_AUDIENCE` 是 delegated access token audience；`NYXID_CMS_AUDIENCE` 是 CMS access token audience；`NYXID_SERVICE_AUDIENCE` 是签名 identity assertion 的服务 audience。不能相互猜测替代。
3. 注册平台 service：填写真实 `NYXID_SERVICE_ID` / `NYXID_SERVICE_SLUG`，导入 `/openapi.json` 中 `/api/service/*` 操作。转发原生 `X-NyxID-Identity-Token` 和 `X-NyxID-Delegation-Token`；同时验证签名、issuer、audience、同一 sub、60秒 identity TTL、service id、delegated、act.sub 和 scope。
4. `NYXID_OAUTH_SCOPES` 必须是实例实际授予的 scope。平台用例为 `content:read/content:write/publish/metrics:read/roles:write/connections:read`。如上游名称不同，明确设置 `NYXID_OPERATION_SCOPES_JSON`，每个 operation 映射一个非空 required-scope 数组，全部满足才授予；省略时逐字匹配。不得把缺失 scope 映射为通配权限。
5. 配置测试用户：无组织、普通 Member、Admin、指定 Publisher、多组织、离组与撤权；分别从 CMS 和 service 验证。组织来源是 `/api/v1/orgs` 实时 `your_role`；Viewer 不获得 Member 权利。Publisher 只是本平台组织发布能力，由当前 Admin 管理。

## 精确连接绑定

复制 `infra/platform/nyxid-connections.example.json` 到私有配置目录，填写来自 NyxID `/api/v1/user-services` 的 **UserService.id**，不是 service definition id。每个 owner×destination 精确一条可选连接，写出 issuer、subject、credential source、slug、provider account ID，以及 DEV organization ID 或 Hashnode publication ID／Pro／权限。provider secrets 只保存在 NyxID。

组织绑定必须返回 `credential_source.type=org`、相同 org_id、allowed=true；个人必须 type=personal 且相同调用人。绑定变更、服务 state_version/updated_at 变化都会改变 connection fingerprint。发送前再次读取；不允许从组织连接退回个人账号或供应商直连。proxy 的 `_nyxid_via` 由服务端指定 exact UserService.id。

Hashnode 填写 `target:hashnode`、官方 `https://gql-beta.hashnode.com`、publicationId、accountId、pro=true 和真实可发布权限；仅启用组织 publication。Medium/HackerNoon 保留辅助流程，不伪造自动发文能力。服务下线用 feature flag，已知副本保留人工跟进。

## 组织外部写入批准

1. 确认精确 release、全文／摘要、图片、目标 connection、create/update/remove，冻结 delivery payload。
2. 请求 `/deliveries/:id/request-approval`。人类 token 从 `/api/v1/mcp/config` discovery 读取契约；delegated token 从 `/api/v1/delegation/operation-catalog` 读取。建立 native `/api/v1/approvals/exact-service/requests`。
3. NyxID 当前 Admin 在 NyxID 核对实际 request、operation digest、catalog/generation、幂等 key 后批准。通用 grant 不替代 PerRequest exact approval；不满足实例策略会明确失败。
4. 关联引用 `/deliveries/:id/authorize`。Worker 重验当前角色、原文公开状态、connection fingerprint、批准和请求 digest。
5. native redeem **本身执行写入**，读取并验证 receipt response_digest；不再追加普通 proxy 写入。中断或未知结果进入 uncertain，后续只读对账。

Live 必须保存注册导出（脱敏）、Trace ID、调用角色、scope、精确批准与 receipt 关联、四 Ghost/外部页面证据。不能保存 token、cookie、provider secret 或完整授权头。缺少目标实例、账号、订阅或明确发文授权时，保持 BLOCKED。
