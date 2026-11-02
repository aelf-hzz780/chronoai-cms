# BlogSystem

个人与组织的双语内容发布平台，按 2026-10-28 的 Gist v0.7 需求从空项目开始建设。

当前已实现可本地运行的 CMS、共享 NyxID service API、Markdown／私有素材／修订、四站 Ghost 原创发布、外部分发与生命周期、指标及加密备份恢复。历史独立 Local 验证覆盖实际 CMS/service 发布、个人／组织 × EN/ZH 四个官方 Ghost、浏览器指标和隔离恢复，当时身份使用本地签名 issuer fixture。2026-10-30 已新增真实官方 NyxID 0.75.0 双入口开发联调，历史业务源码 `2d65bc0` 的四用户、角色／撤权、只读 scope 与停用检查通过，见 [I14](docs/review-i14.md)；该轮没有 Ghost Worker 或外部 provider 出站。

历史记录：2026-10-30 独立报告在固定业务源码 `76595bc` 有界关闭 R029／R030，当轮登记 R001–R030 均已关闭（29 项必需缺陷及 R021 非门禁）。strict 与 127 项测试、33 条 Local 绑定／模式／时间分支以及真实官方 NyxID 的 10 组／39 条业务 HTTP 记录通过，证据与限制见 [I15](docs/review-i15.md#独立有界闭合2026-10-30)。51 PASS／A05 BLOCKED 为 R031 发现前的历史 Local modeled 统计，不是当前验收结果。

当前状态以[最新 root 独立台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)为准，开发记录不替代独立签收。[2026-10-30 独立本地收尾](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/local-handoff-complete.json)确认：固定业务源码 `0418652` 的已识别可独立推进本地工作已完成，实际官方 NyxID OAuth／proxy／MCP／默认浏览器、四 Ghost 发布／生命周期／私有素材／指标及隔离恢复的有界证据已记录。剩余工作依赖 NyxID 上游能力、真实外部平台账号与精确内容／动作授权、目标生产运维输入及 GitHub PR 创建权限；整体仍为 `NOT_ACCEPTED`，不将本地收尾提升为 Live 或正式交付签收。该收尾是2026-10-30固定快照，不包含11月2日重新授权推进的 I22 consumer 候选工作。

**R031/P1 OPEN**：历史业务源码 `76595bc` 曾复现真实受限 API key 被撤服务范围或删除后，保存队列仍通过执行前授权。当前 `abfb988` 临时 fail-closed 保护已获 root 独立 App3447 有界 PASS，缺少可验证来源的代理发布被阻断，见[实际重放报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/actual-nyxid/review.json)；完整 key/child 能力仍 BLOCKED 上游，边界见 [I17](docs/review-i17.md)。**R033/P1已在4a27487／3ded07e独立有界关闭**，见 [I18](docs/review-i18.md)。**R034/P1（A08/A17、D2/D4）已在0418652／98bac5b独立有界关闭**：实际MCP文件封装解码、保存和读回字节一致，原始HTTP下载保持，见 [I19](docs/review-i19.md)。R032文档问题已独立有界关闭；R029／R030保持原范围有界关闭，历史契约研究见 [I16](docs/review-i16.md)。

最新实际联合验证在固定业务源码`0418652`完成真实官方NyxID＋四原版Ghost的CMS／service × 个人／组织 × 中英八组初始发布、非空浏览指标与12组两入口查询一致性；CMS个人更新、双向hreflang、译文stale与下线有界通过。后续 r3/r4 有界证据完成现有组织译文 stale→unpublish 生命周期、普通成员个人 CMS/service × EN/ZH 矩阵、两个未发送新图取消分支、同组织 Admin/member 精确角色私有资源拒绝，以及默认浏览器认证与退出后的旧 cookie 失效；首个 CMS-EN 仅公开补核，另三篇才是新增发布，未声称四篇重跑。恢复证据仍覆盖原 credential 退组阻断、旧 cookie 失效、实际 native 新卷全量恢复、22 payload 加密归档核对、权限／映射／媒体核对、恢复后新文章与素材验证，以及组织中文同ID只读认回和 projection complete；原组织中文首次 INTERNAL 原因仍未定。仍缺正式生产RPO/RTO、外部分发恢复、实际外部平台及普通 Nyx 门户 Launch；已发送或外部分发取消、显式垃圾回收不属于本轮新增证据范围。证据与边界见中英对照 [I20](docs/review-i20.md) 与 [I21](docs/review-i21.md)；dev原容器恢复仅为资源窗口收尾，不是正式RPO/RTO验收。

2026-11-02 新增 [I22 R031 V1 consumer 候选](docs/review-i22.md)：接入专用签名 command authority、官方在线精确核验、持久唯一 jti 命令绑定及最终发送守卫。本轮独立发现后的修复补充签名版本／incarnation严格检查、全caller只读恢复零自动metadata、公开图片独立授权与CMS显式补图／partial计数。当前证据仅为本地模型；真实本地 NyxID 后端的固定 SHA 联合验证和独立验收待完成，原未支持来源继续拒绝，不据此关闭 R031 或提升正式签收。

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

交付仓库为公开的 [aelf-hzz780/chronoai-cms](https://github.com/aelf-hzz780/chronoai-cms)，`origin` 使用 `git@github.com:aelf-hzz780/chronoai-cms.git`。2026-11-02 root 已独立验收并正常推送 `6ea9ecd` 至功能分支 `origin/codex/003-blogsystem-delivery`；`main` 保持原始 baseline `019222c`，未 force 或 merge。I22 consumer 候选与前置测试 `9cf67b8` 另待固定 commit 独立审查后交付。PR 状态沿 root 台账，标题、正文及 compare 入口已备；本轮未重新探测权限通路。新增 commit 使用 `hzz780 <richard.huang@aelf.io>`，保留已有历史，通过 PR 合并。

尚未初始化 Spec Kitty 项目。系统安装了 Spec Kitty CLI 不代表项目已采用该工作流；后续若采用，按项目规约初始化并遵循其流程。新增公开交付报告 I20/I21、[候选系统设计](docs/design.md)与[实施设计与迭代](docs/implementation.md)采用中英对照；开发、API 与运维指南保留既有中文，不纳入本次 SDD 双语整理。英文来源文件保持原文。

生产配置、账号凭证与本地运行数据不进入版本控制。生产上线、真实外部平台账号联调及九项交付验收均尚未完成。
