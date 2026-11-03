# Deferred distribution and historical follow-up / 延迟分发与历史跟进

Migration v4 adds `distribution_plans`, `delivery_observations` and `delivery_notes` without replacing existing releases, deliveries, payloads or approvals. Restoring the old UI does not remove these records or reverse an external effect. Current caller scopes and ownership are checked again on every command; historical actors never become new execution authorization.

版本化 additive migration v4 只增量保存计划、观察和备注，保留旧表与历史事实。UI 回退不删除新数据，也不撤销既有外部发布；每个命令仍检查当前调用者，不能将历史 actor/批准当作新的授权。

## Plans / 延迟计划

`POST /releases/:id/distribution-plans` accepts the existing distribution intent (`target`, `connectionId`, `action`, `format`, optional `excerpt`/`copyId`, `rightsConfirmed:true`) plus `notBeforeAt` and a stable `idempotencyKey`. Time must be a future timestamp with an explicit timezone. The plan freezes the exact release/revision, prepared full/excerpt content, credited author, original URL/digest, owner connection fingerprint and provider account. Update/remove additionally freeze the explicitly selected copy, its remote ID/URL and current confirmation identity. A plan stores no execution approval or reusable caller token and creates no job.

计划冻结完整意图，复用现有 delivery 的内容/图片准备逻辑。创建、取消均不产生 provider 写入或后台 job；失联连接不能通过新计划悄悄回退其他账号。已有副本必须显式给出 copyId，不按“最新同渠道文章”替换。

Update/remove also require the current connection account to match the copy's valid frozen account: rebinding the same connection ID to another account is rejected, while same-account reauthentication may be newly confirmed; genuine disconnected manual follow-up retains the old account.

更新/移除拒绝同连接 ID 换绑其他账号，缺失历史冻结账号则拒绝；同账号重新认证可新确认，真正失联的人工跟进仍保留原账号。

The create/cancel response is `{id,ownerId,releaseId,revisionId,target,connectionId,action,format,copyId,notBeforeAt,state,deliveryId,createdAt,updatedAt,traceId}`. State is `scheduled`, `due`, `confirmed`, or `cancelled`; `due` is derived from server time rather than an automatic scheduler. `POST /distribution-plans/:id/cancel` cancels only an unconsumed plan.

`GET /owners/:id/tasks?kind=plan` and task detail expose `plan:{notBeforeAt,releaseId,target,connectionId,action,format,copyId,consumedDeliveryId}`. Private full/excerpt snapshots are limited to the current organization Admin/Publisher or personal owner; a public original does not expose a Publisher's private summary to Members. Connection metadata still follows the existing capability boundary.

计划通过统一任务列表/详情读取。普通组织 Member 即使能读公开来源，也不能读取私有计划摘要；task snapshot 为 null 可以表示当前不可见，并不等于计划没有冻结内容。仅当前发布者可用到期“确认”提示。

Human confirmation uses the unchanged `POST /releases/:id/deliveries` path with the full currently confirmed intent and optional `planId`. The idempotency fingerprint includes `planId`. Inside the delivery transaction, the service verifies due time, unconsumed state, exact frozen source/content/connection/copy and current source validity, then inserts one delivery and atomically records its ID on the plan. A changed source, copy or connection leaves the plan unconsumed and creates no delivery/job. An organization automatic delivery still requires a fresh exact approval; no approval is retained from the plan.

到期后必须再次由人确认。变更内容、来源、连接或副本意味着新的意图，不能继续消费旧计划；取消旧计划后另建。确认与消费在同一 SQLite 事务内，失败回滚，不会留下重复任务。组织自动分发仍需针对新 delivery 的精确批准。

## Historical observations / 历史人工副本观察

`POST /deliveries/:id/verify-observation {url}` supports confirmed Medium/HackerNoon content copies after the source has changed or gone offline. It performs only public reads, retains the exact frozen body/byline/source attribution, and requires the renderer's visible-content proof. URLs require the target's allowed HTTPS domain, port 443, no userinfo/fragment, and no redirects. An existing copy URL must match exactly. A previously unknown copy URL/identity is fixed only after successful proof and an atomic identity/state check; verification failure saves no URL or false success.

旧来源允许只读认回人工副本，但不重新发文、不恢复原文、不把 delivery 状态改成 published，也不设置 source_verified=true。校验结束后再次检查当前权限和副本身份，防止核验过程中已被取消、修改或撤权。已有副本的账号、URL 与 remote identity 均不能被观察请求替换。

The appended observation is `{id,deliveryId,url,status:'verified',proof:'content_attribution',sourceState,followUpRequired:true,actor,traceId,observedAt}`. The proof establishes visible frozen content, credited author and source attribution; it does **not** establish platform-account control. Task detail returns observations without `deliveryId` in its private `observations` collection. Historical `sourceState` and observation time remain immutable evidence. The UI should say that content and attribution were verified and follow-up is still required.

观察只证明内容与来源归属，不声称验证了平台账号控制权。原文与副本执行状态保持独立；之后纠错/移除仍需新的确认。观察记录仅当前 Publisher/个人 owner 可读，不借公开来源扩大私有任务读取范围。

## Notes / 备注

`POST /deliveries/:id/notes {note}` appends a private note to a current or historical delivery and returns HTTP 201 with `{id,note,actor,traceId,createdAt}`. It requires current publishing authority, uses the current actor, and changes neither delivery state nor its remote identity/update time. `POST /deliveries/:id/report` also accepts an optional note of at most 2000 characters, appended in the report's existing transaction. Notes are commentary, never publication or observation proof. Task detail returns private notes only to current organization Publishers/Admins or the personal owner.

历史副本可单独记录备注，无需将 published 改回 submitted，也无需伪造来源仍在线。备注跨刷新/重启保留，普通 Member 不能写入或读取；报告核验失败不会留下假成功或顺带保存成功备注。

## Restore and pause / 恢复与暂停

Restoration invalidates sessions/OIDC state and clears every connection attempt's encrypted hosted URL and return nonce. Nonterminal attempts retain an unknown-result fence with `RESTORED_CONNECTION_RECHECK_REQUIRED`; this is not a claim that the remote link was cancelled. New hosted links honor `outbound_paused`. Read-only GET/recheck and explicit cancellation remain available; organization operator-only setup and local distribution plans create no outbound job. Due plans never run automatically after downtime or restore.

恢复不会重放链接、复用旧回程或自动创建新链接。未知连接重建仍需明确确认旧链接可能有效；显式撤销不被暂停出站误阻断。计划即使恢复后已到期，也只等待新的人工确认与当前授权。
