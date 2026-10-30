# BlogSystem

个人与组织的双语内容发布平台，按 2026-10-28 的 Gist v0.7 需求从空项目开始建设。

当前已实现可本地运行的 CMS、共享 NyxID service API、Markdown／私有素材／修订、四站 Ghost 原创发布、外部分发与生命周期、指标及加密备份恢复。历史独立 Local 验证覆盖实际 CMS/service 发布、个人／组织 × EN/ZH 四个官方 Ghost、浏览器指标和隔离恢复，当时身份使用本地签名 issuer fixture。2026-10-30 已新增真实官方 NyxID 0.75.0 双入口开发联调，历史业务源码 `2d65bc0` 的四用户、角色／撤权、只读 scope 与停用检查通过，见 [I14](docs/review-i14.md)；该轮没有 Ghost Worker 或外部 provider 出站。

历史记录：2026-10-30 独立报告在固定业务源码 `76595bc` 有界关闭 R029／R030，当轮登记 R001–R030 均已关闭（29 项必需缺陷及 R021 非门禁）。strict 与 127 项测试、33 条 Local 绑定／模式／时间分支以及真实官方 NyxID 的 10 组／39 条业务 HTTP 记录通过，证据与限制见 [I15](docs/review-i15.md#独立有界闭合2026-10-30)。51 PASS／A05 BLOCKED 为 R031 发现前的历史 Local modeled 统计，不是当前验收结果。

当前以[最新 root 独立台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)为准：本次只读核对的快照记录于 `2026-10-30T05:41:21.997443+00:00`，业务基线 `76595bc`、增量保护 `abfb988`，Local **49 PASS／1 BLOCKED／2 FAIL**（A09／A15因R031仍FAIL），正式交付签收0项。原任务继续实际门户／CMS入口、OpenAPI注册、多组织／受限代理及真实NyxID与四Ghost发布、指标和必要恢复差量验收；历史“可推进Local工作为0”不作为当前结论。

新增 **R031/P1 OPEN**：真实受限API key被撤服务范围或删除后，保存队列仍通过执行前授权。`abfb988`已加入临时fail-closed保护，strict与141/141开发测试通过；root在独立App3447取得临时来源写入保护有界PASS，见[实际重放报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/actual-nyxid/review.json)。完整key/child能力仍BLOCKED上游；旧确认凭据过期／撤销后当前Admin只读对账的疑似回归仍待独立复验，不宣称R004完整覆盖。边界见 [I17](docs/review-i17.md)，历史契约研究见 [I16](docs/review-i16.md)。R029／R030保持原范围有界关闭。

**完整 D1–D9／A01–A52 尚未正式签收。** 本地真实 NyxID 证据不自动提升正式 D/A；目标部署与运维责任、真实外部账号、精确内容／动作授权及约定 RPO/RTO 仍缺输入。当前证据与逐项边界见[交付台账](docs/delivery-status.md)及[验收矩阵与证据入口](docs/acceptance.md)。阶段 0 记录保留为历史。

## 运行与交接入口

- [开发运行与验证](docs/development.md)：Node.js 24.18.x、npm ci、本地 API/Worker、站点开通及测试分层。运行需要实际身份配置，生产入口没有测试登录后门。
- [CMS 与 service API 指南](docs/api-guide.md)：双入口、源文／素材、发布、分发历史及指标；运行时契约为 `/openapi.json`。
- [NyxID 注册与连接交接](docs/nyxid-registration.md)：目标实例注册、scope、精确连接及尚缺的 Live 验证。
- [部署、维护与恢复](docs/operations.md)：配置／密钥、Ghost 素材挂载、监控／隐私、备份恢复、升级回滚与责任缺口。
- [当前实现与验证状态](docs/delivery-status.md)：固定 commit 的 Local 证据、缺陷修复和外部 BLOCKED 项。
- [74978bc 独立 Local 恢复记录](docs/review-local-recovery-749.md)：完整加密捕获、新卷四站恢复、丢响应对账及撤权任务阻断；不代表生产 RPO/RTO。

## 正式依据

- [需求原文](docs/source/requirements.md)
- [九项交付原文](docs/source/supporting-deliverables.md)
- [来源与文件校验信息](docs/source/manifest.json)
- [范围与决策基线](docs/baseline.md)
- [系统设计](docs/design.md)
- [需求追踪与验收矩阵](docs/acceptance.md)
- [阶段 0 实验与证据（历史）](docs/phase-0.md)
- [双 Ghost 环境搭建与阶段 0 实验说明（历史起点）](infra/ghost/README.md)
- [迁移后的本机环境与复验（历史）](docs/local-revalidation.md)

## 已确认的约束

1. 两份 v0.7 文档的九项交付均为必需，文档不能替代可运行交付。
2. 每个 publication、每种语言独立安装 Ghost；每个双语 publication 需要两个实例。个人与组织各一个双语 publication 时需要四个实例。
3. 保持 Ghost 官方发行版完整；通过官方 API、配置、Webhooks 和独立主题扩展集成。Ghost Admin 仅供受信任运维使用。
4. CMS 与 NyxID 服务共用内容、权限、发布状态和指标业务逻辑。
5. 全新项目处理；不依赖原文提及但尚未提供的旧技术项目目录，不据此假定已有实现。

## 工程状态

后续代码提交使用 [aelf-hzz780/chronoai-cms](https://github.com/aelf-hzz780/chronoai-cms)，`origin` 使用 `git@github.com:aelf-hzz780/chronoai-cms.git`。新增 commit 使用 `hzz780 <7567714+hzz780@users.noreply.github.com>`；保留原有提交历史，通过功能分支和 PR 交付，不直接推送已有的 `main`／`master`。

尚未初始化 Spec Kitty 项目。系统安装了 Spec Kitty CLI 不代表项目已采用该工作流；后续若采用，按项目规约初始化并遵循其流程。仓库公开性尚未确定，自编设计文档暂用中文；公开仓库建立前补齐中英文对照。英文来源文件保持原文。

生产配置、账号凭证与本地运行数据不进入版本控制。生产上线、真实外部平台账号联调及九项交付验收均尚未完成。
