# BlogSystem

个人与组织的双语内容发布平台，按 2026-10-28 的 Gist v0.7 需求从空项目开始建设。

当前为阶段 0：已保存需求原文并编制设计、验收与实验材料；迁移到当前 Mac 后，已使用独立 Colima 环境重新验证双 Ghost 的 API 发布、语言／内容分离和重启可读性，详见[本机复验](docs/local-revalidation.md)。此目录目前不是可用的 CMS；NyxID 服务、外部分发和指标尚未实现。各项实际验证状态以[验证记录](docs/phase-0.md)为准。

## 正式依据

- [需求原文](docs/source/requirements.md)
- [九项交付原文](docs/source/supporting-deliverables.md)
- [来源与文件校验信息](docs/source/manifest.json)
- [范围与决策基线](docs/baseline.md)
- [系统设计](docs/design.md)
- [需求追踪与验收矩阵](docs/acceptance.md)
- [阶段 0 实验与证据](docs/phase-0.md)
- [本地双 Ghost 验证环境](infra/ghost/README.md)
- [迁移后的本机环境与复验](docs/local-revalidation.md)

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
