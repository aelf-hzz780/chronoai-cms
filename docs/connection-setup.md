# Current members and connection attempts / 当前成员与连接尝试

The C05/C06 adapters use the pinned NyxID contract `85e23be6`: organization members are read from `GET /api/v1/orgs/{org_id}/members`; personal hosted links use `POST /api/v1/connect-links`, `GET /api/v1/connect-links/{id}` and `POST /api/v1/connect-links/{id}/cancel`. Hosted create is owned by the authenticated human actor and has no organization/owner argument. Local contract fixtures do not claim Live account connection or provider publication.

C05/C06 采用固定 NyxID 合同 `85e23be6`，对应真实成员和 connect-link 路径。Hosted create 仅属于已认证自然人，没有组织/owner 参数；本地 wire fixture 不代表 Live 账号已连接或外部发布通过。

## Members / 成员

`GET /api/{cms|service}/owners/:id/members` requires a current organization Admin and `roles:write`. Response: `{ownerId,status,members,code?}`; each member is `{identity,displayName,role,active,publisher}`. `identity` is Nyx `user_id`; missing display names fall back to that identity. No email or service scope inventory is exposed. `publisher` is an active explicit CMS assignment, separate from Admin publishing authority. An unavailable directory returns `status:'unavailable'`, `code:'DIRECTORY_UNAVAILABLE'`, and an empty `members` array; this must not be rendered as an available empty organization.

成员读取要求当前组织 Admin 和 `roles:write`。DTO 仅含安全身份、显示名、角色、活跃状态和显式 Publisher assignment；不暴露 email/服务 scope。目录故障明确 unavailable，不能呈现为“组织暂无成员”。授权 Publisher 时需实时确认目标 active 且为 Admin/Member；Viewer、已撤销或未知身份均拒绝。目录不可用阻断 grant，revoke 仍可安全执行。

## Operator configuration / 运维配置

Optional setup is disabled without configuration. Set `NYXID_CONNECTION_MANAGEMENT_URL` to the exact trusted Nyx management page and `NYXID_CONNECTION_TARGETS_JSON` to mappings such as `{"dev":{"enabled":true,"serviceSlug":"actual-catalog-slug","scopes":[]}}`. Optional target fields are `usePlatformKey` and `endpointUrl`; platform-key requests cannot add OAuth scopes. `NYXID_CONNECTION_ATTEMPT_TTL_SECONDS` is 60–3600 seconds, default 900. URLs require HTTPS; explicit loopback development HTTP requires `ALLOW_LOOPBACK_HTTP=true`. The hosted URL must remain on the configured management URL's origin.

缺少显式配置时返回 `CONNECTION_SETUP_UNAVAILABLE`。管理页面 URL、target 启用状态、Nyx catalog slug 和 scopes 均由配置提供，不猜门户地址。目标配置变化会阻断旧 attempt，需重新确认意图。组织流程仅打开配置的管理页并重验，不调用个人 hosted create，也不将个人凭据冒充组织连接。

Register exactly `${PUBLIC_URL}/connections/return` in the Nyx OAuth client's allowed redirect URIs before enabling hosted setup. This callback differs from `/auth/callback`; do not append dynamic state queries to the registered URI. Nyx may append `status`/`connect_link_id`, but CMS ignores them as authority. The current CMS session and encrypted, single-use HttpOnly return cookie bind issuer, subject, owner, attempt, upstream ID, expiry and nonce. A successful return uses server-held owner/attempt metadata to redirect to `/studio#/connections?ownerId=...&attemptId=...`. It never creates a login session or grants publishing rights.

启用前必须精确注册固定的 `/connections/return`，不能以动态 state query 绕过 Nyx 注册匹配。返回后仍验证当前 CMS session、单次 nonce、当前工作区/发布/连接权限，并服务端 GET 已存 upstream ID。浏览器 query 不是连接成功证据。返回只恢复站内管理上下文，不创建登录、不授予业务权限。

Invalid browser returns clear the temporary cookie and use only a fixed `/studio#/connections?returnError=` destination with `CONNECT_RETURN_INVALID`, `SIGN_IN_REQUIRED`, or `FORBIDDEN`. No unverified owner or attempt is restored on this path. Business APIs continue returning their normal 400/401/403 errors.

无效、过期或已消费的浏览器回程清理临时 cookie，并固定回 Studio 展示安全错误；未登录走正常 `/me` 与登录恢复。错误路径不携带不可验 owner/attempt，业务接口的授权错误行为保持不变。

## API / 接口

- `POST /owners/:id/connection-attempts`: `{target,idempotencyKey,connectionId?,acknowledgeUnknownResult?}`; returns HTTP 201 plus metadata and `connectUrl:null|string`, `managementUrl:null|string`.
- `GET /owners/:id/connection-attempts/:attemptId`: returns current safe metadata, authoritative status and exact binding validation.
- `POST .../:attemptId/recheck`: `{connectionId?}`; explicitly selects an operator-managed binding without changing the originally selected identity.
- `POST .../:attemptId/cancel`: `{}`; completed races are read back and never falsely reported as cancelled.

Metadata is `{id,ownerId,target,flow,status,connectionId,code,createdAt,updatedAt,expiresAt}`. Flow is `hosted|operator`; status is `pending|connected|binding_required|cancelled|expired|failed`. All routes require the same current actor/owner, publishing authority and `connections:read`, with existing CMS Origin/CSRF protections and service caller checks. `connected` requires an explicit binding that matches owner kind/issuer/subject, target, exact upstream connected service and credential provenance. Completion without such a binding remains `binding_required`; no first-account fallback is used.

GET/cancel/recheck 不返回敏感 connect URL；仅有效 create 意图可返回。URL 使用 Vault 加密保存，不可写入日志或公开文档。同 key、同 actor/owner/target/config 意图的有效 create 重试返回同一已知链接，不重发上游 POST；已完成、取消或过期不再返回 URL。GET 同样重验当前精确绑定，连接失效不回退其他账号。

Before dispatch, migration v3 durably stores `create_dispatched` with the idempotency mapping. Lost/invalid create results become `failed` + `CONNECT_RESULT_UNKNOWN`; retries never resend. A new key for that actor/owner/target requires `acknowledgeUnknownResult:true`, because the prior link may still be active. This acknowledgement does not claim the unknown remote link was cancelled. Do not remove unknown fences or restore an older database to retry creation.

版本化 additive migration v3 保留连接尝试和幂等边界。未知结果必须由人明确认知旧链接可能仍有效，再创建新意图；不得盲重发，也不得删除 fence、回滚旧库以恢复重试。UI 回退不删除这些记录。

Relevant safe codes are `CONNECTION_SETUP_UNAVAILABLE`, `CONNECTION_CONFIGURATION_CHANGED`, `CONNECTION_BINDING_REQUIRED`, `CONNECTION_BINDING_UNAVAILABLE`, `CONNECT_RESULT_UNKNOWN`, `CONNECT_STATUS_UNAVAILABLE`, `CONNECT_CANCEL_UNPROVEN`, `CONNECTION_ATTEMPT_EXPIRED`, `CONNECTION_ATTEMPT_CANCELLED`, `CONNECTION_MISMATCH`, and `CONNECT_RETURN_INVALID`. Identity/owner/scope revocation remains HTTP 401/403 and is not converted into a successful business response. Provider error text and raw callback fields are never reflected into redirect URLs.

以上错误码用于界面提示与重验。当前身份/owner/scope 撤权仍返回 401/403；第三方异常只保留安全分类和 Trace，不把原始 provider 信息放进回跳 URL。Nyx Live 接入、账号与最终授权继续作为独立验收项。
