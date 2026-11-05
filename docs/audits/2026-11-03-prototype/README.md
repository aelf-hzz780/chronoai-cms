# 全站原型核查：需求、最新源码与实际交付进度

日期：2026-11-03。模式：Hybrid。对象：Nyx CMS 方案 B 的 14 个页面及关键状态。

**结论：保留现有视觉和导航方向，先补齐业务状态与内容真实性，再进入业务前端替换。** 本轮归纳 15 项差异，其中 6 项 P1 应先修正。页面数量已基本完整，主要遗漏发生在页面内部的状态、动作和权限合同。原型可用于视觉讨论，目前还不能作为完整的开发验收规格。

本轮仅新增审查报告、截图和验证记录；未修改业务代码，也未修改原型代码。浏览器中的发布、下线、连接等操作均为原型内存模拟，没有请求真实平台。结束前已刷新清除本轮模拟数据并回到原来的中文文章编辑页。

## 1. 审查基线与证据边界

| 来源 | 本轮实际取得的版本 | 用途 |
|---|---|---|
| [需求 Gist](https://gist.github.com/ctkm-aelf/eea0b7fc47d09d4c891adfbb1c4684af) | v0.7，revision `79e69842f5bacba7f8204f62d151018bacf98d91`，2026-10-28 更新 | requirements.md 与 supporting-deliverables.md；内容与两个本地仓库副本均完全一致 |
| [CMS 最新交付分支](https://github.com/aelf-hzz780/chronoai-cms/tree/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a) | `codex/003-blogsystem-delivery`，HEAD `ce4fb1a`；最近业务变更为 `c16cde7`，其后是文档变更 | 独立克隆到 `/tmp/chronoai-cms-review-20261103`，未覆盖工作区 |
| [NyxID 最新提交](https://github.com/ChronoAIProject/NyxID/commit/ff302d5ecfe8d188cf0f167995e87bc08c722296) | `ff302d5`，父提交 `6ae4a9c` | 复核最新 OAuth/CLI 完成页及共享连接布局增量 |
| [交付进度聊天](codex://threads/01a19b5d-aa40-78b3-bcc1-2a0616a8e3fc) | 本轮重新读取最近进展；最终状态以最新源码交付台账为准 | 避免继续沿用历史阻塞结论 |
| 本地原型 | `prototypes/nyx-cms-b`，资源标识 `i18n-6` | 当前运行页面、源码、17 项现有检查 |

当前工作目录没有 Git remote，且有既有未提交的基础设施修改，所以采用独立审查 checkout。没有执行合并、提交或 push。新 checkout 未发现 Spec Kitty 任务目录或额外 AGENTS.md。

证据分为三类：**浏览器复现**、**当前源码/隔离状态检查**、**仓库交付证据**。源码已有能力不等于真实平台验收通过；历史测试通过也不等于在本轮 SHA 重跑。本轮未部署业务系统、未运行外部平台写入或正式验收。截图均在本轮从现有浏览器采集并打开检查，原始尺寸 816 × 1136；长页截图是当前视口，完整控件另结合 accessibility tree 与源码检查。本轮没有重新做全断点或完整 WCAG 审计。

## 2. 实际交付进度：修正旧结论

[最新交付台账](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/docs/delivery-status.md#d1d9)将 **D1–D9 全部标为 implemented，正式状态仍为 NOT_ACCEPTED**。不能把实现、固定版本本地验证、外部实测和正式签收混为一谈。

| 交付 | 已有实现／有界证据 | 仍需完成的交付验证 |
|---|---|---|
| D1 基础平台 | 本地登录、退出、门户 Open app 与直接 CMS 同身份工作区；CMS 已升级 | 公开 Ghost 域名可达性、容量费用、付款与具名运维交接 |
| D2 双入口 | CMS/service/MCP 内容与文件路径；35 项注册契约读回一致 | 正式交接、真实外部连接用例；35 项注册不等于全部经 MCP 执行 |
| D3 所有权与角色 | owner 隔离、当前权限、选定本地 service 来源与撤权边界 | 真实外部组织写入的精确批准与共享交接 |
| D4 编辑器 | Markdown、素材、冲突、译文、CMS 本地闭合 | 共享公开博客与正式交接 |
| D5 Ghost 原文 | 四 Ghost 发布／更新／取消／核验；最新受影响单站路径通过 | 公开域名与交接；历史首次核验失败根因仍未知 |
| D6 外部分发 | DEV/Hashnode adapters、辅助投稿与本地 Native 契约 | 四平台适用账号、实际连接、资格和获准内容动作 |
| D7 生命周期 | 取消／核验／纠错／移除／人工跟进与历史 | 真实外部副本生命周期及人工流程 |
| D8 指标 | collector、API、看板、consent | 实际隐私配置与授权数据源；不强求无来源数据为 Available |
| D9 恢复与交接 | 四站加密恢复、非空 delivery 隔离恢复 | 外部副本恢复、具名监控／备份／隐私责任与正式签收 |

**不再列为“未实现”的旧阻塞：**选定本地路径的 R031、W2 四站恢复及联合补验、普通门户入口、35 操作注册、该交付分支的 push/Draft PR。只读 Verifier 已核对两份证据 manifest，103 + 25 项文件 hash 一致。它们仍绑定各自记录的版本和范围，不能把历史 303 项测试合并宣称为 `c16cde7` 全量通过。

[最新外部交接清单](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/docs/continuation-external-handoff-20261103.md)明确沿用本地 Nyx/CMS，不需要为了本轮补一个远端身份系统，也不新增所有 credential/transport 或任意数值 RPO/RTO 门禁。最新 upstream NyxID 与正在使用的本地补丁不是同一部署版本；本轮未替换部署。

## 3. 14 页巡检结果

“需补状态”表示页面布局可沿用，但还缺需求要求的流程；“存在不一致”表示当前演示行为会传递错误业务语义。

| 步骤 | 页面 | 总体情况 | 保留与补充 |
|---|---|---|---|
| 01 | 登录 | 主路径清楚，需补入口上下文 | NyxID 单入口、取消/失败演示可保留；与首次/再次登录和原访问页衔接，见 F13 |
| 02 | 工作区引导 | 需补用户类型 | 已区分个人/组织；缺无组织、多组织及组织权限不可获取，见 F13 |
| 03 | 内容列表 | 存在不一致 | 搜索/筛选/批量选择清晰；文章级状态覆盖语言级提交，见 F01 |
| 04 | 双语编辑器 | 结构合理，内容能力未覆盖完整 | UI 语言与文章语言已分开；补准确渲染、私有素材、原样导出和历史内容，见 F02/F07/F08 |
| 05 | 发布确认 | 存在高优先级不一致 | owner、作者、语言、站点、权利确认清楚；正文仍掺固定示例，原文任务未独立，见 F02/F03 |
| 06 | 文章分发详情 | 状态最多，仍有关键缺口 | 已区分原文/副本、submitted/published；补准确渠道能力、纠错、格式、延迟和人工跟进，见 F04/F05/F09/F10 |
| 07 | 发布与分发 | 概览清楚，任务覆盖不足 | 已知副本与未知结果提示合理；补原文任务、显式取消及生命周期操作，见 F03/F04/F10 |
| 08 | 数据分析 | 存在统计口径不一致 | Unavailable、来源、更新时间和不合并 unique 的原则可保留；外部累计计数不能画作区间趋势，见 F11 |
| 09 | 连接与渠道 | 需补完整连接流程 | owner/账号概念清楚；人工渠道也需连接校验，连接回程/绑定失败未设计，见 F05/F06 |
| 10 | 工作区设置 | 双 Ghost 展示正确，状态过粗 | 两个独立站点入口已对齐；就绪应按 owner×language，编辑设置另有 API 依赖，见 F14 |
| 11 | 成员与权限 | 权限说明合理，接口依赖待定 | Publisher 不等于 Admin 的文案正确；需明确成员来源和管理能力，见 F15 |
| 12 | 使用指南 | 基本可用 | 四步主链清晰；需同步新增连接/纠错/取消流程，区分个人 DEV 与组织批准规则 |
| 13 | 公开博客首页 | 阅读结构可保留，缺 consent | 公开内容与私有稿分开；补统计允许/拒绝/更改选择，见 F12 |
| 14 | 公开文章 | 阅读与翻译入口可保留 | 采用已发布快照；复杂 Markdown/素材与 consent 待补，见 F02/F12 |

可访问性观察：页面有标题、图标按钮 accessible name、字段标签、文字状态与可见焦点；本轮模态 Escape 能关闭。截图 04/05/08/09 的次要说明、站点域名及状态字号较小，应在后续视觉收尾提高可读性。尚未测量所有颜色对比、200% 缩放、屏幕阅读器、完整键盘焦点顺序或移动设备，不宣称无障碍合规。

## 4. 六项 P1：进入实现前应先修正

### F01：中文发布会让英文待发布项从队列消失

**要求：**R4/R5，双语独立保存、提交、发布。**证据：浏览器复现 + 隔离状态检查。**

样例 `Permissions that move with your team` 的 EN 已提交 v4、ZH 已发布 v2。只确认更新 ZH 后，待发布计数 2 → 1，整篇文章变成 Published；再打开 EN，仍是 Submitted v4、尚未公开。相关截图 03、03a、03b、04b。

原因在 [app.js:85](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:85) 与 [app.js:128](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:128)：筛选与发布更新共用整篇 `a.status`。业务代码已按独立语言文章处理 submission，见 [content.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/content.ts#L54)。

**下一版：**列表按语言显示状态、提交 revision 和线上 revision；待发布任务打开确切语言。**验收：**更新 ZH 后 EN v4 仍留在待发布队列，不能被标为已经公开。

### F02：发布确认不是实际正文，预览与素材也不完整

**要求：**R5/R6/D4/D5，审核确定内容及其正确渲染。**证据：浏览器复现。**

新稿输入 `Our actual second section`、代码块、表格、链接和图片语法后，私有预览显示未渲染语法；发布确认又插入固定的 `Identity is the starting point`，并重复首段。它不只是截断摘要，而是展示了原稿不存在的标题。截图 04c、05a。图片按钮仅插入占位路径，未设计选择/预览/失败/归属检查。

定位：[app.js:89](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:89)、[app.js:91](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:91)、[app.js:163](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:163)。业务已有 MarkdownIt、安全渲染和私有素材，见 [render.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/render.ts)、[media.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/media.ts)。

**下一版：**三个预览入口复用正文渲染，但分别绑定已保存稿、确认快照和线上快照；可以折叠长文，但必须有完整预览。用本地模拟素材补齐上传/失败/重试状态，不要求接真实 API。**验收：**同一 revision 的段落、代码、表格、链接和图片在三个入口渲染一致，没有固定样例段落混入；后续草稿编辑不会改变已确认或线上内容。

### F03：原文任务依附页面，离开会悄悄取消

**要求：**R8/D7，取消待办、未知结果先核验。**证据：源码 + 独立隔离状态复现；未做真实网络测试。**

确认原文后，在一秒计时完成前切换页面，会清除 `releaseTimer`、把 `processing` 重置为 `idle`；没有 cancelled 记录，也没有任务可恢复。页面同时缺原文 queued/verifying/uncertain/failed 的完整入口。现有截图 05/07 体现其界面范围。

定位：[app.js:74](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:74)、[site.js:154](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:154)。业务已有持久原文任务、取消、核验及独立补图确认，见 [publishing.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/publishing.ts#L49)。

**下一版：**原文与分发任务均独立于路由；增加明确取消、只读核验，以及独立确认发布版本和图片公开权利、检查当前发布权限的补图动作。补图不新增外部分发式的组织 Admin 审批。**验收：**离开/返回不丢任务；取消留下状态和历史；未知结果不直接重发。

### F04：DEV 移除能力被夸大，副本纠错/移除入口不完整

**要求：**R8/D7。**证据：浏览器 + 当前 adapter 源码。**

DEV 发布成功时只有“查看公开副本”，必须先下线原文才出现“移除已知副本”；弹窗是“模拟批准并移除”。当前业务 DEV adapter 只自动支持 create/update，remove 要人工跟进；Hashnode 才支持三种自动动作。原型对已发布副本也缺“纠错现有副本”。截图 06b。

定位：[app.js:94](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:94)、[app.js:148](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:148)；实际能力：[targets.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/targets.ts#L39)。这描述当前交付实现，不推断平台永远不支持其他能力。

**下一版：**按渠道/动作能力显示纠错、移除或人工跟进；原文在线时也能处理已知副本；账号失效仍保留跟进责任。**验收：**DEV 移除不会一步跳到 removed，必须记录人工动作并核验；每次纠错绑定现有 copy、版本、账号和适用批准。

### F05：Medium/HackerNoon 被当作无需账号连接的流程

**要求：**R7/D6，指定归属账号与 NyxID 管理连接。**证据：当前页面 + 分发前置校验源码。**

连接页只给两人工渠道显示 Manual workflow，直接允许取得材料/登记结果，没有未连接、绑定中、失效或 owner 不符的状态。实际新建分发对四渠道统一要求 `connectionId`，先核验精确 owner/账号，再选择自动或人工模式。截图 09、06。

定位：[site.js:54](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:54)；实际合同：[distribution.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/distribution.ts#L59)、[nyxid.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/nyxid.ts#L93)。

**下一版：**人工方式与账号连接分开展示；明确将用哪个账号投稿，并呈现连接校验状态。**验收：**新投稿连接不合格时说明阻塞；既有副本失联可保留人工跟进，不替换账号。

### F07：Markdown 原样导出会改动导入内容

**要求：**R5/D4，保留原始 Markdown。**证据：源码 + 独立隔离逐字节复现；本轮未通过浏览器文件选择器上传。**

含 BOM、CRLF、`# Imported title` 的 Markdown 导入后直接导出，原型会去掉 BOM，额外拼一个标题，导致两个标题。定位：[app.js:118](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:118)、[app.js:103](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:103)。业务已有原字节保存/下载，见 [content.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/content.ts#L32)。

**下一版：**区分文章标题元数据与 Markdown 原文；未编辑的导入内容保留原字节。**验收：**BOM 有/无 × LF/CRLF 的文件直接导入导出逐字节一致；编辑后规则明确，不重复插标题。

## 5. 九项 P2：补流程与接口合同

| ID | 遗漏／不一致与依据 | 业务现状 | 下一版原型及验收 |
|---|---|---|---|
| F06 连接回程 | 09a 只有“模拟指定账号已配置”，缺取消、返回重验、已连接但未绑定、绑定失败 | CMS 仍从 `connectionsFile` 读取 owner/UserService 绑定；登录回调已有，外部连接创建/绑定/可信回程链路没有现成消费 API | 设计“去 Nyx → 返回 → 服务端重验 → 确认 owner/账号”；允许明确的运维协助绑定路线。自动回跳/动态绑定是实现选择，不能把它们当成已交付能力 |
| F08 历史内容 | 04a 只能看当前/线上/样例旧版，不能打开旧内容 | API 已有指定 revision 读取/预览/下载，现业务 UI 也主要是历史摘要 | 旧版选择、授权范围内预览/下载、确认记录；不要求额外新增一键恢复旧版 |
| F09 分发形式与延迟 | 06a 固定“全文副本”，缺摘要编辑及全文/摘要确认预览、延迟选择；R7 明确要求。现有原文 URL 和材料中的来源信息应保留 | full/excerpt 已实现；延迟选择/记录在本轮所读业务与原型中均未见 | 全文/摘要及确认预览；现在/稍后人工操作和待办。自动 scheduler 可选，不以没有 scheduler 为由省略延迟需求 |
| F10 人工跟进 | 06c/06d HackerNoon 从 submitted 直接走模拟公开成功，无 URL 输入/拒绝记录；Medium 公共链接呈现不足 | 已有 manual/reviewing/rejected、URL 校验、取消与历史 | 统一跟进面板：投稿/公开链接、审核中/拒绝/待处理、时间/备注；“已提交”不能等于已发布；未发送任务可显式取消 |
| F11 指标口径 | 08a 的 DEV 显示近 30 天 PV、趋势与来源分布；缺 Hashnode、reactions/comments、分发结果/campaign；日均定义未映射 | 外部是当前副本最近采集的累计 counters，日期筛选采集时间；Ghost `estimatedDailyVisitors` 也不是直接的日均值 | 分开 Ghost 区间流量与外部累计指标；外部无趋势/来源数据则显示不可用；日均若保留需明确分母；每卡带 source/更新时间/coverage |
| F12 公开页 consent | 13/14 没有统计允许/拒绝/更改选择入口 | tracker 已有中英 consent、GPC/DNT、拒绝不采集 | 按部署隐私配置展示简洁 consent，并提供撤回/变更入口；无需新增复杂 cookie 产品 |
| F13 工作区边界 | 01/02 固定一个组织+一个个人；登录总进 onboarding | 登录自动建立个人 owner，`/me` 返回授权工作区集合 | 无组织仍可个人创作；多组织按实际列表选择；组织权限获取失败/离组不回退到错误 owner；首次/再次登录分流是体验优化 |
| F14 站点/设置 | 10 已显示两个 Ghost，但 provisioning 用一个工作区布尔值；同时编辑名称/简介/默认语言没有现业务写 API | 真实站点/发布校验按 owner×language；显示名称主要由运维配置 | 必需：EN 就绪、ZH 未开通可并存且仅阻断 ZH。可选：自助设置需单列接口依赖，或先只读展示，不把它新增为 D1 门禁 |
| F15 成员能力 | 11 固定成员与全局角色，缺成员目录/加载失败/动态撤权合同 | `/me` 只返回 canPublish，不能判断 Admin；grant/revoke 有后端当前 Admin 校验，没有对应成员目录和管理 capability 读取合同 | 明确成员来源及 canManagePublishers 等能力；加载失败、撤权和保存拒绝可见；不能用 canPublish 决定管理权限。无需新增邀请/创建组织/修改 Admin |

关键源码定位：

- F06：[原型连接动作](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:89)、[Nyx 连接发现/绑定](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/nyxid.ts#L87)。Nyx `ff302d5` 主要改 CLI OAuth 默认应用和完成页，共享连接组件；不能据此认定 CMS 端回程已补齐。通用 Hosted Connect Link 的个人归属不能直接当组织绑定方案。
- F08：[原型历史](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:132)、[revision API](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/app.ts#L90)。
- F09/F10：[分发确认](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/app.js:136)、[人工动作](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:106)、[实际分发合同](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/distribution.ts#L132)。
- F11：[原型指标](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:49)、[实际统计定义](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/metrics.ts#L59)。
- F12：[原型公开页](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:59)、[真实 tracker](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/web/tracker.js#L3)。
- F13/F15：[/me 工作区合同](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/app.ts#L70)、[当前 Admin 校验](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/policy.ts#L42)。
- F14：[原型站点阻断](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/prototypes/nyx-cms-b/site.js:124)、[实际 owner×language 校验](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/publishing.ts#L44)。

## 6. 下一版建议：保持 B 方案，按三个工作包收口

目标是让 Member、Publisher/Admin、个人作者及公开读者都能完成对应任务，并准确理解当前状态。非目标：本轮改业务实现、部署、购买订阅、发真实内容，或新增未要求的审批链/个人 Hashnode/自动 scheduler。

| 方案 | 取舍 |
|---|---|
| A：立即接入现有 API，边接边补页面 | 可以更早看到真实数据，但会把原型语义错误和接口缺口一起带入实施，返工风险高 |
| **B：先修正原型及交互合同，再按模块接业务（推荐）** | 保留已认可视觉；先把冻结内容、语言状态、账号与任务做对，API 依赖可独立评审 |

| 后续工作包 | 范围 | 完成标准 | 粗估投入 |
|---|---|---|---|
| P-01 内容与原文任务 | F01/F02/F03/F07/F08，加 F14 的语言站点就绪 | 双语队列不串、实际正文一致、原样导出、历史可读、路由切换不丢任务、单语言故障不阻断另一语言 | 约 2–3 人日 |
| P-02 连接与副本生命周期 | F04/F05/F06/F09/F10 | 四渠道连接前置明确、自动/人工能力准确、全文/摘要/延迟、纠错/移除/审核/取消/未知核验都有下一步 | 约 2–3 人日 |
| P-03 指标与完整用户场景 | F11/F12/F13/F15，加 F14 可选设置边界 | 指标口径对应 API；隐私选择、无组织/多组织、Admin 能力与失败状态清楚；中英界面同步 | 约 1–2 人日 |

粗估仅针对当前本地高保真原型与交互核查，不是业务开发或上线承诺；接口协商、真实平台账号和验收另计。没有要求重做视觉方向。

衡量方式：核心目标为“确定版本在正确 owner/语言/账号下完成任务的可解释闭环”。原型验收要求：6 项 P1 全部通过明确反例复测；15 项均有对应修正、接口依赖或明确可选决定；每个失败状态有可执行下一步。护栏：不冒充已公开、不回退账号、不把不可用指标当零、不因换界面语言改变内容/站点、不因导航隐式取消。

后续实施依赖：连接 owner/UserService 绑定策略、Admin capability/成员来源、是否保留自助设置、延迟记录方式。可先用模拟合同完成原型，不要求等真实平台写入。若以后接业务，应分模块替换并保留旧 UI 入口/版本；不改变后端状态或迁移数据作为 UI 回滚手段。本轮无部署回滚事项，既有文件保持原状。

## 7. 实际验证与限制

- 本轮 14 条路由均打开并保存截图；额外复现双语队列、复杂 Markdown/发布确认、DEV 移除、人工投稿及指标切换。
- `node prototypes/nyx-cms-b/checks.cjs`：**17/17 PASS**。这些既有检查没有覆盖本轮全部新反例，不能据此认定原型需求完整。
- 两位只读审查者分别核对内容/生命周期和交付/权限/指标合同；前者用隔离状态环境复现队列、计时任务、Markdown 字节与渲染问题，后者核对 128 项交付证据 hash。本轮未修改测试来隐藏问题。
- 未重跑 CMS 后端完整测试、真实 Ghost 发布、Nyx 登录/授权或四平台写入；未验证运行中平台目录的自定义服务配置。
- 公共 SEO/sitemap/hreflang、真实可达性、接口安全性、持久化和生产统计正确性不能由这个纯前端原型证明，仍按业务验收证据处理；不会因为 hash 路由原型缺真实 sitemap 就把它记为新增原型缺陷。
- UI 英文/中文切换本轮抽查正常；17 项现有检查也覆盖语言偏好与域名独立性。未把公开文章正文中的中文误报为英文 UI 翻译遗漏。

## 8. 本轮截图

以下为本轮保存并逐张检查的截图。01–14 对应页面顺序；带字母的文件对应具体反例。原始截图、accessibility tree、源文件 hash 和检查输出保存在同目录。

### 01 登录

![01 登录](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/01-login.jpg)

### 02 工作区引导

![02 工作区引导](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/02-onboarding.jpg)

### 03 内容列表：原始待发布 2 项

![03 内容列表](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/03-content.jpg)

只更新中文后，英文提交从筛选中消失（F01）：

![03b 队列丢项](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/03b-awaiting-list-missing-en.jpg)

### 04 双语编辑器与历史

![04 双语编辑器](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/04-editor-zh.jpg)

![04a 历史只有摘要](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/04a-history.jpg)

![04b 英文仍为 Submitted](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/04b-en-submission-still-exists.jpg)

![04c Markdown 未完整渲染](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/04c-markdown-preview.jpg)

### 05 发布确认

![05 发布确认](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/05-publish.jpg)

自定义原稿被插入固定示例标题（F02）：

![05a 确认正文不符](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/05a-confirmation-wrong-body.jpg)

### 06 文章分发详情

![06 分发详情](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/06-distribution.jpg)

![06a 固定全文](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/06a-dev-fixed-full-format.jpg)

![06b DEV 移除能力误导](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/06b-dev-remove-overpromise.jpg)

![06d 人工核验缺 URL](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/06d-hacker-no-url.jpg)

### 07 发布与分发总览

![07 任务总览](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/07-deliveries.jpg)

### 08 数据分析

![08 指标概览](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/08-analytics.jpg)

DEV 被展示成区间流量和趋势（F11）：

![08a 外部指标口径不符](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/08a-dev-metric-scope.jpg)

### 09 连接与渠道

![09 连接与人工渠道](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/09-connections.jpg)

![09a 连接回程尚未设计](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/09a-connect-binding-gap.jpg)

### 10 工作区设置

![10 两套 Ghost 展示](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/10-settings.jpg)

### 11 成员与权限

![11 成员权限](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/11-members.jpg)

### 12 使用指南

![12 使用指南](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/12-guide.jpg)

### 13 公开博客首页

![13 公开博客](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/13-blog.jpg)

### 14 公开文章

![14 公开文章](/Users/huangzongzhe/workspace/vibeCoding/Chronoai/BlogSystem/docs/audits/2026-11-03-prototype/screenshots/14-story.jpg)
