# BlogSystem

006 合并后本机升级、登录恢复与最新验收：[2026-11-05 本机验收](docs/cms-local-acceptance-20261105.md)。

Local upgrade, login recovery and acceptance after the 006 merge: [November 5 local acceptance](docs/cms-local-acceptance-20261105.md).

最新 CMS B 交付、原型归档及真实 NyxID／Ghost 验收摘要：[2026-11-05 更新](docs/cms-delivery-update-2026-11-05.md)。

Latest CMS B delivery, prototype archive and real NyxID/Ghost acceptance summary: [2026-11-05 update](docs/cms-delivery-update-2026-11-05.md).

个人与组织的双语内容发布平台，正式范围为 Gist v0.7 的两份原文及 D1–D9／适用 A01–A52。

已实现 CMS 与共享 NyxID service API、Markdown／私有素材／修订、个人与组织 EN/ZH 四个独立官方 Ghost、外部分发与生命周期、指标及加密备份恢复。**完整 D1–D9 尚未正式签收**；Document、Local 与真实目标 Live 分别记录，缺少外部输入的必需项保持 BLOCKED。

真实本机交付见 [2026-11-04 新版 Studio 与受控 DEV 联调](docs/local-cms-dev-20261104.md)：独立入口 `http://localhost:3458/studio`，固定业务 commit `7f77057`，442项测试与29项四账号只读复验通过；真实个人 exact 请求已创建和核验，现已过期，未执行 DEV 写入。旧3457与原数据保留。

[本地发布闭环](docs/local-publishing-flow.md)使用 `npm run test:local-publishing` 单独运行真实 CMS/UI/Worker 与本地 Nyx/Ghost/DEV 协议模拟服务，覆盖批准、发布和丢响应后的只读恢复。不要求公网 Ghost，也不使用真实外部账号。

当前交接见 [2026-11-03 可靠性跟进](docs/continuation-20261103.md)与[外部验收执行清单](docs/continuation-external-handoff-20261103.md)。修复源码 `c16cde700963959d3fd7fc226853b71f5551573a` 消除 smooth-scroll 主题下定位未完成导致的核验误拒绝；历史首次单图核验失败的原因仍未确定。TypeScript、54 项目标回归及独立复验见本轮证据，运行／Git／PR 状态分别读回记录。

历史 [W1/W2 整合交接](docs/handoff-20261102.md)和[可携带证据 manifest](docs/evidence/followup-20261102/manifest.json)绑定 `386b9652dc431bb83e4864d5b046b378110ee88d`，包括 W2 修复 `83b4b8e`。该版本的 303 项测试及历史矩阵不冒称在新修复 SHA 全量重跑。

- [W1](docs/acceptance-w1-20261102.md)：`0b0e9d1`＋本地 NyxID 补丁 `049ee1c` 在选定真实 service 路径有界关闭 R031，覆盖组织撤权、最终发送检查、双入口内容／状态／指标与真实四 Ghost 生命周期。DeliveryWorker 的目的地为 `local_test`。
- [W2](docs/review-w2-recovery-20261102.md)：`83b4b8e` 完成真实四 Ghost 加密隔离恢复及 36 SQLite／404 MySQL 表审计；修复旧媒体命令抢占只读恢复 Actor 和 crash 后永久 running。该轮身份与分发远端为受控实现，整合后的真实 Nyx 联合补验另见当前交接。
- 普通用户门户 Launch 已由本地门户补丁 `c65dc4be` 实现并部署；个人及组织 Admin 的门户／直接 CMS 同身份同工作区有实际浏览器证据，见[脱敏记录](docs/evidence/portal-local-launch-20261102.json)。该浏览器记录绑定其当时版本，不能描述为最终 CMS 版本全量重跑。

NyxID 后端 `049ee1c2ca811a002590dc8330ce646078bb1158` 与门户 `c65dc4bedb7da79cf0fb477e6f5bd809f03aec9b` 是明确的**本地补丁依赖**，原官方 `38bae2f` checkout 保留，未向 NyxID upstream push／merge。未覆盖的凭据模式继续受既有安全约束，不新增所有模式或 transport 支持要求。

历史 [I15](docs/review-i15.md)、[I17](docs/review-i17.md)、[I18](docs/review-i18.md)、[I19](docs/review-i19.md)、[I20](docs/review-i20.md)、[I21](docs/review-i21.md)与[I22](docs/review-i22.md)保留各自固定版本、失败与修复过程。旧 R031 fail、临时 fail-closed 与历史统计均不能替代当前有界结论。显式补图是已有实现选择；数值 RPO/RTO 须另约，没有生产 SLA 承诺。

## 运行与交接入口

- [开发运行与验证](docs/development.md)：Node.js 24.18.x、npm ci、本地 API/Worker、站点开通及测试分层。运行需要实际身份配置，生产入口没有测试登录后门。
- [CMS 与 service API 指南](docs/api-guide.md)：双入口、源文／素材、发布、分发历史及指标；运行时契约为 `/openapi.json`。
- [NyxID 注册与连接交接](docs/nyxid-registration.md)：目标实例注册、scope、精确连接及尚缺的 Live 验证。
- [部署、维护与恢复](docs/operations.md)：配置／密钥、Ghost 素材挂载、监控／隐私、备份恢复、升级回滚与责任缺口。
- [W1/W2 整合交接与复跑](docs/handoff-20261102.md)：固定版本、脱敏证据、当前运行／push／PR 与未完成外部输入。
- [当前可靠性跟进与复跑](docs/continuation-20261103.md)：滚动核验修复、历史未定原因、隔离真实实验与版本交付。
- [真实外部与目标部署执行清单](docs/continuation-external-handoff-20261103.md)：六项必需工作包、最小输入、验证与回滚条件。
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

交付仓库为公开的 [aelf-hzz780/chronoai-cms](https://github.com/aelf-hzz780/chronoai-cms)，远端 `git@github.com:aelf-hzz780/chronoai-cms.git`，功能分支 `codex/003-blogsystem-delivery`。commit、已推送 HEAD、现有 Draft PR #1 及本地 3457 实际运行版本分别记录在[当前交接](docs/continuation-20261103.md)，不能由 Git 整合推断已部署。`main` 保留原始 baseline `019222c`，未 force 或自行 merge。新提交使用 `hzz780 <richard.huang@aelf.io>`，保留历史。

尚未初始化 Spec Kitty 项目。系统安装了 Spec Kitty CLI 不代表项目已采用该工作流；后续若采用，按项目规约初始化并遵循其流程。新增公开交付报告 I20/I21、[候选系统设计](docs/design.md)与[实施设计与迭代](docs/implementation.md)采用中英对照；开发、API 与运维指南保留既有中文，不纳入本次 SDD 双语整理。英文来源文件保持原文。

账号凭证与本地运行数据不进入版本控制。本轮已明确沿用本地 NyxID／CMS；公开 Ghost 域名可达性、真实外部平台联调、运维交接及九项正式验收仍需补齐。
