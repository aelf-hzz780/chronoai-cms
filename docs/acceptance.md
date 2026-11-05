# 需求追踪与验收矩阵

R1–R10 对应 [requirements.md](source/requirements.md) 的十节；D1–D9 对应 [supporting-deliverables.md](source/supporting-deliverables.md) 的九项交付。A 编号为必需场景索引，不能由同名测试或测试数量推断完整通过。本文的正式范围与通过条件保持 v0.7 基线，当前实现、逐项证据和外部缺口见[交付台账](delivery-status.md)。D1–D9／A01–A52 尚未整体签收。

## 当前证据与交接入口

最新本地证据见 [009 运维合并与本地验收](009-local-acceptance.md)，个人 DEV 真实 create/update/register/sync 见 [008 公开正向验证](evidence/external-publication-20261105/public-positive/README.md)。下方历史记录与矩阵保留原版本，不以测试数量替代当前逐项验收。

Current local evidence is recorded in the [009 report](009-local-acceptance.md); bounded real personal DEV create/update/register/sync evidence is linked separately above. Historical entries retain their original revisions and do not establish current whole-deliverable acceptance.

| 入口 | 内容与证据边界 |
| --- | --- |
| [开发运行](development.md)、[API 指南](api-guide.md)、[NyxID 注册](nyxid-registration.md)、[部署运维](operations.md) | 当前运行与维护路径；目标 NyxID／provider／生产配置需真实输入，文档与模板不是 Live 证据 |
| [交付台账](delivery-status.md)及其迭代记录 | 按固定源码记录开发自测、独立有界复验、未完成分支；Document／Local／Live 分开，不以修复关闭替代整体验收 |
| [74978bc 独立 Local 恢复](review-local-recovery-749.md) | 实际四 Ghost 与平台加密捕获／新卷恢复、全字段审计、旧会话失效及只读对账；本地身份 fixture，不包含真实外部 delivery 恢复或生产 RPO/RTO |
| [阶段 0](phase-0.md)、[迁移复验](local-revalidation.md) | 历史双站与基础实验；仅适用于其记录的源码和环境，不能代表当前 CMS／service 或四站完整结果 |

当前可移交证据以 [W1/W2 整合交接](handoff-20261102.md)与[相对路径 manifest](evidence/followup-20261102/manifest.json)为准。W1 在 `0b0e9d1`＋本地 Nyx `049ee1c` 的选定 service 路径有界关闭 R031；W2 在 `83b4b8e` 修复旧 media 抢占当前恢复 Actor／crash running 并完成真实四 Ghost 新卷加密恢复。共同版本的受影响路径另行真实补验，不把不同 SHA 或受控 Authority 的结果合并冒充完整 Native 通过。

普通 Nyx 门户 Launch 已由本地门户补丁 `c65dc4be` 实现、部署并完成个人／组织 Admin 浏览器有界验证，见[版本绑定记录](evidence/portal-local-launch-20261102.json)。后端 `049ee1c` 是本地补丁依赖，未向 Nyx upstream push／merge。目标 Nyx 注册部署、真实外部分发／恢复、生产责任及数值 RPO/RTO 仍缺输入；正式 D1–D9 保持 NOT_ACCEPTED。

历史 [I13](review-i13.md)、[I15](review-i15.md)、[I17](review-i17.md)、[I18](review-i18.md)、[I19](review-i19.md)、[I20](review-i20.md)、[I21](review-i21.md)、[I22](review-i22.md)保留其 SHA、失败、修复、临时保护与统计。旧 R031 OPEN 与门户缺口是历史状态；当前有界闭合不回填历史 modeled 统计，也不改变下列原文通过条件。原组织中文首次 INTERNAL 原因未定，后续同 ID 只读认回证据不抹去该失败。不以重发替代对账，不以测试数量推断完整场景签收。

2026-11-05 原生适配新增说明：上面 `049ee1c`／`c65dc4be` 是补丁方案的历史证据，不代表官方 `38bae2f7` 已通过。本次退出后端和门户全部源码补丁，保留 OIDC 直接登录。用户明确决定“门户 Open app 也可以不用保留”，因此不再把恢复该定制入口列为本地整改门禁；D1 原文保留作追溯，不用历史 Launch 证据判定当前 D1 完整通过。迁移门禁、当前限制与 A15 语义映射见 [007 原生适配](native-nyxid-migration.md)。

Native adaptation note, 2026-11-05: the `049ee1c`/`c65dc4be` evidence above belongs to the historical patched implementation and does not establish acceptance of official `38bae2f7`. This migration retires backend/portal source patches while preserving direct OIDC sign-in. The user explicitly chose not to retain the custom Open app entry, so reinstating it is no longer a local remediation gate. Original D1 wording remains for traceability, and historical Launch evidence cannot establish current complete D1 acceptance. The migration document records gates, limits, and the A15 semantic mapping.

本次普通 proxy 写因原生审批等待后的出站安全尚未证明而被 `NATIVE_DISPATCH_UNSUPPORTED` 阻断；service-origin delegation 的 exact 请求被 `NATIVE_EXACT_UNSUPPORTED` 阻断。只读代理和合法 direct OAuth 原生 exact 路径的验证结果分别记录，不能据此宣称 A30/A31 或全部两入口自动分发通过。M0、真实账号或独立验收阻塞时，正式切换保持未执行。

Ordinary proxy writes are blocked by `NATIVE_DISPATCH_UNSUPPORTED` because safety after native approval waiting is unproven; exact requests from service-origin delegation are blocked by `NATIVE_EXACT_UNSUPPORTED`. Read-only proxy and legitimate direct OAuth exact results are recorded separately and cannot establish A30/A31 or complete automatic distribution through both entry points. Production cutover remains unexecuted while M0, real account inputs, or independent acceptance are blocked.

## 1. 交付追踪

| 交付 | 需求 | 模块 | 必需验收场景 |
| --- | --- | --- | --- |
| D1 独立平台、Ghost、NyxID 登录 | R1、R6、R10 | Identity、Publications、Operations | A01–A05、A23–A26、A47–A51 |
| D2 NyxID 可调用服务 | R2、R3、R4、R5、R8、R9、R10 | 共享 API、Authorization | A06–A09；所有写入、下载、指标场景须在两个入口执行 |
| D3 工作区与权限 | R3、R4、R10 | Workspaces、Authorization | A10–A16 |
| D4 Markdown 编辑 | R5、R10 | Content、Media | A17–A22 |
| D5 提交与原创发布 | R4、R5、R6、R10 | Publishing、Ghost Adapter | A14–A16、A20–A26 |
| D6 外部分发 | R7、R10 | Distribution、NyxID Adapter | A27–A34 |
| D7 状态与生命周期 | R8、R4、R7、R10 | Delivery、Reconciliation | A35–A40 |
| D8 指标看板 | R9、R2、R10 | Metrics | A41–A46 |
| D9 运维交接与证据 | R1–R10 | Audit、Operations | A47–A52 及所有场景的可复核证据 |

## 2. 身份、服务与权限

| ID | 操作及反例 | 通过条件 |
| --- | --- | --- |
| A01 | 直接打开 CMS／从 NyxID 进入 | 相同 issuer＋subject 对应同一账号和工作区，无重复身份 |
| A02 | 伪造 state/nonce、错误 issuer/audience、过期或无效签名 | 受保护接口拒绝，错误可追踪，无敏感回显 |
| A03 | 注销后重放旧浏览器会话 | CMS 与其接口不再允许访问；无独立本地登录后门 |
| A04 | 普通用户尝试 Ghost Admin | 业务账号不取得后台权限，运维访问有披露与记录 |
| A05 | 部署配置与费用检查 | 独立 URL、持久化、自托管，不依赖 Ghost(Pro)；责任人与付款方明确 |
| A06 | NyxID 列表、搜索、读取文章／授权草稿及状态 | 全程无需返回 CMS，内容和状态与 CMS 一致 |
| A07 | NyxID 创建、导入、修改、提交、发布、更新、下线 | 有权操作独立完成；每项都通过相同应用层与权限判定 |
| A08 | NyxID 原始 Markdown 与指标查询 | 指定 revision 文件一致，所有过滤器和可用性与 CMS 一致 |
| A09 | 受限委托 scope／伪造身份头／通用服务凭证替代人 | 不能扩大用户权利，不能把普通成员变成 Publisher |
| A10 | 无组织用户、普通组织成员发布个人内容 | 不要求组织发布权；个人连接与内容独立 |
| A11 | 普通成员创建自己的组织草稿、提交后尝试发布／改线上／下线 | 草稿与提交允许，线上操作拒绝，即使本人署名 |
| A12 | Admin 授予／撤销 Publisher；普通成员或 Publisher 尝试自提权；跨组织授予；Publisher／Admin 发布自己或已提交稿 | 仅当前有权 Admin 可管理本组织发布权限；非 Admin 不能自提权或跨组织授予；无额外 Editor、无强制第二人；确认版本、owner、作者、目标 |
| A13 | Admin 尝试读取成员私人草稿、图片、Markdown 或指标 | 两个入口均拒绝，无搜索摘要／缓存侧漏 |
| A14 | 多组织成员更改 owner/channel/post/revision/connection ID | 每次以真实归属授权，不能跨空间访问或写入 |
| A15 | 入队后退组、撤销 Publisher、原生授权失效、取消或连接停用/换绑 | 执行前复查当前成员、Publisher、原生凭据、取消和精确连接，阻止未发送写入；个人内容保留。删除 Agent Key 不额外解释为取消旧确认，原生 introspection 判定实际凭据失效仍停止；等待 NyxID 审批后的真正出站点须另证 |
| A16 | 离组后查询组织历史稿和个人稿 | 组织稿仍归组织；离组者失去访问；个人稿仍归个人 |

A15 的“撤销委托”以实际原生凭据有效性解释，不指定 command-authority/oauth_lineage 协议，也不要求 CMS 为删除原 Agent Key 额外撤销已确认命令。原文 R4 §45／D3 §23 明确要求撤销成员和发布权限阻止待发组织任务；R10 §100 要求每次调用和委托范围合法。现有 command-proof/exact 任务不自动改协议、换 actor 或复活，历史审计保留。组织外部分发仍需 R7 的准确内容、目标和动作 Admin 授权，不能用本项语义调整绕过 A28/A29。

A15 interprets delegation revocation through actual native credential validity; it does not prescribe command-authority/oauth_lineage or add CMS cancellation of previously confirmed work solely because its originating Agent Key was deleted. R4 §45/D3 §23 require current membership/publishing authority and stop pending organization actions on removal; R10 §100 requires valid caller scope. Existing command-proof/exact tasks cannot silently change protocol, actor, or execution state, and their audit history remains intact. R7's exact content, destination and action approval still applies to organization external writes; this clarification does not bypass A28/A29.

## 3. Markdown、双语与原创发布

| ID | 操作及反例 | 通过条件 |
| --- | --- | --- |
| A17 | 导入／编辑／导出中英文 Markdown | 代码块、表格、链接、图片正确；保存的指定 revision 原文字节校验一致 |
| A18 | 同时基于旧 revision 保存两个编辑 | 明确冲突，不静默覆盖；历史可追溯 |
| A19 | 有权用户预览稿件及图片；未授权访问同一资源；新素材准备后正文发布失败／取消 | 有权用户可读并正确渲染；无权用户拒绝；未实际发布的新素材仍私有，缓存和图片路径不能绕过权限；回收不误删其他已发布 revision 的素材 |
| A20 | 修改已上线文章的工作稿 | 线上版本保持不变，需重新确认才更新 |
| A21 | 两语言分别发布；源文更新 | 独立发布，源文更新只标译文过期，不覆盖或自动发布译文 |
| A22 | 译文是草稿／已下线时访问已发布原文 | 公开页面不泄漏私有译文链接或素材 |
| A23 | 为一个双语 publication 开通站点 | 两个独立 Ghost 安装、独立持久化与配置；双 owner 验收至少各一组 |
| A24 | 发布含作者、owner、语言、metadata 的确认版本 | 公开页显示正确信息；稳定 URL、sitemap、已发布译文链接正确 |
| A25 | Ghost API 成功但公开页不可达或版本错误 | 不启动外部分发；保留待核验状态和证据 |
| A26 | 已发布后关闭业务服务／重启 Ghost | 业务服务中断不影响公开页；持久内容仍可恢复，站点自身故障有恢复说明 |

## 4. 外部连接、分发与生命周期

| ID | 操作及反例 | 通过条件 |
| --- | --- | --- |
| A27 | 同时存在个人和组织同平台连接；组织连接失败 | 使用组织指定连接；不能悄悄回退账号或供应商直连路径 |
| A28 | Publisher 申请组织外部写入，无精确 Admin 批准 | 显示 approval_needed，不出站；Ghost 原文发布不因此增加二审 |
| A29 | 批准后改 revision、目标账号、全文／摘要、图片或动作 | 旧批准不自动适用；纠错也重新满足精确批准 |
| A30 | DEV 个人／组织真实发布并更新原副本 | 有权账号成功，保留作者账号／远端 ID；失权时不谎报更新成功 |
| A31 | Hashnode 组织 publication 真实自动发布 | 合格 Pro 和账号权限验证成功；缺资格给出明确原因 |
| A32 | Medium 辅助导入／提交、HackerNoon 投稿及审核 | 准备完整内容、图片、来源和账号指导；提交和接受分开记录 |
| A33 | 中文分发未验证；全文／摘要与延迟分发；等待批准／延迟期间原文被更新或下线 | 默认只启用英文；尊重平台规则和内容权利；无调度时到期需人触发；新建／更新副本前重验原文仍公开且版本一致，否则阻止并说明原因 |
| A34 | 发布前确认文字和图片权利；缺权限／订阅 | 保存确认记录，明确解释缺失条件，不绕过平台要求 |
| A35 | 各目的地出现成功、失败、待批准、人工、提交、不确定 | 分开显示 URL、状态和历史，submitted 不显示为 published |
| A36 | 外部实际成功但本地超时／进程中断 | 转 uncertain，先查远端再重试；无法核实时等待处理，不盲发重复副本 |
| A37 | 一个目标失败其他目标已成功 | 成功记录不回退，失败可独立处理 |
| A38 | 取消排队／待审批任务；请求已发送后取消 | 未发送任务被阻止；已发送的不虚报撤回，继续对账跟进 |
| A39 | 获批纠错、请求移除、原文已下线、作者账号丢失或平台不支持删除 | 原文下线不阻止经授权移除已知副本；每个副本单独跟踪；不能处理的保留人工跟进，不报全局成功 |
| A40 | 检查副本来源链接／canonical、连接失效 | 记录核验结果和重连指导，不保证搜索排名或反链价值 |

## 5. 指标、隔离与恢复

| ID | 操作及反例 | 通过条件 |
| --- | --- | --- |
| A41 | 访问公开测试文章并产生已发布／待提交／失败的分发记录后，按日期／文章／语言／destination 查询 | owner 和文章归属正确，PV、估算 UV、热门、趋势及各分发状态数量可核对；CMS／NyxID 同口径；可用数据也标明 source／updated_at |
| A42 | 从外部链接访问及无 referrer 访问 | 可识别的 referral／campaign 正确归因，其他标为未归因 |
| A43 | 外部指标未授权或无接口 | 显示 Unavailable，保留 source／updated_at／覆盖范围，不填 0 |
| A44 | 跨平台或跨日 UV 汇总 | 遵循明确估算口径，不声称跨平台独立读者总数 |
| A45 | 组织成员查询聚合；他人查询个人指标；访问私有预览 | 组织成员可查组织聚合；个人和跨 owner 数据隔离；预览不计入 |
| A46 | 指标采集故障、隐私／同意配置变化 | 发布不中断，数据可用性准确，隐私配置实际生效 |
| A47 | 检查内容、导出、浏览器响应、日志 | 无凭证／密钥／原始授权头泄漏；私有资源隔离 |
| A48 | 编辑、确认、审批、发布、运维读取私有内容 | 重要事件与运维访问有可追踪历史；含 actor、owner、Trace ID |
| A49 | 全量备份并在隔离环境恢复 | 平台内容、媒体、发布记录、Ghost 数据与配置、远端映射恢复一致 |
| A50 | 恢复时包含待执行和 uncertain 分发 | 先暂停出站，重验权限及远端状态，恢复不造成重复副本 |
| A51 | Ghost 站点宕机与业务发布服务中断 | 分别演示恢复行为；达到上线前约定的 RPO／RTO |
| A52 | 运维交接 | 部署、版本、注册、域名、账号、订阅、费用、维护、监控、退组、已知限制及未完成项齐备 |

## 6. 证据要求

每项验收记录 requirement_ids、deliverable_ids、experiment_id、层级（document/local/live）、环境与版本、时间、操作者别名、角色／scope、前置条件、revision／摘要、目的地和动作、期望／实际结果、脱敏证据、Trace ID、未决问题及责任方。

Mock、静态配置、文档均不能代替 Live 连接器验收。通过本地 Ghost 实验不代表已经完成 NyxID 登录、发布授权或全平台隔离。必需交付不能用 not_applicable 规避；未验证或受阻必须如实保留。
