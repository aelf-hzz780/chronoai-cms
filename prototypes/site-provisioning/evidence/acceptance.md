# 原型验收 / Prototype acceptance

日期：2026-11-05。范围：本地静态交互原型，不代表真实部署或后端权限验收。

Date: 2026-11-05. Scope: local static interactive prototype, not production provisioning or backend authorization acceptance.

- 模型测试 13/13：角色、重复申请、工作区隔离、补充资料、逐语言核验、失败重试、地址校验及旧结果拒绝。 / Model tests 13/13: roles, duplicate application, workspace isolation, information requests, per-language verification, retries, URL validation and stale-result rejection.
- 浏览器走通申请 → 请求补充 → 接单仍等待资料 → Admin 补充 → EN 通过 → ZH 失败 → ZH 重试通过。 / Browser walkthrough covers application, information request, claim while blocked, Admin supplement, EN success, ZH failure and ZH retry success.
- Member/Publisher 没有组织开通与补充按钮，存在明确的管理员引导；这是 UI/模型演示。 / Member/Publisher views omit organization provisioning controls and explain the Admin handoff; this is a UI/model demonstration.
- 已注册 URL 被编辑但未重新登记时，核验按钮禁用；换址清空该语言旧核验证据。 / Dirty address drafts disable verification; re-registration clears only that language's old evidence.
- 核验过程中切换演示场景不会留下禁用控件；旧结果不写入新申请。 / Switching scenarios during verification releases busy controls and does not apply stale results to a new request.
- 刷新保留同一申请及部分开通状态；中英文 UI 切换保留输入；个人表单草稿与组织状态隔离。 / Reload preserves request identity and partial state; UI language switches preserve input; personal form drafts are isolated from organization state.
- Escape 关闭弹窗并返回触发按钮。 / Escape closes the dialog and restores trigger focus.
- 桌面请求视口 1440×1000，实际 DOM 宽 1384；移动请求视口 375×812，实际 DOM 宽 360，均未发现横向溢出。 / Requested desktop viewport: 1440×1000, observed DOM width: 1384. Requested mobile viewport: 375×812, observed DOM width: 360. No horizontal overflow observed.
- 最终浏览器 warning/error 日志为空。 / Final browser warning/error log query returned no entries.
- 博客入口已核对为本地效果页，不跳转 .example 外部域名。 / Blog links were confirmed to open a local sample rather than an external .example domain.

两轮只读复核完成，已修复补充资料被接单跳过、旧 URL 核验证据残留以及异步切换后控件未解锁的问题。Python design_lint 因未安装 Playwright 而跳过；视觉检查采用实际 CUA 浏览器截图，不将跳过记为通过。

Two read-only review rounds completed. Fixes cover claiming an information-blocked request, stale URL evidence and asynchronous control cleanup. Python design_lint was skipped because Python Playwright is unavailable. Actual CUA browser screenshots provide visual evidence; the skipped lint is not recorded as a pass.

未验收真实资源创建、DNS/TLS、Ghost 连接、服务端 RBAC、通知或生产持久化。真实服务配置与暂停状态未改动。

Real resource creation, DNS/TLS, Ghost connectivity, server-side RBAC, notifications and production persistence are outside this prototype. Live service configuration and paused publishing state were not changed.

## 首发子域名范围修正 / Platform subdomain scope correction

移除申请域名偏好，申请人只确认归属与名称；运维分配平台子域名。中英文申请弹窗、申请摘要、运维详情及页面截图同步更新。原型示例统一从同一平台演示根域名生成。

Domain preferences were removed. Applicants confirm ownership and name; operations assigns platform subdomains. Both UI languages, request summaries, operator details and screenshots are updated. New sample addresses share one platform demo base domain.

新增兼容测试确认旧 domain 字段和已知旧 seed 域名询问被移除，申请编号、已核验站点、备注与写作草稿保留。浏览器已验证无域名输入也能提交，并检查桌面与 375px 窄屏的提交按钮可达；warning/error 日志为空。本轮浏览器提交使用 localhost 独立原型存储，127.0.0.1 的现有申请保留。

The added compatibility test removes legacy domain fields and the known seeded domain question while preserving request identity, verified sites, notes and writing drafts. Browser checks confirmed submission without domain input and reachable actions on desktop and a 375px narrow viewport; warning/error logs were empty. Submission checks used separate localhost prototype storage, preserving the existing 127.0.0.1 request.
