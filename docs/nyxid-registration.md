# NyxID 注册与连接交接

当前本地集成使用后端 `049ee1c2ca811a002590dc8330ce646078bb1158`、门户 `c65dc4bedb7da79cf0fb477e6f5bd809f03aec9b`，均为保留的官方 `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5` 之上的本地补丁，未向 upstream push／merge。目标实例需要明确部署这些依赖，不能按上游原版宣称具有同等能力。

W1 在固定 `0b0e9d1`＋`049ee1c` 的所选真实 proxy／逐请求批准／在线来源核验路径有界关闭 R031，见 [W1](acceptance-w1-20261102.md)。整合 `83b4b8e` 后的 pending-media／恢复补验、最终 OpenAPI 注册发现及可复现配置见 [2026-11-02 交接](handoff-20261102.md)。普通 delegation active 仍不能单独证明原来源有效；签名 command authority、当前权限、绑定、精确批准及最终写入守卫继续共同约束，未支持来源保持拒绝。

OAuth service调用需通过官方consent授予精确UserService／resource；仅取得proxy scope不足以访问未授权服务。普通consent review会合并scopes，较小scope登录不代表撤权；I17采用官方撤旧consent后重新授较小scope，并核对旧队列仍被阻断。所有App／Worker须一起升级，回滚期间暂停外发，不自动恢复旧blocked任务。

R033只读恢复修复已在业务源码4a27487独立有界关闭，见 [I18](review-i18.md)。uncertain对账按当前合法Admin／owner的access授权，不要求原确认credential仍有效；当前scope、owner／组织发布权限和精确连接绑定仍须成立。恢复只查询既有远端结果，beforeWrite禁止重发；原Actor密文和Trace保持。恢复请求调用人失权也必须阻断，不能用新恢复身份替换旧任务的新写授权。新确认／queued外发继续执行R031来源保护。

本次固定整合版本OpenAPI为35操作，包含`materializeOriginalMedia`，实际注册／导入／发现步骤与读回见[复跑材料](evidence/followup-20261102/registration/reproduce.md)。35是实现数量，不是额外产品要求。只读reconcile不公开新图片、不自动排metadata；显式补图需当前queued-write来源与新的专用proof，固定原release/revision/owner/rights，202后读取`media_history`。CMS按钮与完整步骤见[API指南](api-guide.md#只读恢复与显式补图)。这是已有实现选择；实际固定版本的验证边界见当前整合交接。

## 注册输入

1. OIDC confidential client：准确登记 `https://<cms-host>/auth/callback`，启用 Authorization Code + PKCE S256；登记实际 client ID/secret。issuer 是 discovery 声明的标识，允许字面 `nyxid`，不可擅自把 issuer 改成 API URL。
2. `NYXID_API_URL`、`NYXID_DISCOVERY_URL`、`NYXID_INTROSPECTION_URL` 使用实例真实 HTTPS endpoint。`NYXID_TOKEN_AUDIENCE` 是 delegated access token audience；`NYXID_CMS_AUDIENCE` 是 CMS access token audience；`NYXID_SERVICE_AUDIENCE` 是签名 identity assertion 的服务 audience。不能相互猜测替代。
3. 注册平台 service：填写真实 `NYXID_SERVICE_ID` / `NYXID_SERVICE_SLUG`，导入 `/openapi.json` 中 `/api/service/*` 操作。转发原生 `X-NyxID-Identity-Token` 和 `X-NyxID-Delegation-Token`；同时验证签名、issuer、audience、同一 sub、60秒 identity TTL、service id、delegated、act.sub 和 scope。
4. 使用下述分入口capability映射。官方0.75.0的OIDC白名单不接受`content:read`等平台capability名称，不能将其登记为OAuth scope。默认只申请`openid profile`且仅映射读取；额外能力必须明确配置并取得相应上游scope授权。
5. 配置测试用户：无组织、普通 Member、Admin、指定 Publisher、多组织、离组与撤权；分别从 CMS 和 service 验证。组织来源是 `/api/v1/orgs` 实时 `your_role`；Viewer 不获得 Member 权利。Publisher 只是本平台组织发布能力，由当前 Admin 管理。

导入契约时保留各operation的201／202／200成功状态及JSON object／array／原始二进制媒体声明；私有图片按实际Content-Type处理，不能强制按JSON解码。preview的可选revision参数及report的removed枚举均应保留，removed仍受已确认remove动作和精确已知URL404／410核验约束。具体操作响应见api-guide.md；最终本地真实注册／发现记录见当前交接；目标实例仍须按其配置复验，不能由本机契约测试替代。

R034历史修复将当时34操作中的`downloadMarkdown`迁至`/api/service/articles/{id}/markdown-file`，返回明确的base64 JSON文件封装；调用方按`encoding`解码`data`并核对`byteLength`／`sha256`，实际保存原始`.md`。必须重新导入／发现当前OpenAPI，确认该操作为application/json且revision必填；旧`binary_artifact`标记和仅改MIME不能解决官方MCP的文本解码损失。直接HTTP与CMS的原`/markdown`下载保留，文件封装仍执行同一当前权限与不可变revision检查。解码示例见 [API指南](api-guide.md#nyxid-mcp-原始文件交付)，R034已独立有界关闭，开发与独立证据及限制见 [I19](review-i19.md)。

普通用户门户 Launch 已由本地 `c65dc4be` 补丁实现并部署，个人／组织 Admin 经门户 Open app 与直接 CMS 入口返回相同身份及工作区，见[脱敏浏览器记录](evidence/portal-local-launch-20261102.json)。官方 `38bae2f` 原版缺少此入口的历史分析保留，但不再是“本地未实现”。目标部署须携带并审查本地门户补丁，不能伪造 provider 关系或仅用管理员注册页代替普通用户入口。

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
| confirmOriginal、cancelOriginal、reconcileOriginal、materializeOriginalMedia、listDestinations、confirmDistribution、getAssistedPackage、requestExactApproval、attachExactApproval、cancelDistribution、reconcileDistribution、reportAssistedSubmission、syncPublishedAlternates | content:read、publish |
| listOwnerConnections | content:read、publish、connections:read |
| refreshExternalMetrics | content:read、publish、metrics:read |
| queryMetrics | content:read、metrics:read |
| setPublishingPermission | content:read、roles:write |

## 精确连接绑定

复制 `infra/platform/nyxid-connections.example.json` 到私有配置目录，填写来自 NyxID `/api/v1/user-services` 的 **UserService.id**，不是 service definition id。每个 owner×destination 精确一条可选连接，写出 issuer、subject、credential source、slug、provider account ID，以及 DEV organization ID 或 Hashnode publication ID／Pro／权限。provider secrets 只保存在 NyxID。

组织绑定必须返回 `credential_source.type=org`、相同 org_id、allowed=true；个人必须 type=personal 且相同调用人。绑定变更、服务 state_version/updated_at 变化都会改变 connection fingerprint。发送前再次读取；不允许从组织连接退回个人账号或供应商直连。proxy 的 `_nyxid_via` 由服务端指定 exact UserService.id。

Hashnode 填写 `target:hashnode`、官方 `https://gql-beta.hashnode.com`、publicationId、accountId、pro=true 和真实可发布权限；仅启用组织 publication。Medium/HackerNoon 保留辅助流程，不伪造自动发文能力。服务下线用 feature flag，已知副本保留人工跟进。

## 外部写入精确批准

个人连接默认沿用 legacy proxy。需要 NyxID 可关联的精确执行批准时，仅在服务端对应 connection binding 增加 `"executionApproval":"exact"`；客户端不能指定或覆盖此字段，未知值会拒绝加载。该模式进入 connection fingerprint 和不可变 delivery payload；启用或关闭模式后，旧确认不能切换执行路径，需取消未发送任务并重新确认。组织外部写入始终要求精确 Admin 批准，不受此可选字段影响。

Personal connections retain the legacy proxy path by default. An operator can opt a specific connection into NyxID exact execution approval with `"executionApproval":"exact"` in its server-owned binding. Clients cannot set it, and unknown values are rejected. The mode is frozen in the connection fingerprint and immutable delivery payload; changing it requires cancellation and fresh confirmation of unsent work. Organization writes continue to require exact Admin approval.

1. 确认精确 release、全文／摘要、图片、目标 connection、create/update/remove，冻结 delivery payload。
2. 请求 `/deliveries/:id/request-approval`。人类 token 从 `/api/v1/mcp/config` discovery 读取契约；delegated token 从 `/api/v1/delegation/operation-catalog` 读取。建立 native `/api/v1/approvals/exact-service/requests`。
3. 个人任务由当前 owner、组织任务由当前 Admin，在 NyxID 核对实际 request、operation digest、catalog/generation、幂等 key 后批准。这是执行批准，不是内容编辑二审。通用 grant 不替代 PerRequest exact approval；不满足实例策略会明确失败。
4. 关联引用 `/deliveries/:id/authorize`。Worker 重验当前角色、原文公开状态、connection fingerprint、批准和请求 digest。
5. native redeem **本身执行写入**，读取并验证 receipt response_digest；不再追加普通 proxy 写入。中断或未知结果进入 uncertain，后续只读对账。

非 delegated 的个人 opt-in 连接可使用 catalog 中的 `nyx_generic_proxy_v1`：arguments 为 `{method,path,body}`，raw query 原样保留在 path，正文不展开到顶层；operation digest 覆盖此封装。组织或 delegated 调用仍必须使用声明的 operation，不能通过 generic 回退。create/status/redeem 必须保持同一 OAuth client 和 owner；generation 取 NyxID create 响应。过期或撤权的已保存 actor 不会被新登录静默替换；未发送任务应取消后用新登录重新确认。

A non-delegated personal opt-in connection can use the catalog's `nyx_generic_proxy_v1` endpoint with `{method,path,body}` arguments; a raw query remains in `path`, and the operation digest covers the complete envelope. Organization and delegated callers still require a declared operation. Keep the OAuth client and owner consistent across create, status and redeem, and retain the generation returned by create. A fresh login never silently replaces an expired or revoked saved actor; cancel unsent work and confirm it again.

Live 必须保存注册导出（脱敏）、Trace ID、调用角色、scope、精确批准与 receipt 关联、四 Ghost/外部页面证据。不能保存 token、cookie、provider secret 或完整授权头。缺少目标实例、账号、订阅或明确发文授权时，保持 BLOCKED。
