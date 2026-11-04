# 本地发布闭环 / Local publishing flow

本轮目标是把个人原文发布与 DEV 分发流程在本机走到可核验结果。公网 Ghost、真实 DEV 发文和正式 D1–D9 签收不属于这次本地测试的前置条件。

This run verifies personal original publication and DEV distribution to a local, observable result. A public Ghost deployment, a real DEV publication, and formal D1–D9 acceptance are not prerequisites for this local test.

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
| 精确请求、批准、redeem | 真实 CMS 请求与校验；Nyx 协议服务为模拟 / Production CMS requests and validation; simulated Nyx protocol service |
| DEV 写入与读回 | 真实 DevAdapter、DeliveryWorker；DEV HTTP 与匿名页面为模拟 / Production adapter and worker; simulated DEV HTTP and anonymous page |

服务绑定随机 loopback 端口。DEV 的逻辑 HTTPS 地址只用作请求契约，由本地 Nyx 模拟服务映射到本地 HTTP 端点；不改变生产 HTTPS 校验，也不向真实 DEV 地址发送请求。测试采用现有 adapter 边界，模拟服务与产品代码分离，不添加生产测试登录后门。

Services bind random loopback ports. The logical HTTPS DEV address is a request-contract identifier mapped by the local Nyx simulator to the local HTTP endpoint. Production HTTPS validation stays intact, and requests do not go to real DEV. The harness uses existing adapter boundaries, keeps simulated services separate from product code, and adds no production login bypass.

## 验收路径 / Acceptance paths

1. 浏览器登录、确认原文发布，Worker 发布后匿名核验正文。Browser login and original confirmation, followed by worker publication and anonymous body verification.
2. 浏览器确认全文分发、请求精确审批、本地批准并关联；实际运行 `scripts/run-delivery-once.ts --delivery <id> --execute`，回执为 `published`、`sourceVerified=true`。Browser full-copy confirmation, exact request, local decision and attachment, followed by the actual single-delivery CLI returning `published` and `sourceVerified=true`.
3. 核对副本内容、署名、来源、远端 ID、URL 与状态历史；重复 CLI 执行返回 `DELIVERY_NOT_RUNNABLE`，本地 DEV 写入与 exact redeem 均保持一次，普通 proxy 写入为零。Verify body, byline, source, remote ID, URL, and history. A repeated CLI invocation returns `DELIVERY_NOT_RUNNABLE`; the local DEV write and exact redemption counts stay at one, with no legacy proxy write.
4. 未批准或过期请求不能排队执行。Pending or expired approvals cannot authorize execution.
5. 写入完成后丢失响应进入 `uncertain`，通过当前身份只读对账恢复，provider 写入次数保持一次。Losing the response after an accepted write yields `uncertain`; current-authority read-only reconciliation recovers it while the provider write count stays at one.

临时数据库、签名材料、监听端口与浏览器由 harness 关闭和清理。既有 3458/3457、真实 NyxID、Ghost 数据和已准备的真实 DEV 任务不参与这次模拟闭环；其真实本地验证另见[此前联调报告](local-cms-dev-20261104.md)。

The harness closes and cleans up its temporary database, signing material, listeners, and browsers. Existing 3458/3457 instances, real NyxID and Ghost data, and the prepared real DEV task do not participate in this simulated flow; their real local verification remains in the earlier integration report.
