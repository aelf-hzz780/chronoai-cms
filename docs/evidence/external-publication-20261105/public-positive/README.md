# 个人 DEV 公开正向验证 / Personal public DEV verification

本轮独立结论为 `PASS_PERSONAL_DEV_REAL_CREATE_UPDATE_REGISTER_TYPED_SYNC`：个人 DEV 公开 create、同一副本 update、CMS register 和配置为 `gpt-6.1-sol` 的真实 NyxBot 实际 generated typed sync 均通过限定范围验证。整个项目及完整 D1–D9 仍为 `NOT_ACCEPTED`。机器可读入口为 [summary.json](summary.json)，最终独立报告为 [review-live-final-eff6c5f.json](review-live-final-eff6c5f.json)。

The independent verdict is `PASS_PERSONAL_DEV_REAL_CREATE_UPDATE_REGISTER_TYPED_SYNC`: personal public DEV create, update of the same copy, CMS registration and actual NyxBot generated typed sync, configured for `gpt-6.1-sol`, passed within the bounded scope. Whole-project and complete D1–D9 acceptance remain `NOT_ACCEPTED`. Start with [summary.json](summary.json) and the [final independent report](review-live-final-eff6c5f.json).

公开文章为 [Verifying a NyxID-managed publishing workflow](https://dev.to/aelfhzz780/verifying-a-nyxid-managed-publishing-workflow-5bmh)，remote ID `4980723`。create/update 使用业务 commit `829b5373642d906164701a889c8f5daa2c05a185`；schema 修复、generated sync 与最终回读固定于 `eff6c5fecee106f52addaf93297010670bd9bb02`，正式 `src/main.ts` 进程 PID `73122`。版本与 source hashes 见 [runtime-provenance.json](runtime-provenance.json)。

The public article is [Verifying a NyxID-managed publishing workflow](https://dev.to/aelfhzz780/verifying-a-nyxid-managed-publishing-workflow-5bmh), remote ID `4980723`. Create/update ran at business commit `829b5373642d906164701a889c8f5daa2c05a185`; the schema fix, generated sync and final readback are pinned to `eff6c5fecee106f52addaf93297010670bd9bb02`, with production entrypoint `src/main.ts`, PID `73122`. Versions and source hashes are recorded in [runtime-provenance.json](runtime-provenance.json).

| 验证 / Verification | 结果 / Result | 证据 / Evidence |
| --- | --- | --- |
| create 独立只读回读 / Independent create readback | 21/21 PASS | [public-create-readback.json](public-create-readback.json) |
| update 独立只读回读 / Independent update readback | 32/32 PASS | [public-update-readback.json](public-update-readback.json) |
| 修复后正式进程最终回读 / Final readback after fix | 32/32 PASS | [public-final-readback-eff6c5f.json](public-final-readback-eff6c5f.json) |
| 无凭据公开页面 / Public page without credentials | HTTP 200 | [public-dev-page.json](public-dev-page.json) |
| 模型 create/update + register 独立审计 / Independent native create/update + register audit | 29/29 + 30/30 PASS | [model-create-update-audit.json](model-create-update-audit.json) |
| 实际 generated typed sync 独立审计 / Actual generated typed sync audit | 28/28 PASS | [model-generated-sync-audit.json](model-generated-sync-audit.json) |
| OpenAPI 与实际 catalog / OpenAPI and live catalog | 6/6 PASS；3 个操作 / operations | [ir05-live-catalog.json](ir05-live-catalog.json), [schema-mcp-contract-verified.json](schema-mcp-contract-verified.json) |
| 独立无 body HTTP 测试 / Independent no-body HTTP tests | 3/3 PASS | [review-live-final-eff6c5f.json](review-live-final-eff6c5f.json) |
| 开发侧标准检查 / Developer full check | 514 PASS, 0 failed | [schema-fix.json](schema-fix.json) |

各 phase 的 `driverApprovesRequests: false` 仅表示运行 driver 不自动审批；另有 exact-phase companion 在既有明确用户授权内核对 method、path、冻结 body 与 active turn 后执行单次审批，未改变审批策略。成功 create/update 的各自 native capture 分别记录一次 `POST` 与一次 `PUT`，每次均与冻结请求及逐请求审批匹配。写次数仅属于这两个已审阅观测窗口，不是全部历史 DEV 写次数。generated sync 窗口只含一次 typed sync 和一次工具搜索，DEV 工具调用为 0；这些工具计数也不等同完整服务端出站审计。最终同步时间为 `2026-11-05T09:25:35.168Z`，见 [generated-sync-verified.json](generated-sync-verified.json)。

Each phase’s `driverApprovesRequests: false` means only that the run driver did not approve requests. A separate exact-phase companion matched method, path, frozen body and active turn before executing single-request approvals under existing explicit user authorization; approval policy was unchanged. The successful create/update native captures record one `POST` and one `PUT`, respectively, each matching its frozen request and per-request approval. Those counts apply only to the two reviewed observation windows, not all historical DEV writes. The generated-sync capture contains one typed sync and one tool search, with zero DEV tool calls; tool counts are not a complete server-egress audit. The final sync timestamp is `2026-11-05T09:25:35.168Z`; see [generated-sync-verified.json](generated-sync-verified.json).

历史失败保留在 summary：早期 localhost 尝试出现 timeout / `outcome_unknown`，后续 canonical URL 被 DEV 以 HTTP 422 拒绝，该旧 intent 已取消。create 阶段首次 generated sync 又在到达 CMS 前因空 body schema 被拒绝。原 [create/update 审计](model-create-update-audit.json) 中的 `modelSyncPassed: false` 反映当时状态；后续真实 typed sync 和独立回读闭环才关闭 [008-IR05](008-IR05.json)。operator 只读同步及 `TURN_COMPLETED` 均不能单独证明模型业务成功。

Historical failures remain in the summary: early localhost attempts produced a timeout / `outcome_unknown`, followed by DEV HTTP 422 rejection of the canonical URL; that old intent was cancelled. The first generated sync in the create phase was then rejected by the empty-body schema before reaching CMS. `modelSyncPassed: false` in the original [create/update audit](model-create-update-audit.json) describes its review-time state; only the later real typed sync and independent readback closed [008-IR05](008-IR05.json). Operator read-only sync and `TURN_COMPLETED` do not independently prove model business success.

本次仅修复 external-publication 的 `reconcile`、`sync`、`cancel` 三个无 body 操作。catalog 共 56 项，本次更新 3 项、其余 53 项未动；另有旧 9 项空 body 声明欠账仍需单独评审，具体列表保存在 [schema-fix.json](schema-fix.json)。不能将本次修复描述为全服务 schema 已清零。

This fix covers only the three bodyless external-publication operations: `reconcile`, `sync` and `cancel`. Three of the 56 catalog entries changed and 53 remained untouched. Nine pre-existing empty-body declarations still require separate review and are listed in [schema-fix.json](schema-fix.json). This is not a claim that all service schema debt is cleared.

Ghost 原文与 canonical 仍为 loopback 地址，本次仅是获准的技术验收，不证明公网原文可访问、生产部署或长期定时同步。个人工作区通过不扩大为 organization exact Admin approval、Hashnode/Medium/HackerNoon、完整 D6/D7 或全项目通过。PR 创建曾受 connector 权限阻挡；此处证据不改变 PR 权限或状态。usage ledger 无记录，不宣称已取得上游模型响应回显证明。

The Ghost original and canonical URL remain on loopback. This is an authorized technical test and does not establish public-original availability, production deployment or indefinite scheduled sync. Personal-workspace success does not extend to organization exact Admin approval, Hashnode/Medium/HackerNoon, complete D6/D7 or whole-project acceptance. PR creation was previously blocked by connector authorization; these records do not change PR permissions or state. The usage ledger is empty, so upstream model-response echo verification is not claimed.

归档采用显式字段白名单：仅保留状态、独立检查、公开 DEV 标识、版本、时间、摘要哈希及必要请求元数据；不保存凭据、原始工具参数、文章正文或 private capture 内容。`source` / `sourceEvidence` 中的路径相对于原 runtime 证据根目录，`sourceSha256` 属于原证据文件；这些哈希不代表脱敏后归档文件的哈希。旧目录仍保存先前阶段证据，以下新结果不回写旧现场结论。

The archive uses explicit field allowlists: statuses, independent checks, public DEV identifiers, versions, timestamps, hashes and necessary request metadata. Credentials, raw tool arguments, article bodies and private-capture contents are excluded. Paths under `source` / `sourceEvidence` are relative to the original runtime evidence root, and `sourceSha256` identifies the original files, not these sanitized copies. Earlier evidence remains in the parent directory; these results do not rewrite its historical observations.
