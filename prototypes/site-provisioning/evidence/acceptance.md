# 原型验收 / Prototype acceptance

日期：2026-11-05。当前范围：同一博客域名下 /en/、/zh/，根路径默认跳英文。B 方案视觉、人工开通流程与真实服务外发暂停保持。

Date: 2026-11-05. Current scope: /en/ and /zh/ under one blog domain, with the root defaulting to English. The B visual direction, manual operations workflow and live publishing pause remain.

## 自动验证 / Automated validation

- 模型测试 17/17 通过；所有原型 JavaScript 文件语法检查通过。 / All 17 model tests and JavaScript syntax checks passed.
- 角色权限、重复申请、工作区隔离、补充资料阻塞、URL 输入校验、逐语言失败重试与旧结果拒绝。 / Role rules, duplicate requests, workspace isolation, information-request blocking, URL validation, isolated retries and stale-result rejection.
- 根地址登记保留完整路径派生结果；根入口必须单独核验且英文先就绪；两语言和根入口全部通过才完成。 / Root registration derives full paths; root verification is separate and requires English readiness; completion requires both languages and the root check.
- 修改根地址使两语言和根入口证据同时失效；相同根地址重复登记保留结果。 / Changing the root invalidates both languages and the root evidence; re-registering the same root preserves results.
- 旧数据迁移保留申请编号、备注、负责人、待补充状态和草稿，清理旧 URL 通过记录且幂等；旧完成历史标为旧地址，不虚构当时已做根入口核验。 / Idempotent migration preserves request IDs, notes, assignees, information blocking and drafts while invalidating old URL evidence. Legacy completion history stays labeled as old-address evidence, without inventing past root checks.

## 浏览器实测 / Browser checks

- 以 Richard 提交申请 REQ-2026-0420，运维接单，登记 https://richard.chronoai.example/，自动生成 /en/ 和 /zh/。 / Submitted Richard request REQ-2026-0420, claimed it and registered one root that generated both language paths.
- 根入口在英文未核验前禁用；英文通过后单独核验根入口，再模拟中文失败。英文及根入口结果保留。 / Root verification was disabled before English readiness, passed separately after English, and remained valid when Chinese failed.
- 刷新保留同一申请、部分成功状态和完整路径。中文单独重试成功后完成，未触发发布。 / Reload retained request identity, partial state and full paths. Chinese retry completed setup without publishing.
- 根地址输入修改时禁核验，点击更新会先说明两语言和根入口均需重核验；取消并恢复原地址可继续原有流程。 / Dirty root input disabled checks; updating showed a confirmation explaining all evidence would be invalidated. Canceling and restoring the root allowed the original flow to continue.
- CMS 界面为中文时，根入口预览仍进入英文 /en/；点击博客语言切换进入同域 /zh/。两种语言通过前不开放未就绪语言切换。最终浏览器 warning/error 日志为空，运维说明页面已打开核对。 / With Chinese CMS UI, root preview still opened English /en/. The blog language switch opened same-domain /zh/; unready language switches remained disabled. Final browser warning/error logs were empty, and the operations guide was opened and checked.
- 桌面与 375×812 窄屏检查，窄屏文档宽度等于 375，无横向溢出，提交操作可达。 / Desktop and 375×812 narrow viewport checked; narrow document width was 375 with no horizontal overflow and reachable submit actions.

本轮复核修正了旧 complete 历史被错误升级为“根入口也曾通过”的表述。截图为 CUA 实际浏览器输出。此前 Python design_lint 因缺少 Python Playwright 跳过，未记录为通过。

Read-only review identified and corrected overstated legacy completion history. Screenshots are actual CUA browser output. Python design_lint was previously skipped because Python Playwright is unavailable; it is not recorded as a pass.

## 实施边界 / Implementation boundary

所有 URL 与核验是本地演示数据。根入口预览仅模拟效果，没有配置真实 HTTP 重定向。没有调用 CMS、NyxID、Ghost 或 DEV，没有修改真实业务代码、部署配置或发布 Worker。完整运维流程与后续实施项见 ../operations.md。

URLs and verification results are local demo data. Root preview simulates behavior without configuring a live HTTP redirect. No CMS, NyxID, Ghost or DEV calls, production business-code edits, deployment configuration changes or publishing Worker actions occurred. See ../operations.md for the operations flow and future integration work.
