# NyxID 注册与连接交接

实现依据：官方源码 revision `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`。官方0.75.0已在真实本地自托管实例联调；开发结果见[I14](review-i14.md)，固定76595bc的R029／R030独立有界闭合及剩余原生验收见[I15](review-i15.md#独立有界闭合2026-10-30)。该证据不是目标生产NyxID或外部账号发文签收。

R031尚OPEN：普通service delegation的active状态不能证明原API key仍存在或仍有当前服务范围。现有原keyintrospection与read request-proof各有明确适用边界，不能替代逐请求批准的pending写来源校验；`abfb988`已加入临时fail-closed保护，缺可验证lineage的propagated发布路径（包括仍有效key）保守拒绝，返回403 SOURCE_AUTHORITY_UNPROVEN并保留原稿；读取／草稿／取消继续使用现有权限。带真实签名OAuth lineage的service及当前有效CMS／直接OAuth client可按原约束执行。完整key/child能力仍BLOCKED上游；真实正反控、保守影响与部署／回滚见 [I17](review-i17.md)，历史研究见 [I16](review-i16.md)。

OAuth service调用需通过官方consent授予精确UserService／resource；仅取得proxy scope不足以访问未授权服务。普通consent review会合并scopes，较小scope登录不代表撤权；I17采用官方撤旧consent后重新授较小scope，并核对旧队列仍被阻断。所有App／Worker须一起升级，回滚期间暂停外发，不自动恢复旧blocked任务。

R033只读恢复修复已在业务源码4a27487独立有界关闭，见 [I18](review-i18.md)。uncertain对账按当前合法Admin／owner的access授权，不要求原确认credential仍有效；当前scope、owner／组织发布权限和精确连接绑定仍须成立。恢复只查询既有远端结果，beforeWrite禁止重发；原Actor密文和Trace保持。恢复请求调用人失权也必须阻断，不能用新恢复身份替换旧任务的新写授权。新确认／queued外发继续执行R031来源保护。

## 注册输入

1. OIDC confidential client：准确登记 `https://<cms-host>/auth/callback`，启用 Authorization Code + PKCE S256；登记实际 client ID/secret。issuer 是 discovery 声明的标识，允许字面 `nyxid`，不可擅自把 issuer 改成 API URL。
2. `NYXID_API_URL`、`NYXID_DISCOVERY_URL`、`NYXID_INTROSPECTION_URL` 使用实例真实 HTTPS endpoint。`NYXID_TOKEN_AUDIENCE` 是 delegated access token audience；`NYXID_CMS_AUDIENCE` 是 CMS access token audience；`NYXID_SERVICE_AUDIENCE` 是签名 identity assertion 的服务 audience。不能相互猜测替代。
3. 注册平台 service：填写真实 `NYXID_SERVICE_ID` / `NYXID_SERVICE_SLUG`，导入 `/openapi.json` 中 `/api/service/*` 操作。转发原生 `X-NyxID-Identity-Token` 和 `X-NyxID-Delegation-Token`；同时验证签名、issuer、audience、同一 sub、60秒 identity TTL、service id、delegated、act.sub 和 scope。
4. 使用下述分入口capability映射。官方0.75.0的OIDC白名单不接受`content:read`等平台capability名称，不能将其登记为OAuth scope。默认只申请`openid profile`且仅映射读取；额外能力必须明确配置并取得相应上游scope授权。
5. 配置测试用户：无组织、普通 Member、Admin、指定 Publisher、多组织、离组与撤权；分别从 CMS 和 service 验证。组织来源是 `/api/v1/orgs` 实时 `your_role`；Viewer 不获得 Member 权利。Publisher 只是本平台组织发布能力，由当前 Admin 管理。

导入契约时保留各operation的201／202／200成功状态及JSON object／array／原始二进制媒体声明；私有图片按实际Content-Type处理，不能强制按JSON解码。preview的可选revision参数及report的removed枚举均应保留，removed仍受已确认remove动作和精确已知URL404／410核验约束。具体操作响应见api-guide.md；目标NyxID的OpenAPI导入兼容性仍需真实注册与脱敏导出验证，不能由本机契约测试代替。

R034修复将34操作中的`downloadMarkdown`迁至`/api/service/articles/{id}/markdown-file`，返回明确的base64 JSON文件封装；调用方按`encoding`解码`data`并核对`byteLength`／`sha256`，实际保存原始`.md`。必须重新导入／发现当前OpenAPI，确认该操作为application/json且revision必填；旧`binary_artifact`标记和仅改MIME不能解决官方MCP的文本解码损失。直接HTTP与CMS的原`/markdown`下载保留，文件封装仍执行同一当前权限与不可变revision检查。解码示例见 [API指南](api-guide.md#nyxid-mcp-原始文件交付)，开发验证与限制见 [I19](review-i19.md)。

普通用户门户入口仍有独立上游缺口：官方38bae2f的普通`/keys`分组不渲染homepage，`/services`只对catalog／tools／admin-read开放且Homepage仅复制文本；OIDC provider、Authorized／Developer Apps均不能据此提供普通用户Launch入口。不能伪造provider关系或把管理员可见注册项当作A01/D1入口通过，见[root只读门户报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/4a27487/portal-contract-review.json)。

## 官方0.75.0的分入口权限配置

CMS OIDC与service注入的delegation使用不同scope集合，必须分别映射。`NYXID_CMS_CAPABILITY_SCOPES_JSON`和`NYXID_SERVICE_CAPABILITY_SCOPES_JSON`的key是下表6个capability，**不是operationId**；value为该入口必须全部具备的非空上游scope数组。缺key即无该能力，不支持通配。`NYXID_OPERATION_SCOPES_JSON`作为旧全局配置保留，不能和分入口配置混用；迁移时先清空旧项。未知key、空scope或以openid/profile/email/roles/groups/offline_access单独授予额外能力会在启动时拒绝。

| 平台capability | CMS身份只读默认 | CMS额外能力显式配置 | service只读默认 | service额外能力显式配置 |
| --- | --- | --- | --- | --- |
| content:read | profile | profile | account:read | account:read |
| content:write | 无 | proxy | 无 | account:read + proxy:* |
| publish | 无 | proxy | 无 | account:read + proxy:* |
| metrics:read | 无 | proxy | 无 | account:read + proxy:* |
| roles:write | 无 | proxy | 无 | account:read + proxy:* |
| connections:read | 无 | proxy | 无 | account:read + proxy:* |

上表是本平台对官方可用scope的显式能力解释，不宣称NyxID提供六个同名细粒度scope。只配置实际需要的key；例如编辑但不能发布，仅增加content:write。profile单独不授予写入；proxy也不替代owner、当前组织Member/Admin、Publisher或组织出站精确批准。CMS用户明确同意额外proxy scope后，本平台仍按配置及业务策略授权；NyxID的服务选择、凭证资源范围和审批策略继续约束其上游调用。

可写CMS配置示例（仅示例，无secret）：

```dotenv
NYXID_OAUTH_SCOPES=openid profile proxy
NYXID_CMS_CAPABILITY_SCOPES_JSON={"content:read":["profile"],"content:write":["proxy"],"publish":["proxy"],"metrics:read":["proxy"],"roles:write":["proxy"],"connections:read":["proxy"]}
NYXID_SERVICE_CAPABILITY_SCOPES_JSON={"content:read":["account:read"],"content:write":["account:read","proxy:*"],"publish":["account:read","proxy:*"],"metrics:read":["account:read","proxy:*"],"roles:write":["account:read","proxy:*"],"connections:read":["account:read","proxy:*"]}
```

OAuth client仅登记所需`openid profile`或`openid profile proxy`，不用email/roles/groups/offline_access即可完成本次联调。NyxID access token的audience是实例配置的共享值，CMS还核对签名token的client_id等于`NYXID_CLIENT_ID`；不能用另一个client或第一方登录token冒充本CMS授权。ID token仍核对CMS client audience、nonce、PKCE、state与at_hash。加密session在每次请求中重新验签、在线introspection并按当前配置重算capability；既有任务的保存权限也按当前映射重新核验。

Service在官方注册对象开启JWT identity及delegation注入，配置独立服务audience、准确service ID/slug；只读scope为`account:read`，确有本地写需求时再配置`account:read proxy:*`。`account:read`仅允许由管理员配置的service签发，不能填进OAuth allowed_scopes或OAuth client delegation_scopes。默认仅接受匹配的两个签名传播header；直接Bearer在分入口、旧全局及raw scope三种模式下均需`NYXID_SERVICE_CLIENT_IDS`逐一允许签发client，签名client_id与service audience须匹配，delegated token不能改走直接Bearer。当前官方OAuth白名单不提供account:read，因此本版推荐使用真实代理注入路径。两入口首次通过认证后使用同一issuer/sub确定性创建本人workspace。

R030修复后，新认证、保存会话和队列共用当前授权核验。加密Actor保存CMS／direct service的client与audience，或propagated的service ID、slug、identity audience及delegation audience；Worker在执行及beforeWrite前重验签名、当前绑定、当前entry/global/raw能力与在线有效性。mapping整项移除也重新计算，不复用旧capability；CMS session在所有模式下均重验当前client。propagated的短identity assertion在入口验签后保存其来源绑定，延时任务核验仍有效的delegation，不要求原60秒assertion持续有效，也不延长delegation expiry。旧队列若缺来源绑定将blocked，需当前有权用户重新认证／确认；旧CMS session可通过原签名access token按当前配置重新认证。不得手工补写Actor来源或直接重放旧授权。证据见 [I15](review-i15.md)。

service签名仍核对issuer、audience、相同sub、nyx_service_id、delegated、act.sub、禁止SA/relay、有效期及在线有效性。identity最长60秒，仅对iat允许最多5秒的正向时钟偏差，过期不延长；超限未来签发拒绝。此容差用于已实测的Colima/宿主亚秒级差异，运维仍应同步时钟。

官方NyxID默认可能等待service写请求的人工审批，未配置通知渠道时表现为等待，不能关闭批准检查绕过。本地验证仅通过官方审批API批准独立测试服务的具体请求；调用方应在NyxID查看/批准或拒绝后等待结果。受限API key／operation-scoped caller不应绕过NyxID拒绝delegation注入的边界。组织向外部平台分发的原有精确内容/目标/动作审批另行保持，本次无外部provider发文。

本地注册操作使用独立命名client、四用户、org和service；App端口、DB、media、connections与配置需独立，私有文件0600。无外部连接时connections文件显式为`[]`，provider feature flags全部关闭。不得复用生产secret、改官方源码或覆盖现有测试Admin/client。

## 逐操作scope交接表

真实service入口的AuthManager先要求content:read，下表列出各用例追加要求后的合并集合。它们是平台capability词汇，由分入口capability映射转换上游实际授权；HTTP Bearer／apiKey安全方案本身不声明OAuth scope语义。scope不替代owner、实时组织角色、提交版本可见性、Publisher／Admin及精确批准检查。

| operationId | 所需平台scope（全部满足） |
|---|---|
| getWorkspaces、listArticles、getArticle、downloadMarkdown、listRevisions、previewArticle、getPrivateImage、listOriginals、listDistribution、readAudit、getPublishedAlternatesStatus | content:read |
| createArticle、importMarkdownFile、replaceMarkdownFile、editArticle、submitDraft、linkTranslation、uploadPrivateImage | content:read、content:write |
| confirmOriginal、cancelOriginal、reconcileOriginal、listDestinations、confirmDistribution、getAssistedPackage、requestExactApproval、attachExactApproval、cancelDistribution、reconcileDistribution、reportAssistedSubmission、syncPublishedAlternates | content:read、publish |
| listOwnerConnections | content:read、publish、connections:read |
| refreshExternalMetrics | content:read、publish、metrics:read |
| queryMetrics | content:read、metrics:read |
| setPublishingPermission | content:read、roles:write |

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
