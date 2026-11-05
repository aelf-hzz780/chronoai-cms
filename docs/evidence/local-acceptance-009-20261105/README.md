# 009 本地验收证据 / Local acceptance evidence

本目录对应 [009 报告](../../009-local-acceptance.md)，结论为本轮可执行本地验收通过，正式 D1–D9 仍为 **NOT_ACCEPTED**。业务代码固定于 `9c03c403d0fe7bad41785e49b68bab2a7a6f35a4`；较早专项检查分别绑定其记录中的 commit。验收 helper 与最终受测文件的指纹见 `verified-source-fingerprints.json`，随本证据提交归档。

This directory supports the [009 report](../../009-local-acceptance.md). Feasible local checks in this run pass; formal D1–D9 remain **NOT_ACCEPTED**. Final application code is pinned to `9c03c403d0fe7bad41785e49b68bab2a7a6f35a4`; earlier focused checks retain their own revisions. `verified-source-fingerprints.json` binds the tested helpers and application inputs archived with this evidence commit.

| 文件 / Files | 含义 / Meaning |
| --- | --- |
| `summary.json`, `test-summaries.json` | 分层结果、版本及标准测试摘要；不同层测试不能累加为完成率 / Layered results, revisions and test summaries, not an overall completion percentage |
| `native-roles.json` | 真实官方本地 NyxID 到 CMS/Ghost 角色链 / Real official local NyxID to CMS/Ghost role checks |
| `generated-tools*.json` | 56 项 catalog/tools 与九个无 body POST 的实际传输；未知资源返回拒绝，不是 NyxBot 模型完成业务 / Actual catalog/tool transport; denial on unknown resources is not a model completing a business flow |
| `four-ghost.json`, `restore*.json`, `four-ghost-cleanup.json` | 真实 Ghost/MySQL、synthetic 身份的八组合与新卷恢复、只读全表比对和清理 / Eight combinations on real Ghost/MySQL with fixture identity, new-volume recovery, read-only comparison and cleanup |
| `external-recovery-*.json` | 含非空外部分发数据的加密恢复，本地 HTTP provider / Nonempty external-data recovery with a loopback provider |
| `operations*.json`, `nginx.json`, `contracts.json` | 运维可执行块、配置和契约检查 / Executable runbooks, configuration and contracts |
| `render-*.json`, `four-ghost-attempts.json` | 保留失败及有界复验，不删除候选版本的失败 / Preserved failures and bounded retests |
| `studio-*.png` | 隔离 fixture UI 截图 / Isolated fixture UI screenshots |

归档只含白名单结果和脱敏摘要；不包含数据库、私钥、登录凭据、原始配置或原始 HTML。`_provenance.source` 为私密运行目录内的相对来源标识，`sourceSha256` 证明对应原始文件的指纹，不代表原始文件已公开。`manifest.json` 列出本目录除自身外全部文件的 SHA256；`verified-source-fingerprints.json` 中非 `_provenance` 字段对应仓库根相对路径。

Only allowlisted results and sanitized summaries are archived, excluding databases, private keys, credentials, raw configuration and HTML. `_provenance.source` identifies a relative file in the private runtime archive; `sourceSha256` fingerprints that source without publishing it. `manifest.json` hashes every file here except itself. Non-`_provenance` entries in `verified-source-fingerprints.json` are repository-relative paths.

`four-ghost-attempts.json` 保留十份报告，多个续跑属于同一 publication run。早期网络、媒体 staging、权限投影、渲染及恢复 helper 失败都保留；首轮尚未创建的 project 曾被旧清理逻辑标为 false，最终成功轮的十六个容器停止状态以 `four-ghost-cleanup.json` 为准。身份 fixture、HTTP provider、协议传输、Linux 语法检查均不能替代真实外部平台或生产验收。

Ten reports are preserved in `four-ghost-attempts.json`; multiple continuations belong to the same publication run. Network, staging, projection, render and recovery-helper failures remain visible. An early nonexistent project was marked false by the old cleanup logic; `four-ghost-cleanup.json` records final successful cleanup of all sixteen containers. Fixtures, protocol transport and configuration syntax checks do not establish real external-provider or production acceptance.

## 复跑 / Replay

在隔离 checkout 使用 Node `>=24.18.0 <25`、`npm ci` 安装的锁定依赖以及可用 Chromium。以下命令从仓库根执行；标准测试已包含三项外部恢复，不要把单独执行计数再加一次。

Use an isolated checkout, Node `>=24.18.0 <25`, locked dependencies installed with `npm ci`, and available Chromium. Run from the repository root. The standard suite already includes the three external-recovery tests; a focused run is not an additional count.

```sh
npm run check
npm run test:local-publishing
node --test scripts/native-nyxid-migration.test.ts
node --test test/external-publication-recovery.test.ts
```

四站 helper 要求已准备 `colima-blogsystem` Docker context、脚本中固定的 Ghost/MySQL digest、`blogsystem-review-runtime:node24-chromium-20261029` 测试镜像和空闲的 source `33568/33569/33578/33579`、restore `33668/33669/33678/33679` 端口。它创建独立 project/网段/卷、生成私密配置、备份并恢复；停止自己创建的容器，保留证据与卷。不要将输出或凭据目录加入 Git。失败续跑只接受自身记录和精确 project 标签，不允许借用共享服务。

The four-site helper requires the prepared `colima-blogsystem` Docker context, the pinned Ghost/MySQL digests in the script, the `blogsystem-review-runtime:node24-chromium-20261029` test image and free source/restore ports listed above. It creates isolated projects, networks, volumes and private configuration, then captures and restores. Its containers are stopped while evidence and volumes remain. Never commit its private output. Continuations require their own failed record and exact project labels; shared services cannot substitute.

```sh
python3 scripts/local-acceptance-009-four-ghost.py
```

generated-tools helper 的参数顺序为：独立官方实例 migration manifest、私密 fixture JSON、输出目录。fixture 提供 `nyxidUrl`、`cmsRelayUrl`、`admin.email/password`；管理账号须通过官方空库 setup 正常建立。只使用 loopback 独立实例与专属端口，先配置普通官方可达路由；不放宽 SSRF 或审批。helper 新建专属 catalog/service/key，逐次批准并在 finally 撤销临时 key；例行复跑不能拿共享实例的管理配置替代这些前提。具体字段由 `scripts/local-acceptance-009-generated.ts` 与既有迁移文档定义。

The generated-tools helper takes an isolated official-instance migration manifest, private fixture JSON and output directory. Fixture fields include `nyxidUrl`, `cmsRelayUrl` and `admin.email/password`; create the administrator through normal official empty-database setup. Use a loopback isolated instance and dedicated ports with an ordinarily reachable route, preserving SSRF and approval policies. The helper creates its own catalog/service/key, approves each request and revokes its temporary key in `finally`. Shared-instance administration is not a substitute. The script and migration documentation define the remaining fields.

正式共享服务切换、目标 Linux systemd、真实账号和上线验证在主报告单列；本目录不宣称这些工作完成。

Shared-service rollout, target Linux systemd, real accounts and production verification remain separate work in the main report.
