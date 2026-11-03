# CMS B integration contract / B 方案实施合同

2026-11-03 · Approved scope: WP00–08 from the accepted integration plan. Base: `ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a`. Branch: `codex/004-cms-b-integration`. This file records architecture decisions; implementation and acceptance are tracked separately.

本轮按已确认 WP00–08 实施。主 Agent 负责合同、架构、评审和验收；执行子 Agent 按划定文件边界编码。全站范围保持不变，不将首个可用工作台等同于全部完成。现有用户工作目录与原型保持不变，业务实现复用独立 CMS checkout。

## 1. Architecture / 架构

- Keep Fastify, ContentService, PublishingService, DistributionService, Policy, workers and SQLite. Add scoped read services and explicit, additive schema migrations. Avoid duplicating business authorization in the UI.
- 保留现有控制/用例/存储层。新 UI 的 transport、view model、组件分离；新读模型只读取当前有权看到的数据，列表刷新不触发外部写入。
- Serve the new TypeScript ES-module UI at `/studio`; preserve `/`, `/app.js` and `/style.css` as the old interface. `tsc -p tsconfig.studio.json` emits browser JS into `web/studio/dist`. No new framework, CDN runtime or relaxed CSP is required.
- 新界面保留已批准 B 视觉风格，默认英文，可切简中；UI locale、article language、Ghost site language 分离。生产模块不得含演示文章、模拟身份、计时器成功或虚构指标。
- Shared business routes remain under `/api/cms` and `/api/service`. CMS uses the existing session, Origin and CSRF token. Service writes preserve exact command-authority validation and operation registration. Browser-only login return plumbing is not a new service operation.
- 同一意图重试保持同一幂等键。修改版本/内容/目标/动作属于新意图。未知结果只能核验，不以失败重试触发重复外部发布。新服务操作的合同摘要或注册改变需记录升级证据。

## 2. Identity and navigation / 身份与导航

`GET /me` preserves `subject`, `workspaces`, `csrf`. Each workspace retains `id/kind/name/canPublish` and adds:

```ts
type WorkspaceRole = 'owner' | 'admin' | 'publisher' | 'member';
type Capabilities = {
  canWrite: boolean; canPublish: boolean; canManagePublishers: boolean;
  canReadConnections: boolean; canReadMetrics: boolean;
};
// response also includes organizationDirectory: {status:'available'|'unavailable',code?:string}
```

能力由当前 scopes 和 membership 共同计算。组织目录故障只在当前身份已验证时允许个人工作区继续返回；不可验组织不暴露名/ID/缓存权限。身份本身不可验仍 fail closed。Admin 与 Publisher 分开，`canManagePublishers` 需要当前组织 Admin + roles:write。

`/auth/login?returnTo=/studio` is an explicit, allowlisted login destination; only `/` and `/studio` are allowed. Bind the destination to the one-use OIDC state using server storage or an authenticated encrypted cookie. The browser may remember only a validated internal hash route in sessionStorage. Never store tokens there or trust callback-supplied redirect targets. No `returnTo` preserves the legacy `/` destination. Valid-state cancellation returns a safe Studio error; invalid or replayed state does not restore authentication.

新增 `/studio/assets/*` 只提供发布资源白名单（编译 JS、CSS、指定 vendor/字体），拒绝目录穿越、源文件、dotfiles、symlink 逃逸和未允许的扩展名。保留 same-origin CSP，不添加 unsafe-inline。默认入口切换留待最终灰度确认。

## 3. Content read model / 内容读取模型

`GET /owners/:id/content-summary` accepts `articleId?`, `language?:en|zh`, `status?:all|draft|submitted|published|outdated`, `q?`, `limit=50` (1–100), `offset=0`. It returns `{items,total,limit,offset,counts}`. Search, pagination and counts operate on the same authorized relation. Counts apply articleId/q/language but ignore the selected status. Unauthorized exact article filters return an empty result, without revealing cross-owner existence.

```ts
type ContentSummary = {
  id:string; ownerId:string; language:'en'|'zh'; creator:string;
  revision:{id:string; title:string; digest:string; creditedAuthor:string; createdAt:string};
  draft:null|{revisionId:string};
  submission:null|{revisionId:string; submittedAt:string; status:'pending'|'fulfilled'; fulfilledByReleaseId:string|null};
  live:null|{releaseId:string; revisionId:string; url:string};
  translations:Array<{articleId:string; language:'en'|'zh'; sourceArticleId:string; sourceRevisionId:string; outdated:boolean}>;
  capabilities:{canEdit:boolean; canSubmit:boolean; canPublish:boolean};
  states:Array<'draft'|'submitted'|'published'|'outdated'>;
  updatedAt:string;
};
```

仅作者看到 current working revision 的 draft 指针。非作者不能通过 UUID、计数、时间、搜索或 translation.outdated 推知他人未提交稿变化。每篇分别计算编辑权；同源多译返回授权集合，不按标题合并或任取第一篇。直链编辑器可用 articleId 过滤取得单篇 summary，不遍历全工作区。

`draft` state means the author's current revision differs from both the current live revision and any pending submitted revision. `submitted` means pending, not fulfilled. Published content with new draft changes may have multiple states. Translation staleness is evaluated against an authorized source revision, never a hidden working draft. With no authorized source, do not expose its private changes.

已核验公开的旧 source revision 在之后被 superseded，仍可作为关联元数据返回并提示译文 outdated：必须有明确成功 publish/update 证据，不能据此读取旧稿正文或暴露从未公开的旧工作稿。前端把 directed edge 转换为对当前文章的 peer；译文端不能链接自身，多译文必须显式选择。

投稿持久化使用 additive versioned migration：`submission_history` 保存每次提交事件，旧 `submissions` 指针兼容保留；`submission_fulfillments` 按 article+revision 保存首次成功原文核验的 release 与时间。publish/update 成功才履约，失败/取消/下线不写履约；后来新修订仍 pending。相同已履约 revision 重提仍 fulfilled，另存新 revision 才是新 pending。迁移仅信任已有 published/superseded 且非 unpublish 的成功证据，不能把 unknown/failed 回填为成功。下线不复活旧待办。

Original UTF-8 Markdown is preserved byte-for-byte through import/export, including BOM and LF/CRLF. Textarea normalization must not silently rewrite an unchanged file or metadata-only edit. Explicit edits may create a new revision; distinguish these from a byte-preserving download of the selected immutable revision.

## 4. Sites, members and metrics / 站点、成员与指标

`GET /owners/:id/sites` returns `{ownerId,sites:[{language,configured,publicUrl,verification:{status,checkedAt},blockers}]}` for both languages. Configured is not reachable. Without persisted verification evidence use `unknown/null`; missing configuration has `SITE_REQUIRED`. Never expose key references, Admin paths or secrets.

成员读取合同：`GET /owners/:id/members`；当前 Admin + roles:write 方可进入管理页。读取 Nyx 当前目录，将 provider user_id 映射 CMS subject；显示 active membership/role 和当前 Publisher assignment，不新造身份系统。目录故障返回明确 unavailable，不返回空数组冒充无人。授权修改复用现有 PUT；前端仅允许当前有效成员，撤权后重验。具体 upstream wire shape 固定来源见执行记录，不能臆造。

Existing metrics APIs and tracker are reused. Ghost source is the self-hosted collector. Daily visitor estimates sum UTC-day uniqueness, not cross-day persons. External counters are the latest lifetime snapshots, filtered by capture time; no invented trend. Distribution counts use confirmation creation time. Preserve availability, source, updated time and coverage. Consent, withdrawal and GPC/DNT remain enforced on each public host. Readers must not require CMS authentication.

## 5. Task read model / 任务读模型

`GET /owners/:id/tasks` and `GET /owners/:id/tasks/:kind/:taskId` provide paginated, authorized summaries/details for `release|delivery|media|projection|plan`. Query filters include kind/state/language/articleId, limit and offset. Read detail contains identity, exact frozen version, relevant history, Trace, safe snapshot, and `allowedActions`; never actor_json, credentials, raw approvals or private configuration.

任务读取至少满足当前 owner access；涉及未公开冻结稿还需 creator 或当前组织 Publisher，且只授权该已确认任务的 revision，不开放其他工作稿。所有动作仍由现有对应服务重验，不把 allowedActions 当授权凭据。普通 Member 不得借任务详情读取连接私有元数据。已公开原文与成功副本历史在适用可见范围内保留。

A task-scoped media route checks the task's exact revision and its actual asset references. A Publisher who confirmed image-bearing R1 can inspect that task after R2 no longer references the image, if current task access still holds. Unreferenced assets and cross-owner tasks remain denied. Do not loosen ordinary article asset authorization.

Task snapshot digest is SHA-256 of its frozen Markdown; delivery details separately expose confirmationDigest from the stored delivery digest used by exact approval. These digests must not be conflated. A delivery excerpt grants no access to private images omitted from its frozen excerpt. Projection tasks have no frozen content revision and return a null snapshot.

普通组织 Member（包括来源文章作者）不能因为原文已公开就读取其他 Publisher 的未公开分发摘要。除当前 Publisher 外，delivery 的 snapshot、confirmationDigest 与任务素材须有该 delivery 自身当前/历史成功公开证据；被 superseded/removed 后保留既有公开证据，不信任 failed/uncertain。任务元数据仍按相应已公开来源权限返回。

For non-Publisher organization readers, source publication alone never authorizes an unpublished delivery excerpt. The delivery's own current or trusted historical publication evidence gates its frozen payload, confirmation digest and assets.

原文 `materialize-media` 仅用于已认回 remote_id/url 的 uncertain/verifying、非unpublish任务；partial是独立补图状态。新UI不得以published+missing-media模拟真实状态。批准delivery后即入队，没有新增run/ready状态；失败新确认与unknown只读核验分开。

## 6. Connections and deferred actions / 连接与延迟待办

Connection attempts are per subject+owner+target, expiring and single-use. Preserve one exact connection identity. A successful browser return is only a signal to requery trusted Nyx status and owner provenance; it never binds an arbitrary user-supplied account ID. An unbound completed service remains `binding_required`, with the documented operator binding path. Never substitute personal credentials for an organizational connection.

拟议 attempt 路由：`POST /owners/:id/connection-attempts`、`GET /owners/:id/connection-attempts/:attemptId`、`POST .../:attemptId/cancel`、`POST .../:attemptId/recheck`。返回状态 pending/connected/binding_required/cancelled/expired/failed，当前owner撤权应拒绝。Nyx hosted connect支持的provider由配置启用；组织模式若上游不能安全创建owner连接，走明确管理入口与重验，不复用personal hosted flow伪造组织连接。回程state不授予业务权限。

Pinned Nyx source `85e23be62cae48b334a961ae81c62aca0a65ecb2` confirms that hosted `POST /api/v1/connect-links` creates a user-owned link and has no organization-owner parameter. Use hosted mode only for personal owners; organization mode uses an explicitly configured operator URL. The callback is the separately registered fixed `/connections/return`, not the OIDC callback. An encrypted, expiring, one-use cookie binds the authenticated session subject, owner, attempt and nonce. Ignore callback-supplied status/IDs and requery the saved upstream ID and exact configured binding. A completed link without operator binding is `binding_required`.

创建尝试携带稳定 idempotencyKey；上游 POST 前持久记录 dispatched fence，未知结果不能自动重发。相同意图重试可返回仍有效的同一加密链接；GET 不返回 token URL。未知结果后新建需显式 acknowledgeUnknownResult，保留旧链接可能有效的提示。连接管理同步操作使用 access 授权加 publish/connections:read 双能力；存在传播 command 时仍检查精确当前路径，不借发布任务的批准操作连接。成员 grant 必须实时核验 active admin/member，目录不可用则拒绝 grant；revoke 不被目录故障阻塞。

Deferred plans persist exact release/revision, target, connection fingerprint, action, full/excerpt content, notBeforeAt, creator and trace. Update/remove must additionally persist copyId and original remote identity. Creation/cancellation are local state changes and produce no outbound job. Server time controls eligibility. A due plan still requires human confirmation and current authorization; the original approval is not reused.

延迟计划以 `POST /releases/:id/distribution-plans` 创建；owner列表/详情纳入任务模型；`POST /distribution-plans/:id/cancel` 取消。到期确认复用 `POST /releases/:id/deliveries`，增加可选 planId；服务在同一确认事务中校验计划冻结字段/到期/唯一消费并链接delivery。这样既有service确切请求路径与授权规则不被绕过；新增body字段也必须更新OpenAPI/注册。重试同意图复用键，意图改变需取消旧计划并新确认。

## 7. Manual copy verification / 人工副本认回

Add a dedicated verification use case for a previously confirmed manual delivery whose original is now superseded/unpublished. It fetches only the known/validated destination URL and proves frozen content, attribution and ownership. Append an observation and retain the copy identity with follow-up required. Do not call provider write APIs, reactivate a source release or mark a stale source valid. Existing uncertain automatic reconciliation remains unchanged.

拟议 `POST /deliveries/:id/verify-observation` body为 `{url}`，必须当前有权访问并处理该owner发布记录，检查固定渠道域名、SSRF与冻结内容。观察结果与当前delivery执行状态分开；公开存在不等于当前来源仍有效。之后纠错/移除分别走新确认，保留copyId/原连接。report/event备注采用有限长度字段、当前actor/时间/Trace持久化；备注不作为公开核验凭据。

## 8. Acceptance and rollback / 验收与回退

Tests must demonstrate actual behavior, not mirror implementation. New authorization/data/state contracts require failure-first tests, then focused regression and a fixed-source whole-suite gate. Browser tests must exercise same-origin session/CSRF, workspace switching, stale requests, real API edits and files, rather than intercepting all APIs with a mock success layer.

新增表使用逐版本、幂等、事务化迁移；备份和旧数据兼容需验证。保留旧UI入口；回退静态assets不删除新增数据，不用旧DB覆盖真实外部发布，不复活旧blocked命令或旧批准。Ghost theme独立回退。外部账号/订阅/具体内容批准缺失只阻塞相关Live验收，不能冒称由fixture完成，也不阻塞其余实现。

Milestones: M1 real content workspace (WP00–02); M2 original/distribution workflow (WP03–05); M3 governance, metrics, Ghost theme, parity, rollback and handoff (WP06–08). Full objective remains open until the accepted scope has authoritative evidence. Historical D1–D9 status is not silently promoted by this integration.

2026-11-03 user clarification: NyxID runs on another host; real Nyx integration is explicitly deferred and must be listed separately at handoff. Local software, API and Ghost acceptance continues. Theme maintainer email stays a packaging configuration item; reserved-domain fixture metadata can validate local rendering but is not a release contact.

用户已明确真实 NyxID 联调后置。本机双 Ghost 为英文 `localhost:2468` 与中文 `localhost:2469`；保留原数据和主题，可回退的本地验证不等同于远端生产验收。
