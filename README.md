# BlogSystem

个人与组织的双语内容发布平台，按 2026-10-28 的 Gist v0.7 需求从空项目开始建设。

当前已实现可本地运行的 CMS、共享 NyxID service API、Markdown／私有素材／修订、四站 Ghost 原创发布、外部分发与生命周期、指标及加密备份恢复。独立 Local 验证已覆盖实际 CMS/service 发布、个人／组织 × EN/ZH 四个官方 Ghost、真实浏览器访问指标和隔离恢复；身份联调使用明确的本地签名 issuer fixture，外部分发主要为本地契约与状态测试，不能作为真实 NyxID 或 provider Live 通过。

独立收尾账目确认 R001–R028 已全部有界关闭（R021 非门禁），51 场景 Local PASS；A05 因缺具名目标部署／付款／运维输入而 BLOCKED，可继续推进的 Local 工作为 0。Document 为 48 PASS／4 BLOCKED，Live 为 52 BLOCKED。

**完整 D1–D9／A01–A52 尚未正式签收。** 目标 NyxID 登录／注册／委托与组织批准、真实外部账号和发文授权、生产域名／部署／责任及约定 RPO/RTO 仍有缺口。当前证据与逐项边界见[交付台账](docs/delivery-status.md)及[验收矩阵与证据入口](docs/acceptance.md)。阶段 0 记录保留为历史。

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

生产配置、账号凭证与本地运行数据不进入版本控制。生产上线、真实账号联调及九项交付验收均尚未完成。
