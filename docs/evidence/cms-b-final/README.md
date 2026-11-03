# Final local acceptance / 最终本地验收

固定源码 `7ee88025d296ac00a912c6e088e7d7d2f6a3fd59` 独立导出后，类型检查、Studio 构建、419/419 标准测试及 7/7 真实 CMS API 浏览器流程全部通过。最后一笔提交只修正本地预览的 fixture 提示，生产实现与 `9dddfba` 相同。`result.json`、日志、源码与构建指纹、16 张截图均来自该固定版本。文档后续提交不改变这些源码证据。

An independent export of the pinned source passed typechecking, the Studio build, all 419 standard tests and seven actual CMS API browser flows. The final commit changes only the local preview notice; production implementation is unchanged from `9dddfba`. Logs, fingerprints and sixteen screenshots retain this exact source boundary.

浏览器使用真实 Fastify、SQLite、session/CSRF 和 CMS 服务，但身份与外部账号/批准/发布结果为隔离 fixture。预览进程不运行外部分发 Worker。七条流程覆盖双语编辑、连接恢复与精确绑定、人工分发/备注/计划、批准入队、新旧入口回退、治理与数据、原文确认与任务取消。

The browser exercises actual application services and storage with isolated identity and external adapters. It does not prove live NyxID or real destination delivery. The seven flows cover bilingual editing, connection recovery, manual follow-up/plans, exact approval, old/new-entry parity, governance/analytics and original-publication tasks.

双 Ghost 的真实发布与主题证据位于相邻目录，保留各自历史版本边界，没有伪装成最终版本重新执行。实际部署媒体挂载、远端 Nyx 注册、真实平台账号和正式主题维护邮箱仍为后置门禁；没有生产部署或 Git push。

Earlier actual dual-Ghost evidence retains its original revision boundary. Deployment-specific media mounts, real Nyx registration and destination accounts, and release maintainer metadata remain separate gates. No production deployment or Git push occurred.
