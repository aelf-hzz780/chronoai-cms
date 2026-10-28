# 阶段 0：实验与验证记录

日期：2026-10-28；时区 Asia/Shanghai。Document 表示文档核验，Local 表示本机实际行为，Live 表示指定真实集成／部署环境中的行为。层级不能相互替代。

## 1. 当前环境

- 工作目录原为空，无 Git 仓库、项目文件或 Spec Kitty 配置。用户确认按全新项目处理。
- 已安装 Spec Kitty CLI，但尚未在项目使用；未创建 mission。本地 Git 已初始化为 `chore/001-blog-platform-baseline`，未配置远程或推送。
- Docker Desktop 已启动，Docker Engine 29.1.5，Compose v5.0.1。
- 本地实验仅绑定 loopback，不是公网部署，不执行 DEV／Hashnode／Medium／HackerNoon 写入。

## 2. 实验台账

| 实验 | 关联 | Document | Local | Live／缺口 |
| --- | --- | --- | --- | --- |
| E01 基线与追踪 | R1–R10 / D1–D9 | v0.7 两文件及固定 Gist revision 已获取 | passed：原文字节数／SHA-256、文档本地链接、A01–A52 编号及 D1–D9 追踪行检查 | 不适用；原文版本更新需显式比对 |
| E02 双 Ghost | R1、R6 / D1、D5 | 官方自托管、Admin API 与语言独立设计已核对 | passed（子实验）：两个独立实例、集成 API 发布、正确 locale／署名／代码／表格、sitemap 可达、跨站文章 404、重启后可读；见下方证据 | 域名、HTTPS、多 owner、容量与生产配置待验证 |
| E03 NyxID 登录 | R1、R10 / D1 | 官方 OIDC／PKCE 文档已读 | 尚未实现登录客户端 | 缺目标 issuer、应用注册与测试账号 |
| E04 NyxID 服务 | R2 / D2 | 五组能力及签名身份传递要求已记录 | 尚未实现 API／服务注册 | 缺服务注册、委托契约与真实调用验证 |
| E05 权限 | R3、R4、R10 / D3 | 权限矩阵、最小授权与反例已设计 | 尚未实现 Policy／集成测试 | 当前成员／Admin 查询与撤权路径待联调 |
| E06 版本与原文发布 | R4–R6 / D4、D5 | 原文保真、不可变 revision 与独立发布已设计 | 仅 Ghost HTML fixture 发布／署名／语言通过；平台内容模型和 Markdown 保真尚未实现 | 私有素材、确认版本、翻译互链与生产公开页待验 |
| E07 精确外部授权 | R7 / D6 | 区分发布权与 NyxID Admin 精确批准 | 尚未实现 Adapter | 目标连接、批准绑定、过期／撤权待实际验证 |
| E08 平台分发 | R7 / D6 | 官方平台限制已核对 | 尚未实现连接器／辅助流程 | 缺适用账号、订阅、发布测试内容及外部写入授权 |
| E09 生命周期 | R8 / D7 | uncertain、取消、部分失败和人工跟进已设计 | 尚未实现 Worker／对账 | 远端查询、更新、移除实际能力待验 |
| E10 指标与恢复 | R9、R10 / D8、D9 | 指标／隐私／备份范围已设计 | 尚未实现采集和全平台恢复 | 真实访问、指标源、部署恢复及 RPO／RTO 待验 |

当前没有任何 D1–D9 被标为最终通过。只有实际完成的子实验可更新为 passed；不得把准备环境计为内容发布或身份集成已完成。

### 已执行的本地 Ghost 子实验

2026-10-28 16:52（Asia/Shanghai）从空站点完成初始化和发布；16:53 重启 Ghost 与数据库后再次只读验证通过。[机器可读证据](evidence/ghost-local-2026-10-28.json)包含镜像摘要、检查结果和本机文章 URL。

- 原版 Ghost 6.73.0、MySQL 8.0.44；两个 Ghost、两个独立数据库、四个独立持久卷。
- 英文站 `http://localhost:2468`、中文站 `http://localhost:2469`，均仅绑定 `127.0.0.1`；数据库无主机端口暴露。
- 两站通过 Integration Admin API 发布合成 HTML card 文章，作者、`html lang`、代码／表格和 sitemap 检查通过；访问另一站的对应 slug 返回 404。
- 四个容器重启并恢复 healthy 后，同样的文章与断言仍通过。此结果证明本地重启可读性，不等于全量备份恢复或源 Markdown 保真。
- 配置文件为 0600，重复准备被拒绝且内容未变，非 loopback 实验地址被拒绝。
- 完成两路只读审查和两轮定点修正：补齐角色管理、预览正例、指标来源／时间、素材失败路径以及移除副本不要求原文在线等验收条件。

实验适配发现并修正：当前 Ghost 会话接口可返回纯文本；集成密钥字段可能已包含 key ID；站点语言设置键为 `locale`。中断实验仅含本任务合成数据，已清理对应临时卷后从空环境重跑通过。最终测试凭证只保留在被忽略的私有运行目录中。

本地实验没有配置 SMTP，再次运维登录的设备验证需要邮件配置；没有关闭认证检查。图片、平台 Markdown、翻译链接、CMS／NyxID 权限、指标及真实外部连接均未借此宣称通过。

## 3. 核心实验步骤

### E02 / E06：Ghost

使用同一官方 Ghost 镜像摘要运行两个独立实例，各自使用独立数据库、凭证和 content volume。验证两站可访问、存储不共享、重启保留内容、通过 API 读写确定内容及语言配置。后续增加个人和组织各一组，验证 owner 路由、署名和译文互链。检查代码、表格、链接、图片的实际渲染，并保存脱敏结果。

本机 HTTP 及测试运维账号只用于本地实验；生产要求 HTTPS、运维访问限制、SMTP、监控、备份及真实域名。不得用两套实验实例宣称满足所有个人与组织的容量。

### E03–E05：NyxID

1. 取得正式 issuer，读取 discovery／JWKS；注册应用和回调。
2. 用至少无组织个人、普通成员、Publisher、Admin、多组织成员及另一组织身份测试双入口。
3. 确认实际签名身份与委托 scope，验证伪造头、错误 audience、过期 token 和越权 ID 被拒绝。
4. 注册平台服务并独立完成读、草稿管理、发布、Markdown 下载、指标五类操作。
5. 在任务排队后退组／撤权，执行时必须拒绝；个人内容不受影响。

### E07–E09：外部执行

1. 明确组织连接 ID、owner 和账号，不依赖默认路由选择。
2. 由 Publisher 发起，再由真实组织 Admin 批准确切内容／目标／动作；修改输入后旧批准无效。
3. 使用有权账号执行 DEV 个人／组织和 Hashnode 组织自动发布与修订；缺订阅／权限可解释地失败。
4. 模拟远端成功本地超时并验证对账，不可重复发文；取消、部分失败、删除限制均有记录。
5. Medium 与 HackerNoon 演示辅助流程，记录真实提交／审核／发布状态，不保证接受。

真实外部发文使用获准的测试内容和具体账号；在取得这些条件前不发送测试文章。

### E10：指标与恢复

公开测试访问能够被按 owner/article/language/destination 正确查询；私有预览不采集。对比 CMS 与 NyxID，注入采集故障验证发布不中断。备份包含已有公开文章和待执行任务，在隔离环境恢复，先禁用出站，重验权限并对账，确认无重复副本。

## 4. 文档依据及验证边界

- [Ghost Docker 自托管](https://docs.ghost.org/install/docker/)：官方工具当前标为 preview；本地容器可行性与生产上线资格分开验证。
- [Ghost 官方 Docker 配置](https://github.com/TryGhost/ghost-docker/blob/main/compose.yml)：镜像、MySQL 和持久化的参考；本项目不 fork Ghost 核心。
- [Ghost Admin API](https://docs.ghost.org/admin-api/) 与 [内容转换](https://docs.ghost.org/admin-api/posts/creating-a-post)：仅使用受支持集成，Markdown 保留在平台；渲染需实测。
- [NyxID OIDC](https://github.com/ChronoAIProject/NyxID/blob/main/docs/site/shared/concepts/oauth-oidc.md)、[身份传播](https://github.com/ChronoAIProject/NyxID/blob/main/docs/DEVELOPER_GUIDE.md#configuring-identity-propagation)、[组织模型](https://github.com/ChronoAIProject/NyxID/blob/main/docs/ORG_MODEL.md)、[服务执行](https://github.com/ChronoAIProject/NyxID/blob/main/docs/NYXBOT_SERVICE_EXECUTION.md)：仓库文档不代表目标部署版本或配置已验证。
- [DEV API](https://developers.forem.com/api/v1)：账号及组织权利需真实验证。
- [Hashnode API 使用条件](https://hashnode.com/blog/hashnode-gql-agent-skill)：写入有 Pro publication 与角色条件，尚未验证具体账号。
- [Medium API 限制](https://help.medium.com/hc/en-us/articles/213480228-API-Importing) 与 [导入](https://help.medium.com/hc/en-us/articles/214550207-Importing-a-post-to-Medium)：按辅助流程交付。
- [HackerNoon 公司域名来源规则](https://help.hackernoon.com/editing-protocal/4ci-canonical-links-to-company-domain)：公司账号条件与实际投稿结果仍需验证。

## 5. 证据模板

```yaml
experiment_id: E02
requirement_ids: [R1, R6]
deliverable_ids: [D1, D5]
claim: 本次验证的具体行为
evidence_level: local
status: planned
environment: 待填写
build_revision: 待填写
configuration_version: 待填写
performed_at: 待填写
operator: 操作者别名
actor_alias: 测试身份别名
owner_alias: 测试工作区别名
role_and_scope: 待填写
preconditions: []
input_revision_and_hash: 待填写
destination_and_action: 待填写
steps: []
expected_result: 待填写
observed_result: 待填写
evidence: []
trace_id: 待填写
dependency_or_blocker: 待填写
next_action: 待填写
acceptance_owner: 待填写
```

证据中不保存密码、API key、Cookie、原始授权头或私有原文。文档与代码审查证据不能替代真实运行证据。
