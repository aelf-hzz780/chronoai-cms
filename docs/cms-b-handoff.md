# CMS B handoff / CMS B 交接

> 2026-11-05 更新：当前 Git 交付范围、真实 NyxID 和组织英文 Ghost 首发结果见 [交付更新](cms-delivery-update-2026-11-05.md)。以下保留最初交接时的验收边界；其中“联调后置／没有 push”属于历史状态。
>
> Update (2026-11-05): see the [delivery update](cms-delivery-update-2026-11-05.md) for current Git scope and real NyxID/Ghost acceptance. The sections below preserve the original handoff; deferred integration and no-push statements are historical.

本文件交接已批准 WP00–08 的实现、验收边界和后续上线步骤。真实 NyxID 位于另一台机器，用户明确要求后置联调。本地验收使用真实 CMS 服务、SQLite、session/CSRF 与隔离身份；公开站另有本机真实双 Ghost 证据。外部平台 fixture 不代替真实账号或生产批准。

This handoff separates implementation and local acceptance from the deferred real NyxID integration. Local browser acceptance uses the actual CMS services, SQLite and session/CSRF with isolated identity. Actual local dual-Ghost evidence is recorded separately; external-provider fixtures are not production approval.

## Entry points / 入口

新工作台为 `/studio`，旧入口 `/` 保留，共用 API 与数据。默认英文，可切简中；界面语言、文章语言与 Ghost 站点语言独立。每个 owner 的 EN/ZH 是独立 Ghost 实例与独立文章修订；关联译文不代表自动翻译或同时发布。

Studio is served at `/studio`; `/` retains the old interface with the same APIs and storage. UI locale, article language and Ghost publication language are independent. Translation links connect separate articles; they neither translate nor publish a second article automatically.

页面与 API 的验收以 `cms-b-acceptance.md` 为准；合同为 `cms-b-integration-contract.md`，连接配置为 `connection-setup.md`，分发计划/观察/备注为 `distribution-followup.md`，主题为 `ghost-b-theme.md`。

The acceptance matrix and linked contract documents are the source of truth for page coverage, connection setup, distribution follow-up and theme packaging. Historical evidence directories retain their original revision boundaries.

## Build and launch / 构建与启动

使用项目声明的 Node `>=24.18.0 <25`，按 lockfile 安装依赖，然后运行 `npm run check`。发布前必须执行 `npm run build:studio` 并携带 `web/studio/dist` 产物。`npm run dev` 与 `npm test` 会先构建；直接执行 `node src/main.ts` 或既有 systemd 启动命令不会隐式构建浏览器代码。

Use the declared Node runtime and lockfile. Run `npm run check`, then ensure the release contains the output of `npm run build:studio`. Development and test scripts build automatically; direct production entry points require a prior build. No new frontend framework or runtime CDN is introduced.

保留原环境和密钥管理。站点 key、Nyx 凭证、作者映射、公开媒体与私有 staging 都是运维配置；浏览器不接收这些凭证。新增连接配置可缺省，缺省时呈现明确不可用，不使用其他个人账号替代组织账号。生产 OIDC return 和 `/connections/return` 是不同的固定回程，部署时分别核对注册。

Retain existing secret management and operator-provisioned sites, authors and media mounts. Missing optional connection setup remains explicitly unavailable. Register and verify the distinct OIDC and connection-return URLs; never substitute personal credentials for an organization binding.

## Local preview and validation / 本地预览与验收

`test/studio-live-api.integration.ts --serve` 是独立验收入口，默认仅监听 `127.0.0.1:4174`，使用隔离内存数据库；身份和外部账号均为 fixture，不启动外部分发 Worker。它不属于生产启动链。界面显示验收提示；刷新保留当前进程的数据，重启重新生成 fixture。

The acceptance preview listens on loopback with an isolated in-memory database. Its identity and provider adapters are explicit fixtures; no external delivery worker runs. It is never imported by production. Refresh preserves the current process data; restarting resets the fixture.

浏览器验收截图默认写 `.runtime/studio-acceptance`；可用 `STUDIO_EVIDENCE_DIR` 指定新目录。固定 `7ee8802` 独立导出后通过类型检查/构建、419/419 标准测试、7/7 实际 CMS API 浏览器流程，覆盖连接/批准、人工分发/计划/备注、双语编辑、任务、治理和双入口回退；完整证据见 `evidence/cms-b-final/`，没有覆盖历史截图。

Browser evidence defaults to an ignored runtime directory, or a new `STUDIO_EVIDENCE_DIR`. Preserve historical snapshots when rerunning. The pinned `7ee8802` export passed typechecking/build, all 419 standard tests and seven actual API browser flows. Final evidence is in `evidence/cms-b-final/`, including connection/approval, manual distribution/plans/notes, editing, tasks, governance and old/new-entry rollback.

本机 Ghost 为英文 `http://localhost:2468`、中文 `http://localhost:2469`。已实际上传/临时激活 B fixture 主题，并通过 CMS 发布、作者、语言互链、consent/GPC/DNT 和 CMS 离线阅读验收。合成文章恢复草稿，原主题恢复；没有修改既有文章。正式主题包的维护邮箱仍待配置，这与是否向 Ghost 提 PR 无关。

The existing local Ghost instances passed native theme and actual CMS publishing acceptance, including attribution, translation links, consent and offline reading. Synthetic posts were unpublished and previous themes restored. A real maintainer email remains a release-package configuration item, unrelated to upstream pull requests.

## Rollout and rollback / 上线与回退

1. 固定候选 commit、source fingerprint、浏览器构建产物及 OpenAPI/operation 差异；保存当前注册前像。这里生成的合同不代表已更新远端 Nyx 注册。
2. 先备份 SQLite 与 Ghost 数据，并在隔离环境验证；新增 migration 2/3/4 是 additive，不把历史未知执行回填为成功。
3. 保持旧入口，将 `/studio` 作为先行入口。用真实当前成员/组织/两语言和精确连接完成预发布联调，外部文章写入须另有具体内容与账号授权。
4. UI 回退只切入口或静态资源，不还原旧数据库、不回滚外部发布事实。出现出站异常先暂停相关写入，保留任务/Trace，再走只读核验和新的明确确认。
5. 数据恢复沿用现有隔离恢复流程：失效旧 session、OIDC state 和连接 token URL/nonce；未知连接创建保留 unknown 标记。不得复活旧批准、自动重发或把本地取消当成外部已取消。

Pin and retain release artifacts and registration preimages; back up and validate data in isolation. Roll out Studio alongside the old entry. UI rollback must preserve new records and external facts. Restore procedures invalidate sessions and connection-return secrets while retaining unknown-result barriers; recovery never reuses old approvals or silently resends work.

## Deferred external acceptance / 后置外部验收

- 真实 NyxID：当前部署版本与固定 upstream 合同、OIDC、组织目录、hosted/operator 连接返回、精确批准和 operation/scope 注册，按用户要求后置。
- DEV / Hashnode / Medium / HackerNoon：实际账号资格、组织归属、订阅与具体内容批准、公开副本/移除/授权计数证据，尚未由本轮 fixture 证明。
- 部署拓扑：公开域名、作者映射、各语言共享媒体挂载和私有 staging；本轮实际双 Ghost 联合测试不覆盖宿主机到 Docker volume 的私有图片提升路径。
- 正式发布：维护邮箱、目标环境和具名运维签收；本轮无生产部署、远端注册写入或 Git push。

Real NyxID, real destination accounts and exact content approval, deployment-specific public media mounts, release metadata and named operational sign-off remain separate gates. The user deferred NyxID live integration. This implementation does not claim production deployment, registration changes or real external publication.

## Local source preservation / 本地源码保留

实现 checkout 为 `/tmp/chronoai-cms-review-20261103`，分支 `codex/004-cms-b-integration`；不在原 BlogSystem 工作区混入业务变更。交付后另以完整 Git bundle 保存在原工作区的忽略目录 `/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/.runtime/cms-b-20261103.bundle`，保留本地提交和证据，不包含未跟踪的运行时凭证。没有 push。

The implementation remains in a separate checkout. A full local Git bundle preserves the branch and tracked evidence outside the temporary directory; untracked runtime credentials are excluded. No push occurred. Restore to a new path, using the bundle as the local clone source and selecting `codex/004-cms-b-integration`; then install the locked dependencies and build Studio.

本地预览入口为 `http://127.0.0.1:4174/__acceptance/session/admin`（或 `/member`）；当前进程在后台运行，日志与 PID 位于实现 checkout 的 `.runtime/studio-preview.log` 和 `.runtime/studio-preview.pid`。重启电脑后需在该 checkout 使用 Node 24、先构建，再执行 `node test/studio-live-api.integration.ts --serve`。如需查看组织示例，工作区选择 `ChronoAI · acceptance workspace`。4173 仍是原型。

The preview is a background local process, not an installed system service. After a restart, build Studio and run the acceptance harness with `--serve`; it resets its isolated in-memory fixture. Select the acceptance organization to see the seeded workflow. Port 4173 remains the prototype.
