# 本地发布闭环 / Local publishing flow

本轮目标是把个人原文发布与 DEV 分发流程在本机走到可核验结果。公网 Ghost、真实 DEV 发文和正式 D1–D9 签收不属于这次本地测试的前置条件。

This run verifies personal original publication and DEV distribution to a local, observable result. A public Ghost deployment, a real DEV publication, and formal D1–D9 acceptance are not prerequisites for this local test.

008 更新：当前正向用例覆盖 Studio 准备外部材料 → 独立本地工具经模拟 NyxID 写入模拟 DEV → Studio 回传 ID → CMS 独立 GET 登记 → 只读指标同步。CMS 不创建 DEV Worker job；三项旧 exact API/恢复用例继续运行。`test/deprecated-personal-exact-local.historical.ts` 保留旧 UI/CLI 正向用例，不属于当前自动测试。下面 2026-11-04 的结果仍是其固定历史版本的证据，不能当作 008 的执行结果。

008 update: the current positive case covers Studio preparation → an independent local tool writing simulated DEV through simulated NyxID → Studio receipt submission → independent CMS GET registration → read-only metrics sync. CMS creates no DEV Worker job, and the three legacy exact API/recovery cases still run. `test/deprecated-personal-exact-local.historical.ts` preserves the old UI/CLI positive case outside the current automatic tests. The 2026-11-04 results below remain evidence for that historical version, not execution results for 008.

## 已完成结果 / Verified result

2026-11-04，在固定 commit `9cdd164ccdf537345d46909006b072a741132ff3` 上，`npm run check` 为 **442/442 通过**，`npm run test:local-publishing` 为 **4/4 通过**，均无失败或跳过。主流程真实 CLI 回执 `published`、`sourceVerified=true`；本地 DEV 仅一次写入、一次 exact redeem，重复 CLI 返回 `DELIVERY_NOT_RUNNABLE`。未批准／过期、提交后丢响应只读恢复和指定任务隔离均通过。全部模拟服务与浏览器已关闭，临时数据已清理。

On 2026-11-04, fixed commit `9cdd164ccdf537345d46909006b072a741132ff3` passed **442/442** checks and **4/4** local integration tests with no failures or skips. The actual CLI returned `published` and `sourceVerified=true`, with exactly one local DEV write and exact redemption. Repeating the CLI returned `DELIVERY_NOT_RUNNABLE`. Pending/expired approval rejection, read-only recovery after a lost response, and selected-task isolation passed. Simulated services and browsers closed successfully, and temporary data was cleaned up.

证据包含 150 个执行源码／配置文件 hash、8 张截图中的两张精选图、CLI 回执、场景 run ID、网络与清理结果。浏览器、Node 与 CLI 检测到的外部网络尝试均为零，真实 provider 写入为零。已有 3458 保持 `7f77057`、暂停且无活动 job，原真实任务未执行；本次只增加测试和文档，无需重新部署业务实例。

Evidence includes hashes for 150 executable source/configuration files, two selected screenshots from eight captures, the CLI receipt, scenario run IDs, and transport/cleanup results. Browser, Node, and CLI checks recorded zero external network attempts and zero real provider writes. Existing 3458 remains on `7f77057`, paused with no active job; its real task was not executed. This change adds tests and documentation and needs no application redeployment.

- [结果与场景摘要 / Result and scenario summary](evidence/local-publishing-flow-20261104/summary.json)
- [完整回归日志 / Full regression log](evidence/local-publishing-flow-20261104/npm-check.txt)
- [本地集成日志 / Local integration log](evidence/local-publishing-flow-20261104/local-integration.txt)
- [Studio 已发布状态 / Published Studio state](evidence/local-publishing-flow-20261104/studio-published.png)
- [本地模拟 DEV 匿名页面 / Local simulated DEV anonymous page](evidence/local-publishing-flow-20261104/local-dev-page.png)

## 执行 / Run

需要 Node.js 24.18.x、已安装的 npm dependencies 和 Chromium；可通过 `RENDER_BROWSER_EXECUTABLE` 指定浏览器。不读取既有 `.env`、账号凭证或运行数据库，不需要 Docker。

Use Node.js 24.18.x, installed npm dependencies, and Chromium; set `RENDER_BROWSER_EXECUTABLE` if needed. The harness does not read existing `.env` files, account credentials, or runtime databases, and does not require Docker.

```bash
npm run test:local-publishing
```

可用 `LOCAL_EXACT_EVIDENCE_DIR` 指定结果 JSON 和截图目录。该命令独立于默认 `npm run check`，显式运行两个本地 integration 文件并先构建 Studio。

Set `LOCAL_EXACT_EVIDENCE_DIR` to choose the JSON and screenshot output directory. This command is separate from the default `npm run check`; it builds Studio and explicitly runs both local integration files.

## 真实代码与模拟边界 / Production code and simulated boundaries

| 层 / Layer | 本轮方式 / Method |
| --- | --- |
| Studio、CMS HTTP、Session/CSRF、SQLite | 真实应用代码 / Production application code |
| OIDC 验签、PKCE、在线身份重验 | 真实 AuthManager 与 NyxAuthority，对接本地签名 issuer / Production auth against a locally signed issuer |
| 原文发布与公开正文核验 | 真实 GhostAdapter、ReleaseWorker、Chromium；Ghost HTTP 服务为模拟 / Production adapter, worker, and renderer; simulated Ghost HTTP service |
| 精确请求、批准、redeem | 三项旧 API/恢复用例；真实 CMS 校验、模拟 Nyx 协议服务 / Three legacy API/recovery cases; production CMS validation and simulated Nyx protocol service |
| 外部 DEV 写入与读回 | 独立模拟工具凭据执行；真实 ExternalPublicationService/DevAdapter 核验，DEV HTTP 与匿名页面为模拟 / Independent simulated tool credential executes; production service/adapter verifies simulated DEV HTTP and page |

服务绑定随机 loopback 端口。DEV 的逻辑 HTTPS 地址只用作请求契约，由本地 Nyx 模拟服务映射到本地 HTTP 端点；不改变生产 HTTPS 校验，也不向真实 DEV 地址发送请求。测试采用现有 adapter 边界，模拟服务与产品代码分离，不添加生产测试登录后门。

Services bind random loopback ports. The logical HTTPS DEV address is a request-contract identifier mapped by the local Nyx simulator to the local HTTP endpoint. Production HTTPS validation stays intact, and requests do not go to real DEV. The harness uses existing adapter boundaries, keeps simulated services separate from product code, and adds no production login bypass.

## 验收路径 / Acceptance paths

1. 浏览器登录、确认原文发布，Worker 发布后匿名核验正文。Browser login and original confirmation, followed by worker publication and anonymous body verification.
2. 浏览器准备全文材料，核对精确 request；独立本地工具凭据写入一次模拟 DEV。此时 CMS 仍 awaiting_external，尚未承认发布成功。Browser preparation freezes the full-copy request; a separate local tool credential writes simulated DEV once. CMS remains awaiting_external until independent verification.
3. 浏览器回传远端 ID，CMS 只读核验正文、署名、来源、账号和 HTTPS 逻辑 URL；随后只读同步指标。重复登记保持一个副本、一次外部工具写入和零 CMS DEV job，所有实际传输都在 loopback。Browser receipt submission triggers CMS read-only verification of content, attribution, source, account and the logical HTTPS URL, followed by read-only metrics sync. Repeated registration preserves one copy, one independent tool write and zero CMS DEV jobs; all actual traffic stays on loopback.
4. 未批准或过期请求不能排队执行。Pending or expired approvals cannot authorize execution.
5. 写入完成后丢失响应进入 `uncertain`，通过当前身份只读对账恢复，provider 写入次数保持一次。Losing the response after an accepted write yields `uncertain`; current-authority read-only reconciliation recovers it while the provider write count stays at one.

临时数据库、签名材料、监听端口与浏览器由 harness 关闭和清理。既有 3458/3457、真实 NyxID、Ghost 数据和已准备的真实 DEV 任务不参与这次模拟闭环；其真实本地验证另见[此前联调报告](local-cms-dev-20261104.md)。

The harness closes and cleans up its temporary database, signing material, listeners, and browsers. Existing 3458/3457 instances, real NyxID and Ghost data, and the prepared real DEV task do not participate in this simulated flow; their real local verification remains in the earlier integration report.
