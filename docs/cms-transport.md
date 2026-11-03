# CMS transport and response contracts / CMS 传输与响应合同

The same business routes are installed at `/api/cms` and `/api/service`. `/openapi.json` describes the service transport, operation IDs, response DTOs and application errors. It is a file contract, not a Fastify serializer: describing a legacy snake_case field does not rename it on the wire or change authorization. Browser Studio should use the same-origin CMS transport, not a generated Bearer service client.

两种入口共享业务用例和权限。OpenAPI 只描述实际响应，不重写原有字段或行为；旧 Article 是 camelCase，原文/分发历史仍保留现有 snake_case，任务 DTO 使用明确的新字段。不能把 service Bearer 生成器直接交给浏览器保存 token。

## Browser session / 浏览器会话

1. Read `/api/cms/me` using the existing HttpOnly CMS session. Keep its CSRF value in application memory. No access token, refresh token or delegated credential is returned to browser JavaScript.
2. Send requests to same-origin relative CMS URLs with `credentials:'same-origin'`. Mutations send `x-csrf-token`; the browser supplies the matching `Origin`. JSON commands also send `Content-Type: application/json`; byte-preserving import/replace use `text/markdown` with the original UTF-8 bytes.
3. On HTTP 401, begin the existing OIDC flow at `/auth/login?returnTo=/studio`. Only `/` and `/studio` are accepted login destinations after standard single percent-decoding; external destinations, double encoding and duplicate parameters are rejected. A validated internal hash route may be remembered in sessionStorage; credentials must never be stored there.

浏览器只依赖既有 session、同源 Origin 和 `/me` 提供的 CSRF。`returnTo` 通过加密短 cookie 与单次 OIDC state 绑定，仍验证 PKCE/nonce/subject；取消返回安全 Studio 提示，无效/重放 state 不建立登录。未指定 returnTo 保留旧 `/` 入口。完整页面 hash 不发送给 IdP，不把 hash 当业务授权。

```js
const identity = await fetch('/api/cms/me', {
  credentials: 'same-origin'
}).then(response => response.json());

const response = await fetch(`/api/cms/articles/${articleId}/submit`, {
  method: 'POST',
  credentials: 'same-origin',
  headers: {
    'content-type': 'application/json',
    'x-csrf-token': identity.csrf
  },
  body: JSON.stringify({ revisionId })
});
```

The separately registered `/connections/return` is connection-management browser plumbing, not a login or service operation. Its encrypted one-use cookie binds the current subject/owner/attempt; query status/IDs are untrusted. A successful return restores only server-held owner/attempt metadata, and Studio verifies that owner against a fresh `/me`. Invalid returns use fixed safe `returnError` values. See [connection setup](connection-setup.md).

连接回程不授予新身份/权限，不把个人 hosted 连接伪绑组织。无效回程回到固定站内恢复路径，不回显未验证 owner、attempt 或 provider 异常。

## Service callers / 服务调用者

`/api/service` is for agents and server-side consumers. It accepts the configured human Bearer caller, or the paired signed `X-NyxID-Identity-Token` and `X-NyxID-Delegation-Token`. Where a propagated command authority is present, retain exact method/path/query/content-type/body bytes and the existing command proof; changing the intent requires a new confirmation. Do not forward a generic service account, relay credential or identity-only token as publishing authority. There is no personal-account/default-connection fallback.

服务调用者继续使用当前配置的 Nyx scope 映射和 exact-command 边界。原文/分发的排队写入重验当前 actor、冻结请求、连接和精确批准；同步连接管理、计划取消、备注和观察仍执行当前 access 权限与精确路径检查。只读核验不会因此获得新写授权。

No new capability names were introduced by this integration. Entry-specific runtime mappings remain explicit configuration; identity scopes alone do not imply publishing, role management or connection access.

| Capability | Business operations and additional checks |
| --- | --- |
| `content:read` | `/me`, sites, authorized article/summary/revision/preview/image/task reads; creator, exact task and publication evidence still apply |
| `content:write` | Create/import/edit/replace Markdown, submit the exact current revision, translation linking and private image upload; draft editing remains creator-only |
| `publish` | Original/delivery confirmation and follow-up, exact approvals, distribution plans, notes and historical observations; personal owner or current organization Admin/Publisher required |
| `connections:read` + `publish` | Exact owner connection inventory and connection attempts; no provider API keys/OAuth tokens are returned, but create may return a short-lived tokenized `connectUrl` |
| `roles:write` | Current organization Admin reads members or changes Publisher assignment; grants require a current active Admin/Member, while revocation survives directory outage |
| `metrics:read` | Workspace metric queries; external refresh also requires current publishing authority |

角色和 scopes 分开。Admin 不等于可编辑别人的草稿，Publisher 不等于可管理成员；Viewer/未知角色不能保留原赋权带来的组织访问。`publisherAssigned` 显示需显式撤销的遗留 assignment，`publisher` 表示当前有效赋权。

Treat a create response's short-lived `connectUrl` as sensitive: keep it only in memory for immediate hosted-flow navigation, never in localStorage, sessionStorage, IndexedDB or logs. GET/status responses never return this URL. This link token is distinct from provider credentials and the CMS session.

create 可能返回短效、带 token 的连接跳转 URL；仅在内存中用于立即跳转，不写入任何浏览器 storage 或日志。GET/状态接口不返回 URL；该连接链接 token 与 provider 凭证、CMS session 分开。

The current local catalog has 49 service operations: the original 35 remain, with the following 14 additions. Remote registration and live Nyx validation remain separate work; changing local OpenAPI does not perform registration.

| Operation ID | Path / action |
| --- | --- |
| `listOwnerSites` | `GET /owners/{id}/sites` |
| `listOwnerMembers` | `GET /owners/{id}/members` |
| `listOwnerContentSummary` | `GET /owners/{id}/content-summary` |
| `listOwnerTasks` | `GET /owners/{id}/tasks` |
| `getOwnerTask` | `GET /owners/{id}/tasks/{kind}/{taskId}` |
| `getTaskImage` | `GET /owners/{id}/tasks/{kind}/{taskId}/assets/{assetId}` |
| `createConnectionAttempt` | `POST /owners/{id}/connection-attempts` |
| `getConnectionAttempt` | `GET /owners/{id}/connection-attempts/{attemptId}` |
| `cancelConnectionAttempt` | `POST .../connection-attempts/{attemptId}/cancel` |
| `recheckConnectionAttempt` | `POST .../connection-attempts/{attemptId}/recheck` |
| `createDistributionPlan` | `POST /releases/{id}/distribution-plans` |
| `cancelDistributionPlan` | `POST /distribution-plans/{id}/cancel` |
| `verifyAssistedObservation` | `POST /deliveries/{id}/verify-observation` |
| `appendDeliveryNote` | `POST /deliveries/{id}/notes` |

这些路径均带 `/api/cms` 或 `/api/service` 前缀。原 delivery confirm 只增量接受 `planId`，report 增量接受 `note`；原数组响应、原字段及 202“仅接受确认”语义保留。

## Response meaning / 响应语义

Concrete schemas describe Article/revision/preview, release and media history, delivery/full or excerpt package, exact approval, destination/connection availability, metric coverage, projection status and role results. IDs and remote URLs may be null where no verified remote result exists; `source_verified` on legacy deliveries remains integer `0|1|null`, not a Boolean. Metric `Unavailable` and a null value are distinct from measured zero. Exact approval reference/status is not proof of publication.

任务 `snapshot`、`confirmationDigest`、`distribution` 分别表示冻结正文、整个确认摘要和冻结的分发上下文。正文摘要不能冒充 Nyx 精确批准摘要。`distribution` 的 accountId 来自冻结 payload，绝不查询当前连接来补成另一个账号；只有相应 payload 可见时才返回对象，连接/账号字段还需 `canReadConnections`，否则为 null。普通 Member 不因公开原文读取私有摘要、计划、备注或账号上下文。

Application errors use `{code,message,traceId}` and the `x-trace-id` response header. A 403 requires a fresh capability/workspace read; a 409 means retain the user's unsaved intent and resolve the indicated revision/source/copy/config conflict. A 503 is unavailable, not an empty successful result. Keep a stable idempotency key when retrying the same confirmation; unknown external outcomes require the dedicated read-only recovery path rather than blind resend.

错误展示保留安全 code 与 Trace，禁止把原始 provider 异常、token 或未知回调参数放到 URL。具体连接、计划、人工观察和备注语义见[连接说明](connection-setup.md)与[分发跟进说明](distribution-followup.md)。

The DEV/Hashnode manual-fallback package now describes reconnecting the exact original account and following up through the native platform/support path. This is a compatibility wording correction only: Medium/HackerNoon instructions, removal instructions, states and execution behavior remain unchanged.

DEV/Hashnode 失联后人工包的说明修正为恢复原账号、核对已知副本并通过平台原生/support 跟进，避免误显示 HackerNoon 编辑审说明；仅修兼容文案，不改变状态或执行行为。

## Builds and evidence / 构建与证据

Run `npm run build:studio` before starting a release directly with `node src/main.ts`; `npm run dev` and `npm test` already invoke the build hooks. The local integration package includes Studio source, `tsconfig.studio.json`, root TypeScript/package configuration and theme source, so a clean package can build. Existing container launch, mounts and runtime policy are unchanged; the C10 packaging checks do not rebuild running environments.

`node scripts/source-fingerprint.ts` hashes sorted reviewable source bytes, including Studio configuration and theme source, while excluding generated `dist`, dependencies, archives, hidden runtime data and key/database files. Building Studio does not change that source identity. `node scripts/source-fingerprint.ts --assets` additionally emits a separate Studio asset manifest for its HTML entry, compiled JS and served CSS/vendor assets. A manifest taken before build is not build readiness: build first and assert that `web/studio/dist/main.js` exists before recording release evidence. Source and deployed-asset hashes are separate evidence, and neither hash alone proves live publication or remote registration.

构建资产与源码指纹分开记录，不修改旧历史 manifest。未 build 时的摘要不代表构建已就绪；正式证据须先 build 并确认编译入口存在。新备份与本地打包证据可以附加 `studioAssetsFingerprint`；读取旧备份仍兼容缺少该字段。容器/站点实测、账号和精确外部批准仍各自保留验收边界。
