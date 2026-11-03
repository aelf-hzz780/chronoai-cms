# 可靠性跟进与交付（2026-11-03）

本轮继续 Gist v0.7 的 D1–D9／适用 A01–A52，不修改原文或正式验收矩阵。**整体仍为 NOT_ACCEPTED**。历史 W1、W2、共同版本联合补验和 103 个脱敏文件继续按 [2026-11-02 交接](handoff-20261102.md)的固定版本引用；本轮开始再次核对这些文件，SHA-256 全部一致。

This continuation retains the Gist v0.7 requirements and formal acceptance matrix. Overall acceptance remains **NOT_ACCEPTED**. Historical W1, W2 and combined checks retain their original version boundaries. All 103 files in the previous portable manifest were checked again and matched their SHA-256 hashes.

## 已确认缺陷与修复

在固定旧源码 `386b9652dc431bb83e4864d5b046b378110ee88d` 上，同一篇合成正文在普通滚动下通过、在 `scroll-behavior: smooth` 下失败。renderer 对正文元素调用默认 `scrollIntoView` 后，在同一次浏览器执行中立即计算位置并做 hit-test；平滑滚动尚未完成时，会把实际可读的正文或图片误判为不可见。

At the pinned baseline, identical synthetic content passed with normal scrolling and failed with CSS smooth scrolling. The renderer used the default scroll behavior and immediately checked geometry and hit targets in the same browser evaluation. An unfinished smooth scroll therefore rejected content that was readable after positioning.

`7365344c7ddbda4dec311840d68b636b4fd009a4` 先提交三个失败测试：viewport 下方正文、嵌套滚动区正文、纯图片正文。`c16cde700963959d3fd7fc226853b71f5551573a` 将两处 `scrollIntoView` 明确为 `behavior: 'instant'`，完成定位后沿用原有核验。没有增加自动重试，也没有减少 DOM／MutationObserver／hit-test／逐字形像素检查或更改权限边界。

Commit `7365344` first records three failing regressions: text below the viewport, text in a nested scroller and image-only content. Commit `c16cde7` sets `behavior: 'instant'` at both visibility-check scroll calls. All existing integrity, visibility, pixel and authorization checks remain in place, without automatic retries.

修复沿用已有 renderer／Ghost adapter／Worker 分层。定位只是核验器的只读浏览器动作，无需新增策略或工厂抽象。失败仍按已有 Trace ID 保留 `uncertain`、`partial / ORIGINAL_NOT_VERIFIED`；新回归确认：物化一张后核验失败不会自动再物化，当前有权 Actor 可只读认回同一 remote ID／URL／revision，旧 Actor 与 partial 历史不变。

The change stays within the existing renderer/adapter/Worker separation; an additional abstraction is unnecessary for this positioning operation. Failed verification retains the existing trace-linked conservative states. A new regression verifies that a post-materialization failure cannot automatically repeat publication and that a current authorized actor can recognize the same remote identity and revision while preserving the old actor and partial history.

## 测试与独立审查

| 范围 | 固定版本与实际结果 |
| --- | --- |
| 失败先行 | `7365344`：3 tests，0 PASS／3 FAIL |
| 最小修复回归 | `c16cde7`：3／3 PASS |
| TypeScript 与受影响路径 | `c16cde7`：typecheck PASS；54／54 PASS |
| 独立复验 | 独立 archive 的 `c16cde7`：3 个专项 PASS，其中 4 次 browser proof；0 findings |
| 历史全量回归 | `386b965` 的 303／303 保留为历史记录，不声称在 `c16cde7` 全量重跑 |

54 项覆盖正文像素、长文、隐藏／透明／裁剪、滚动期间正文篡改、媒体 partial、当前 Actor 只读恢复、防重复和最终撤权边界。独立 reviewer 另验证 smooth 页面在滚动时篡改后还原正文仍拒绝、固定不透明遮挡仍拒绝，并执行新增 partial 恢复场景。执行、仅审查的既有结果和证据边界见 [本轮 manifest](evidence/continuation-20261103/manifest.json)。

The 54 targeted tests cover pixel proof, long text, concealment, scroll-time mutation, partial media, current-actor read-only recovery, duplicate prevention and final authorization boundaries. The independent reviewer additionally executed adversarial smooth-scroll mutation and opaque-overlay cases, plus the new partial-recovery case. The manifest distinguishes executed checks from reviewed historical results.

复跑代码测试：

```bash
git checkout --detach c16cde700963959d3fd7fc226853b71f5551573a
npm ci
npm run typecheck
node --test --test-concurrency=1 test/render-scroll.test.ts test/review-i1.test.ts test/recovery-media.test.ts test/media-authority.test.ts
```

使用独立 checkout、Node.js 24.18.x 和 Chromium。上述测试不需要真实平台凭据，不替代 Nyx／Ghost 或外部平台实测。

Use an isolated checkout, Node.js 24.18.x and Chromium. These tests need no real provider credentials and do not replace native integration or external-provider acceptance.

## 历史首次核验失败的边界

旧单图补充实验的日志只能定位到物化后的 `proveOriginal`；尚不能证明 false 来自静态元数据、DOM body 或 renderer 的哪一个子阶段。该次图片字节已匹配，随后当前 Admin 用原 renderer 零写认回成功，完整失败与恢复证据仍在[历史运行索引](evidence/followup-20261102/combined/run-index.json)。已检查的默认 Ghost 主题没有 smooth-scroll 配置，不能把本次独立复现的滚动缺陷当作历史事故根因。

The historical log locates the failure within post-materialization `proveOriginal`, without identifying whether metadata, DOM body or renderer checks returned false. Image bytes matched, and a later current-Admin read-only operation recognized the publication with the unchanged renderer. The inspected default Ghost theme did not configure smooth scrolling, so the newly reproduced defect is not asserted as the cause of that incident.

本轮为固定旧源码生成独立诊断副本，记录静态／body／renderer／完整性／可见性／paint 子阶段及耗时，不记录正文、凭据或查询参数；不增加等待、重试或放宽检查。副本仅用于诊断，成功不能代替原版源码正控。历史问题继续标为 **CAUSE_NOT_DETERMINED**；一次或数次未复现不证明首次核验已经普遍稳定。

An instrumented copy of the pinned baseline records stage outcomes and timings without content or credentials. It adds no waits, retries or relaxed checks, and is used only for diagnosis. Its success cannot replace fixed-source controls. The historical cause remains **CAUSE_NOT_DETERMINED**; bounded successful runs do not establish universal first-attempt stability.

## 真实实验、运行与 Git 交付

本轮真实实验使用新的专属 Nyx 身份／组织／client／service／连接，及独立 Ghost／MySQL／SQLite 卷、API `3578` 和 Ghost `3588`。不复用现有用户队列；不直连或清理 live Mongo，通过现有 Nyx API 管理专属对象。Nyx 服务本身仍是本地补丁 `049ee1c`，不是原版 upstream 或独立 Nyx 部署验收。实验与运行读回分别入 manifest，Git 结果按实际回执追加记录。

The native experiment uses a fresh dedicated Nyx cohort and independent Ghost/MySQL/SQLite resources on ports 3578/3588. It does not reuse existing queues or directly access or clear live Mongo; dedicated identity objects are managed through the existing Nyx API. The identity server remains the local `049ee1c` patch, not an unmodified upstream build or a separate Nyx deployment. Native results and runtime readback are in the manifest; Git delivery is added after actual readback.

| 实验 | 实际结果与边界 |
| --- | --- |
| 旧 `386b965` 标准主题 | 首图物化、前后 renderer 均通过；脚本随后误对 published 记录发 reconcile，收到 409，整轮保留 FAILED_OR_INCOMPLETE |
| 旧版诊断副本 | 完整诊断轮 PASS，56 条子阶段事件没有 false；排除在原版正控之外 |
| `c16cde7` 标准主题 | `native-c46b0ca1cc76` 完整 PASS，5 个有界 case，原 renderer |
| `c16cde7` smooth 主题 | `native-aa23abb98c50` 完整 PASS，5 个有界 case，原 renderer；仅合成新 post 的 head 增加 CSS，正文不变 |

两次候选实验都验证：缺图前置由 harness 暂停第一次物化构造；旧 active／revoked media 请求被当前 Admin 只读终结，零 Ghost 写、零物化；新授权恰好物化一张并读回 MIME／bytes hash，`published / complete`；随后正式下线，公开 URL 返回 404。补图已成功的 terminal release 不再强行 reconcile，故本轮没有新增“首次失败后只读认回成功”的 Native 结果。该分支由新目标回归与历史真实证据分别支撑。

Both candidate runs use a declared missing-media precondition, retire active/revoked old requests through current-Admin read-only operations with zero writes/materializations, publish exactly one fresh image with matching MIME/bytes, and formally unpublish the same remote original. Successful terminal releases are not forced into reconciliation. The post-failure read-only-success branch is covered by the new targeted regression and separately pinned historical native evidence, not claimed as a new native result.

网络地址池耗尽、一次主题设置 API 500、terminal reconcile 409，以及清理校验中的 mount 顺序／WAL 只读 SHM 问题均保留。只修正实验准备或校验脚本，未弱化业务校验。4 个本轮容器已停止，4 个新卷及证据保留；新 Nyx cohort 已停用，实验收尾核对 121 个原容器的 ID／image／mount 集合／运行状态与原先一致，9 个端点健康。后续主 CMS 切换另有独立回执。

Setup and harness failures are retained: exhausted default network pools, one theme-settings API 500, terminal-reconcile 409, and cleanup checks affected by mount ordering and a read-only WAL/SHM condition. Only experiment or verification scripts were corrected. All four experiment containers are stopped, four new volumes and evidence retained, and the new Nyx cohort retired. Cleanup preserved the 121 pre-existing container identities and states with nine healthy endpoints; the subsequent main-CMS switch has its own receipt.

本地 3457 现运行 `c16cde7`，容器 `blogsystem-command-candidate-c16cde700963-r2`。root 与独立 reviewer 实际核对 231 个 Git 文件（含交付文档）、API／Worker／模板、36 表全部既有行及 schema，队列为空、pause=false、9 端点 200。没有 schema 增量；原 `386b965-r2` 和 `0b0e9d1` 停止保留。升级前备份保留，失败回滚只切换运行代码并保留当前数据，不用旧备份覆盖新写入；只运行本地 release／projection Worker。

Local port 3457 now runs `c16cde7` in the named candidate container. Root and independent readback verified 231 Git files including documentation, API/Worker/template identity, all prior rows in 36 tables, unchanged schema, empty queues, pause=false and nine HTTP-200 endpoints. The prior `386b965-r2` and `0b0e9d1` containers and backups remain retained. Rollback switches runtime while preserving current data; no external DeliveryWorker is enabled.

用户在本轮明确沿用现有本地 NyxID／CMS。当前目标为 Nyx 门户 `http://localhost:3000`、API `3001`、CMS `http://localhost:3457`。升级后重新登录同一有权 operator，仅 GET 读回现有 catalog 与 35 项已注册契约，与前次正式注册 postimage 完全一致；runtime service 绑定及 OpenAPI paths 相同，零 catalog 修改。既有门户／直接入口同身份的浏览器证据按其原 SHA 保留，不冒称本轮重跑。

The user selected the existing local NyxID/CMS as the continuation target. A fresh authorized operator readback after the upgrade confirms the same catalog, all 35 registered contracts, runtime service binding and OpenAPI paths, with zero catalog mutations. The earlier portal/direct browser identity evidence retains its pinned version rather than being described as rerun here. Selecting a separate remote Nyx/CMS deployment is no longer a current local blocker.

本轮修复与交付文档已正常推送到 `origin/codex/003-blogsystem-delivery`，已验证提交为 `afb3304425a1a8e13e00eb6ef9abad54435374fa`，`main` 仍为 `019222c73f406015ba00557d782103f6b61500d5`。[既有 PR #1](https://github.com/aelf-hzz780/chronoai-cms/pull/1) 的正文已通过登录 Chrome 更新；connector 的 403 保留为工具权限限制。公开 REST 读回确认 open／draft／未合并及该 head；正文仅有浏览器提交产生的 CRLF 与文件 LF 差异，归一行尾后逐字一致，不声称原始 bytes 相同。见[实际 Git／PR 回执](evidence/continuation-20261103/git-delivery-receipt.json)。回执固定引用已验证的父提交；后续仅文档的回执提交及最终远端 head 记入本机最终台账，避免自引用 SHA。

The fix and delivery documentation were normally pushed to `origin/codex/003-blogsystem-delivery` at verified commit `afb3304425a1a8e13e00eb6ef9abad54435374fa`; `main` remains `019222c73f406015ba00557d782103f6b61500d5`. The existing PR body was updated through authenticated Chrome after the connector returned a permission-related 403. Public REST readback confirms the open, draft, unmerged PR and its head. Its content matches the prepared file exactly after CRLF-to-LF normalization only; raw bytes differ. The receipt pins the verified parent, while the subsequent documentation-only receipt commit and final remote head are recorded in the local completion ledger to avoid a self-referential SHA.

## 必需外部输入与后续执行

[外部验收执行清单](continuation-external-handoff-20261103.md)已将六个交接工作包整理为最小输入、步骤、证据和停止／回滚条件。现有本地 Nyx／CMS 已选定；仍需证明个人／组织 Ghost 在配置的公开域名或子域名上可访问，取得真实 DEV／Hashnode 账号、资格、精确连接与内容动作批准，以及 Medium／HackerNoon 账号和人工负责人；完成真实副本生命周期／恢复、容量费用、监控隐私、付款运维与备份恢复交接及最终签收。无需另行部署远端 Nyx／CMS，也不凭空要求生产云主机或数值 RPO／RTO。

The handoff checklist records the selected local environment and the remaining required outcomes: publicly reachable personal/organization Ghost domains, suitable real provider accounts and authorized actions, assisted-submission ownership, real-copy lifecycle/recovery, operational responsibilities and final acceptance. A separate remote Nyx/CMS deployment, production cloud host or numeric RPO/RTO is not imposed. Required outcomes are not converted to N/A or replaced by local tests.

本地 R031、W1／W2、门户同身份入口及 35 操作注册的已完成有界结果继续有效。没有新增所有 Nyx credential／transport、定时发布、自助开站、自动域名、个人 Hashnode 或额外平台要求。heartbeat 保持 **PAUSED**；不自行 merge、购买订阅或部署生产。

Existing bounded R031, W1/W2, portal identity and registration results remain valid. No additional platform, credential-mode or scheduling requirements are introduced. The heartbeat remains **PAUSED**; merge, purchases and production rollout are not performed automatically.
