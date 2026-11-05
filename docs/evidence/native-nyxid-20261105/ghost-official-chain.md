# 固定官方 NyxID → CMS → 独立本地 Ghost

追加验收结果：**8/8 PASS，本轮 3 次实际 Ghost 写入，3 个队列阻断场景零新增写入**。相比上一轮增加 10 次真实 proxy GET、32 条验收断言，覆盖四身份连接列表权限及六个任务的 CMS API 状态读回。这不改变 M0 的组织自动外部分发缺口，也不构成最终验收。

业务源码固定为 CMS `c7e9376f2110a6085d0c318c3bbabc526de52087`；NyxID 固定为官方 `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`（运行版本 0.75.0）。两个新增 Ghost 均为官方 6.73.0，镜像 `ghost@sha256:4195f6c405e40230cd10c0770425cf500c1f542a96e9f6584c11649c150e5a89`，独立 SQLite/content volumes。没有修改任何已有四 Ghost 或 baseline 站点。

## 链路与证据来源

四个隔离原生身份分别拥有新建 Agent Key。每个请求真正经过官方 `/api/v1/proxy/s/m0-cms-ghost/api/service/...`，官方签发新的 identity assertion 与 service delegation，经专用本地 relay 到候选 CMS HTTP listener。此运行不是捕获后重放 identity，也不是 `app.inject` 或替换 authentication 的 fixture。

仅对新建的 **CMS ingress service `m0-cms-ghost`** 设置 `approval_required=false` / `default_effect=auto_allow`，使上述 CMS 控制面请求进入候选服务。没有关闭 M0 外部分发服务的 `RequireApproval`。本轮 Ghost 发布成功不等于官方原生组织审批通过，也没有验证外部分发的审批执行。

CMS 使用真实 `AuthManager`、JWKS、introspection、组织成员 API、`NyxAuthority`、`Policy`、`PublishingService`、`ReleaseWorker`、`GhostAdapter` 和 `BrowserRenderProof`。站点/署名映射是隔离运维 fixture；组织角色来自官方 API，Publisher 由真实 Admin CMS 请求授予。个人与组织使用不同 Ghost origin。每条发布先创建文章、冻结版本并入队，再由 Worker 执行。

本地透明记录器位于 CMS 与 Ghost Admin API 之间，只记录 method/path/时间/body hash/status，不记录认证 header 或 key。成功发布还经过 Ghost Admin 读回、公开页面读回和真实 Chromium 渲染核验。三个负例读取 Ghost 确认没有生成对应文章。

| 场景 | Ghost 写入数前后 | 结果 |
|---|---:|---|
| 四原生身份、当前角色、Member 禁止自行授 Publisher | 0 → 0 | PASS |
| 四身份通过官方 proxy 列出 owner connections | 0 → 0 | Personal / Admin / Publisher 200；Member 403 |
| 个人无 CMS Publisher 仍可发布个人文章 | 0 → 1 | published，读回与渲染 PASS |
| 组织 Admin 发布组织 Ghost，不要求外部分发 exact 审批 | 1 → 2 | published，读回与渲染 PASS |
| 组织 Member 可提交但不能发布；Publisher 发布该版本 | 2 → 3 | Member 403；Publisher published，读回与渲染 PASS |
| 入队后、Worker 前撤销 Publisher | 3 → 3 | blocked / FORBIDDEN |
| 入队后、Worker 前取消 | 3 → 3 | cancelled |
| 入队后、Worker 前通过官方 API 移除组织成员 | 3 → 3 | blocked / FORBIDDEN |

三个队列负例在 Worker 前对**原来冻结的 actor**运行真实 `NyxAuthority.validate(..., 'queued-write')` 并通过，时间与 release Trace ID 留在 `ghost-result.json`。因此没有把凭据过期误判成业务撤权成功。原 actor 审计快照保持不变；重新授 Publisher 或恢复成员后，旧 blocked 任务也不自动复活。

连接列表分别请求 `/owners/{ownerId}/connections`：个人 owner、组织 Admin、组织 Publisher 返回 `200/[]`，组织 Member 返回 `403/FORBIDDEN`。bindings 来自**空的隔离配置**；这里验证连接列表的权限边界，没有验证真实 DEV connection 或外部连接库存。

六个 release 均通过官方 proxy 请求真实 CMS `GET /owners/{ownerId}/tasks/release/{releaseId}`，全部返回 HTTP 200。个人任务由 Personal 读取，组织任务由 Admin 读取。响应中的 `id/kind/ownerId/articleId/revisionId/state/errorCode/url/traceId` 与持久化 release 一致，`snapshot.revisionId` 与冻结版本一致。每次读回有时间、非空 **CMS task payload Trace ID**；不把缺失的 HTTP `x-trace-id` 当作证据。

| 任务 | CMS API 状态 | Payload Trace ID |
|---|---|---|
| Personal 发布 | published | `af0e7d68-cb18-49cd-875e-4a456872bfc2` |
| Admin 发布 | published | `e1e6d725-7d10-4e9b-a22f-cd65f46c8d47` |
| Publisher 发布 | published | `0b405d86-4c90-4975-9c17-5abce7745adf` |
| Publisher 撤销 | blocked / FORBIDDEN | `3d438044-f916-402f-976c-be481b0dce54` |
| 取消发布 | cancelled | `e562d3b5-1675-494b-a02b-0856a73729eb` |
| 原生成员移除 | blocked / FORBIDDEN | `888858d8-0da3-4c51-8bc8-ecc02103771f` |

32 条新增断言分别为：connections 4 个 HTTP 状态、3 个空数组、1 个 FORBIDDEN code；每个 task 的 HTTP 状态、持久化字段匹配、非空 Trace ID、冻结版本匹配，共 6 × 4 条。本轮全部 33 个 HTTP 检查通过。

Ghost 测试发布仅存在于新增的本地站点。本轮新增 3 篇合成文章；上一轮另有 3 篇，未删除或覆盖。运行结束 CMS HTTP listener `127.0.0.1:33317` 已关闭，Worker 的手动 `once()` 执行结束。NyxID、两台有效 Ghost 和专用 relay 保留运行；本轮结束后 fixture 已冻结，交由主任务在固定提交的独立 checkout 复跑。

## 复跑

当前运行环境的私密 manifest：

`/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/cms-native-nyxid-20261105/m0/ghost-positive-r2/manifest.json`

以下命令重新建立隔离 CMS SQLite、重新执行四身份场景，在两个新增本地 Ghost 创建新的合成测试文章：

```bash
node scripts/native-nyxid-ghost-probe.ts \
  /absolute/path/to/private/manifest.json \
  /absolute/path/to/new/ghost-result.json
```

私密 manifest 和其引用的 key 文件不得提交。新环境可使用 `native-nyxid-ghost-fixture.py setup` 创建原生用户、组织、source connection、source Agent Keys、Ghost owner 和 integration。必须提供已经准备好的独立官方 M0 实例及两台**新建**的 loopback Ghost；helper 明确拒绝正式 3001/3003/3457/3458/37018/27019 及已有 Ghost 端口。示例：

```bash
python3 scripts/native-nyxid-ghost-fixture.py setup \
  --m0-state /absolute/isolated-m0/private/fixture.json \
  --directory /absolute/new/ghost-fixture \
  --personal-ghost http://127.0.0.1:33169 \
  --organization-ghost http://127.0.0.1:33178 \
  --cms-commit c7e9376f2110a6085d0c318c3bbabc526de52087
```

准备 Ghost 时使用官方镜像，配置 `NODE_ENV=development`、`database__client=sqlite3`、独立 content volume，宿主端口只绑定 `127.0.0.1`。每台内存限制 384 MiB；没有复用 production MySQL/Mongo。所用两个站点的精确容器名、ID 和端口已写入 `ghost-runtime.json`。

| 本任务额外资源 | 本轮后状态 | 宿主端口 / 用途 |
|---|---|---|
| `nyxid-native-ghost-personal-r2` | running | `127.0.0.1:33169`，有效个人站点 |
| `nyxid-native-ghost-organization` | running | `127.0.0.1:33178`，有效组织站点 |
| `nyxid-m0-ghost-relay` | running | 无宿主发布端口，CMS ingress 专用 relay |
| `nyxid-native-ghost-personal` | exited | 首次 setup 失败后保留的旧站点，不计入有效链路；历史配置为 `127.0.0.1:33168` |

这两台有效 Ghost 与 relay 复用本任务原有 `nyxid-m0-native-20261105` 官方隔离环境；准确资源身份以 `ghost-runtime.json` 和 `m0-runtime.json` 为准。没有触碰独立验收创建的其他 `nyxid-m0-*` 资源。

专用 `nyxid-m0-ghost-relay` 同时加入该 M0 的内部网络和 Docker bridge，端口 39017 转发到 `host.docker.internal:33317`；无宿主发布端口。CMS 自身监听 `127.0.0.1:33317`。NyxID source connection 的 endpoint 仅在该隔离登记内更新到此 relay。现有 3001 relay、NyxAgent 和 LAN 配置未动。复建时给 relay 新的唯一名称，并用 helper 的 `--relay-name` 指定；不要使用名称前缀批量清理其他验收实例。

helper 的 `configure-endpoint` / `remove-member` / `restore-member` 会用隔离人类 Admin 的原生登录会话执行控制面操作。它只更新这个 Admin 的 setup session，不替换任何已确认任务的 actor 或 delegation。

## 层级与限制

- **Document**：源码、测试入口、镜像与运行资源固定在 manifest、`ghost-runtime.json`、本文和 `ghost-result.json`。
- **Local**：真实官方 NyxID 运行实例、CMS HTTP/Worker 和两台本地 Ghost，8/8 PASS；源码 typecheck、Diff 检查通过。执行时 HEAD 为 `d67e768997ebb1bbfe530e4ffa61cf32c92bba0e`，业务 `src` 与 CMS 基线 `c7e9376f2110a6085d0c318c3bbabc526de52087` 完全一致。
- **Live**：这里的 Live 仅指实际运行的隔离本地系统。没有执行真实 NyxBot 对话、CMS 浏览器 OAuth session 入口、官方 NyxID 审批 UI、真实 DEV、外部分发或正式环境迁移。

这些队列阻断发生在 CMS 派发到 Ghost **之前**。它们不等于“NyxID 已接收外部分发请求并等待 Admin 审批后，CMS 撤权仍能阻止出站”。后者在固定版本 38bae2f 的 M0 中已有反例，继续保持 BLOCKED。

前两次运行因独立 fixture 的 Ghost key 重复 id 前缀、缺少 `NYXID_TOKEN_AUDIENCE` 而在零写入时失败；对应脱敏报告被保留，随后仅修复 fixture 后重跑。没有以修改业务源码或替换权限/渲染组件让测试通过。

上一轮 7/7 结果已按原始字节保留为 `ghost-prior-result.json`（SHA256 `cdbd0c5e99e06de1c07fbfaa4ce8caa4954512d34563aaa8356f74e919a0be22`）。其原 runtime `ghost-positive-r2/ghost-result.json` 未覆盖。本轮独立输出到 runtime `ghost-positive-r2/ghost-result-api-readback.json`，复制为仓库有效 `ghost-result.json`（SHA256 `17f5d9b7d85c961aa1491bc6cb0720b7ac2b01b4d1cbcafcd89aa1db2b27df67`）。私密 manifest、key、token、Vault 和 SQLite 均留在 `.runtime`，未纳入提交材料。
