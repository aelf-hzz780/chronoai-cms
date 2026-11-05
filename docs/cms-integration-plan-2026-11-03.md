# 真实 CMS 对接计划 / CMS integration plan

日期：2026-11-03。状态：**供确认的实施计划，尚未实施**。依据已确认的 B 方案全站原型、需求 v0.7、实际交付分支及 API 源码。本轮仅同步审查 checkout、核对资料和新增本文，未修改业务代码或原型。

Date: 2026-11-03. Status: **implementation proposal, not implemented**. This plan maps the accepted B prototype to requirements v0.7 and the current delivery branch. This round only synchronized the review checkout, inspected evidence and created this document; application and prototype code remain unchanged.

## 1. 结论与基线 / Recommendation and baseline

**推荐增量替换 CMS 前端，复用现有业务服务；先补读取合同，再接真实交互。** 内容、原文发布、私有素材、外部分发、精确批准和指标已有大量实现。主要增量是授权读模型、成员/站点信息、连接回程、延迟人工待办，以及旧来源人工副本的核验。公开博客另做 Ghost theme，不能直接连接 CMS 的私有文章 API。

**Incrementally replace the CMS frontend while retaining existing business services.** Complete authorized read contracts before wiring the UI. Core content, publishing, private media, distribution, exact approvals and metrics already exist. New work concentrates on read models, workspace information, connection return flows, deferred human actions and verification of manual copies whose original has changed. Public pages require a separate Ghost theme.

| 核对项 / Item | 本轮确认 / Verified baseline |
| --- | --- |
| 工作目录 | `BlogSystem` 无 remote，已有未提交改动保持原样；复用 `/tmp/chronoai-cms-review-20261103` 独立审查 checkout |
| CMS 拉取 | `git pull --ff-only` 成功，Already up to date；远端 `aelf-hzz780/chronoai-cms`，分支 `codex/003-blogsystem-delivery`，固定 SHA 见下一行 |
| CMS 固定 SHA | **`ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a`**；最后业务修复为 `c16cde700963959d3fd7fc226853b71f5551573a`，后续为文档交接；`main` 仍是旧 baseline `019222c`，不能用其代表当前交付 |
| 需求 | Gist v0.7，revision `79e69842f5bacba7f8204f62d151018bacf98d91`，两份正文 SHA-256 与本地 source manifest 一致，无需求更新 |
| 原型 | `prototypes/nyx-cms-b/DELIVERY.md`，P01–P03、F01–F15，14 个主页面；已确认 B 视觉风格，默认英文、中文可切换 |
| NyxID 上游 | 本轮远端读取到 `85e23be62cae48b334a961ae81c62aca0a65ecb2`；相对原型审查的 `ff302d5` 新增 Lark/Feishu plain-text/image 能力，不能据此认定 CMS 动态连接回程已实现 |
| 实际运行版本 | 交接记录使用本地 Nyx 后端 `049ee1c`、门户 `c65dc4be`、CMS 业务源码 `c16cde7`；这是记录中的部署证据，本轮未重新验证运行进程，也未升级本地 Nyx |
| 验收状态 | D1–D9 为 implemented，但正式签收仍 **NOT_ACCEPTED**；源码存在、局部实测、部署、push、正式签收分别记录 |
| 工程流程 | 当前审查 checkout 未发现 Spec Kitty 配置/mission；本轮不新建 mission、不提交、不 push。实施时沿用实际仓库流程及 `codex/` 功能分支 |

已完成的 R031 选定本地来源路径、W1/W2 有界验证、普通门户入口及 35 操作注册不重新列为“未实现”。剩余外部账号、指定连接、具体内容动作批准、公开 Ghost/图片可达性与具名运维交接仍需独立验收。历史 303 项测试、`c16cde7` 的 54 项目标回归以及原型的 59 项检查各自绑定原版本，不能合并成新版本全量通过。

Do not reopen the bounded R031/W1/W2 work, portal entry or the registered 35-operation set as missing implementation. Real provider accounts, exact connections and approvals, public Ghost/media reachability and named operational handoff remain separate acceptance dependencies. Historical test counts are version-specific and are not evidence of a new full-suite run.

## 2. 目标、场景与边界 / Goals, users and scope

目标：将已确认的操作体验接入真实数据，完成“选择身份 → 写作/投稿 → 确认版本 → 原文核验 → 分发/跟进 → 指标”闭环，并保持 CMS 与 NyxID service 的业务和权限一致。

Goal: deliver the accepted experience against real data, from workspace selection through writing, confirmation, original verification, distribution and metrics, with equivalent business and permission rules in CMS and NyxID service access.

| 用户 / User | 核心场景 / Core job | 验收重点 / Acceptance focus |
| --- | --- | --- |
| 个人作者 / Personal author | 管理本人 EN/ZH 原稿及个人渠道 | 无组织也能完成；组织角色变化不影响个人所有权 |
| 组织 Member | 管理本人组织草稿、提交指定修订 | 可继续编辑；未提交的新稿不泄漏给 Publisher；不能写组织渠道 |
| Publisher / Admin | 发布本人或已提交稿，跟进组织副本 | 每语言独立权限；Ghost 原文无需第二人编辑审；组织自动外部写入仍需 Nyx 精确 Admin 批准 |
| Admin | 查看当前组织目录、授予/撤销 Publisher | 管理权与发布权分离，当前 membership 和 scopes 双校验 |
| 公开读者 / Public reader | 阅读两语言站点、切换已发布译文、管理 consent | 不依赖 CMS 登录；草稿不公开；隐私选择不阻断阅读 |

本期不包含：改 Ghost core、替换 NyxID 鉴权、自动定时发布、自助域名/站点开通、个人 Hashnode、未验证的中文外部分发、历史修订一键回滚、富文本替代 Markdown。站点设置保持只读；“延迟”落实为持久化待办，到期后由人再次确认，不自动发文。连接优先完成明确的 Nyx 管理与返回重验，动态 owner 绑定按经核实的上游合同实施。

Out of scope: Ghost core changes, replacing NyxID authentication, automatic scheduling, self-service domain provisioning, personal Hashnode, unverified Chinese distribution, revision rollback and replacing Markdown with rich text. Settings remain read-only. Deferred distribution is a persisted reminder requiring fresh human confirmation. Connection binding depends on verified upstream contracts.

## 3. 方案选择与接入结构 / Options and architecture

| 方案 / Option | 收益 / Benefits | 成本与取舍 / Trade-offs |
| --- | --- | --- |
| **A：现服务 + 分模块新 UI（推荐）** | 复用 Fastify、Content/Publishing/Distribution/Policy、SQLite、Worker、Nyx 连接；可按页面灰度、旧 UI 回退 | 需补 TypeScript DTO/前端构建与模块边界，不能直接复制原型脚本；保留现有业务约束 |
| B：新建独立前端应用与 BFF | UI 技术边界独立，适合已有统一前端平台的团队 | 新增部署、跨服务 session/CSRF/CSP 与业务规则漂移风险；当前没有证据表明必须另造 BFF |

采用 A。当前前端是 `web/app.js + index.html + style.css`，不是已有 React/Vue 应用。先确定 typed transport、view model 与组件边界，使用同源静态构建；框架选择不阻塞 API 合同，也不要求重写服务层。原型只迁移视觉 tokens、布局、文案和交互意图，不迁移样例数据库、角色判断或 `setTimeout` 发布成功逻辑。

Choose A. The current frontend is plain browser JavaScript. Introduce typed transport, view models and modular UI assets under the same origin. Reuse the prototype's visual tokens and interaction design, not its simulated database, permissions or timer-driven state transitions. A separate BFF is unnecessary at this stage.

```text
CMS B UI（EN / 简中界面；独立文章语言）
  → CMS transport：session cookie + Origin + x-csrf-token
  → /api/cms：授权读取 DTO / 业务命令
                         ↘ 共享 Content / Publishing / Distribution / Policy
NyxID service → /api/service ↗                → SQLite + Worker → Ghost / provider

公开读者 → owner × language Ghost 站点 + B theme
                                → 既有 collector / consent tracker
```

实现约束：控制层负责验证/DTO，应用服务编排用例，数据层集中查询；前端 adapter 统一字段差异，view model 负责展示。沿用现有 provider Strategy/Adapter 与 TargetRegistry，不在 UI 以平台名硬编码自动发布能力。新增读模型与发布命令分开，避免列表刷新触发副作用；不引入完整 CQRS 框架。

Implementation boundaries: route validation and DTOs, application use cases, repository queries and presentation view models remain distinct. Reuse provider strategies/adapters and the target registry. Separate read models from commands without introducing a new CQRS framework.

- 当前 CSP 不允许原型中的任意 inline script/style、外部字体或 Blob 图片。静态字体、CSS、JS 同源提供，私有图片使用已有授权路径；预览隔离并沿用 sanitizer/allowlist，不以 `unsafe-inline` 绕过。
- 所有请求携带 owner/语言/文章/修订上下文；切换工作区取消旧请求并丢弃迟到响应，避免跨工作区回填。
- 401 回登录并恢复经过校验的站内路径；403/撤权立即禁用动作并重读能力；409 保留未保存稿并展示冲突；503 明确暂不可用，不伪造空数据。统一展示服务返回的 Trace ID。
- 写请求重试沿用同一幂等键；改变内容/版本/目标/动作属于新确认，使用新键。未知发布结果先核验，不能自动重发。
- 任务用后台 Worker 驱动，页面只做有界轮询；离页/切 owner 清理轮询，页面不可见时暂停。状态以 GET 读回为准，取消/核验 POST 的旧状态不能覆盖更新后的 GET。

## 4. 全站页面与已有 API / Page-to-API mapping

以下业务路径以 `/api/cms` 为前缀；现有业务路由也注册在 `/api/service`，但登录 transport 不同。表中“增量”不是声明接口已经存在。

Business paths below use `/api/cms`. Existing use cases also have `/api/service` routes with a different authentication transport. Proposed additions are not existing endpoints.

| 原型页面 | 已有接口与接入方式 | 需要补齐或校正 |
| --- | --- | --- |
| 登录 / login | `/auth/login`、callback、`POST /auth/logout`；`GET /me` | 前端站内返回路径、取消/失败页；不新建账号密码系统 |
| 首次引导 / onboarding | `/me` 的真实工作区、显示名 | 安全 site 读取、缺配置状态；首次引导为偏好，不是账户权限 |
| 内容库 / content | `GET /articles?ownerId&q&limit&offset` | 真实投稿/线上修订指针、逐语言状态/权限、双语关联摘要、计数/分页；当前数组仅每篇一份可见 revision |
| 编辑器 / editor | `POST /articles`，`PATCH /articles/:id`，`POST .../submit`；import、markdown、markdown-file、revisions、preview、translation、assets | 双语分别存 articleId；UUID 修订；409 冲突；可见历史限制；未保存预览明确标识，已保存预览以服务结果为准 |
| 发布确认 / publish | `POST /articles/:id/releases`；读取 revision、站点信息 | 冻结 owner/revision/byline/rights/action，202 仅入队；site 未配置时阻断 |
| 文章分发 / distribution | `GET .../releases`、`GET .../deliveries`；targets、connections；创建 delivery、request-approval、authorize、package、report、cancel/reconcile | 任务安全详情、自动分发冻结全文/摘要读取；延迟待办；旧来源人工认回；持久化备注 |
| 全局任务 / deliveries | 单篇 releases/deliveries、各自 cancel/reconcile；补图、sync-links/link-status 已有 | 新增 owner 分页聚合列表/详情；不以遍历所有文章凑全局列表 |
| 数据 / analytics | `GET /metrics?ownerId&from&to&article&language&destination`；`POST /deliveries/:id/metrics/refresh` | 真实指标口径、时间、availability/source/coverage；成员可看组织聚合，刷新外部指标仍按服务现有权限 |
| 连接 / connections | `GET /owners/:id/connections`；后端已有精确 Nyx UserService/owner/account 校验 | 当前绑定来自配置文件；发起/返回/未绑定/取消/重验合同；普通 Member 不读取私有连接元数据 |
| 设置 / settings | `/me` 提供 display_name；site 已在数据库和 CLI 配置 | 新增只读站点摘要；简介、默认语言没有现成保存合同，本期不显示可保存假表单 |
| 成员 / members | `PUT /owners/:ownerId/publishers/:subject`，body `{enabled}`；审计读取已有 | 新增成员目录、当前角色及 canManagePublishers；不能用 canPublish 推断管理权 |
| 帮助 / guide | 静态帮助与当前状态链接 | 按权限显示入口；区分自动/人工、待批准/已发布；真实错误码帮助 |
| 公开首页 / blog | Ghost 公开内容和 theme | 新主题模板、分页、语言站点导航；无 CMS session 依赖 |
| 公开文章 / story | Ghost post 模板、发布元数据、已发布译文互链和 tracker | 保持稳定 URL、author、canonical/hreflang、sitemap、consent；不把私有 preview 当公开文章 |

## 5. 必须修正的模型对应 / Model reconciliation

1. **三种语言分开。** UI locale 默认为英文、可切中文；文章语言绑定 article；公开语言绑定对应 Ghost。一个 owner 下 EN/ZH 是不同 site，也可能有不同开通状态。编辑器 tab 是两篇关联文章的工作台，不是翻译同一 Ghost post。
2. **双语仅在展示层聚合。** 每语言有独立 creator、articleId、revisionId、submission 和 release。现 translation 为有方向的 sourceArticle/sourceRevision，可能一源多译；不能按标题猜配对或任取第一篇。读模型明确返回关联集合，遇多译让用户选定；不在本期擅自添加唯一译文约束/迁移数据。
3. **投稿与工作稿/线上稿并存。** 当前 submit 写入指针，但 GET 不回传投稿状态，发布成功也未消费它。需明确 lastSubmission 与 pendingSubmission：确切提交修订发布核验成功后完成该次待办，之后的新提交继续 pending；取消/失败不消费；下线不自动复活旧提交。保留提交历史和完成证据，不能靠页面清空变量。
4. **编辑权按每篇 creator 判断。** Admin/Publisher 不等于能改别人工作稿；非作者 revisions API 当前只给可见 revision。不为凑齐原型历史列表而放宽隐私权限。
5. **原文缺图仍待核验。** `materialize-media` 已有，但仅适用于有 remote_id/url 的 `uncertain/verifying`、非 unpublish 原文。原型 `published + incomplete media` 展示要改成“已发现原文，核验未完成”；补图是独立显式写确认，media_history 的 partial 不等于原文已通过。
6. **审批完成即入队。** 当前 `authorize` 会将组织自动 delivery 入队，没有独立 run/ready API。不能先批准再假设可任意编辑或延迟执行；延迟计划到期后重新确认，再申请精确批准。
7. **保留真实副本身份。** `copyId` 是既有 delivery.id，不是 provider remote ID。更新/移除保留原 owner、article、target、connection、remote ID/URL；失联不换账号，停用渠道的历史副本仍可跟进。自动能力以 targets 的动作能力及当前连接为准。
8. **指标沿用服务语义。** Ghost 来源是自建 collector。estimatedDailyVisitors 是每日唯一估算之和；若保留“日均”，除以含首尾的 UTC 天数并标明非跨日去重。外部只存最近累计快照，日期筛采集时间，不能画虚构区间增长曲线。任务结果按确认创建时间和 destination 筛选；0 与 Unavailable 区分。

Key reconciliations: UI locale, article language and public-site language are independent. Translation tabs represent separate articles and sites, with per-article ownership and permissions. Submission completion needs durable semantics. Missing media keeps an original unverified. Authorization queues work immediately. Existing copies retain their original connection identity. Metrics must use the API's actual definitions and availability metadata.

原型中的示例分类、标签、人物头像、阅读数及成功率不得当作真实字段：标题/作者/日期只用 API 可授权数据；字数/阅读时长可按正文推导并标“估算”；暂无合同的元数据先移除示例展示。新头像/资料写入、分类系统不隐含加入本期。

## 6. 缺失合同清单 / Required contract additions

以下是拟议最小合同，具体字段在 WP00 固化为 response schema 和失败用例；保持旧接口兼容，不直接改变旧数组响应。除纯 CMS session/浏览器返回信息外，新业务能力必须复用双入口用例，并更新对应 service OpenAPI/注册及权限映射。

The contracts below are proposals to finalize in WP00. Preserve backward compatibility, including existing array responses. New business capabilities must use shared CMS/service use cases and update service schemas, registration and scope mappings where applicable; browser-session plumbing remains CMS-specific.

| ID / 优先级 | 拟议接口或增量 | 最小数据与业务规则 | 所属 WP |
| --- | --- | --- | --- |
| C01 / P0 | 扩展 `GET /me` | workspace role、capabilities（write/publish/managePublishers/readConnections/readMetrics）、组织目录状态。仅组织目录故障且当前身份验证成功时允许个人工作区可用；身份验证整体失败仍拒绝。不能返回未授权组织名或旧可用权限 | 01 |
| C02 / P0 | 新增授权内容摘要，例如 `GET /owners/:id/content-summary` | 分页/总数、逐语言可见稿/投稿/线上指针、状态和能力、明确关联集合。筛选与计数基于同一授权集合；不泄漏他人私稿 UUID/标题/摘要。补提交完成的持久语义，最后提交与 pending 分开 | 02 |
| C03 / P0 | 新增 `GET /owners/:id/tasks` 与安全 task detail | 分页筛选、任务类型、原文/分发/补图/互链/待办状态、Trace、历史、版本与副本标识。详情按权限返回冻结内容/摘要与允许动作，不返回 actor_json、token、审批秘密或原始私有配置。冻结版本图片需任务上下文授权路径：同时满足任务读取权限和该 revision 实际引用，只授权这些素材，不扩大为整篇文章图片库访问。原文历史和自动分发 payload 不能靠人工 package 假充 | 03/05 |
| C04 / P0 | 新增 `GET /owners/:id/sites` | 每语言 site 的 publicUrl、configured、最近核验结果/时间及可解释 blocker；没有核验结果就标 unknown，configured 不等于 reachable。禁止返回 key_ref/admin route/凭证。简介/默认语言没有来源则不编造 | 01 |
| C05 / P1 | 新增 `GET /owners/:id/members` | 当前 Nyx 成员目录、role、CMS Publisher assignment、加载/不可用状态。Admin + roles:write 的真实管理能力；使用已有 PUT 授权接口，不新造第二套成员身份 | 06 |
| C06 / P1、分发前置 | 连接 attempt 发起/查询/取消及可信返回适配 | 绑定当前 subject、owner、target、单次 state、有效期与站内 return path；返回后由服务重查真实 UserService 与 owner provenance。浏览器回跳参数不能直接写连接绑定。上游缺自助绑定时明确 `binding_required` 并走运维配置+重验，不假装已连接 | 04 |
| C07 / P1 | 持久化 distribution plan / reminder 的创建、列表、取消、人工确认 | 冻结 release/revision、target、connection、action、format/excerpt、notBeforeAt；update/remove 必须保存 copyId 及原副本身份，到期后仍绑定同一副本。创建计划不产生 outbound job。服务校验到期时间；到期后用户重新核对权限、原文和连接，再经共享 delivery 用例确认，唯一关联新 delivery，防重复点击。重新取得当前执行授权/精确批准 | 05 |
| C08 / P1 | 独立人工既有副本核验，例如 `POST /deliveries/:id/verify-observation` | 原文已 superseded/unpublished 仍可核验已提交副本的冻结内容/归属；只发外部读取，追加观察、身份和 follow-up required，不重发/修改远端，不把失效原文恢复为 published。随后纠错/移除走各自新确认。当前 `/reconcile` 和 `/report(published)` 均不能直接替代 | 05 |
| C09 / P1 | report/event 增加 note 与读取 | 有限长度、当前 actor、时间、审计；说明是人工备注，不能当外部核验凭据。界面承诺保存的备注必须跨刷新存在 | 05 |
| C10 / P0 | 明确 response DTO、CMS transport 文档和错误枚举 | 现 OpenAPI 主要描述 `/api/service`，响应多为 generic object；不能直接生成其 Bearer 客户端给浏览器。补 schema、状态联合类型、分页与能力语义，覆盖已有35操作中受影响部分以及新增操作 | 00/各 WP |

P0 是后续接入依赖，不意味着本轮实施。P1 仍属于已接受全站体验的交付范围；可晚于第一条内容链路，但不能在最终验收时悄悄省略。连接的“运维绑定”允许真实使用先行，完整自助回程未闭合时要明确保留依赖。

P0 denotes integration prerequisites, not permission to implement in this planning round. P1 remains in the accepted full-site scope. Operator-assisted connection binding is a truthful intermediate path; it must not be reported as completion of a missing self-service flow.

**已有、无需重造：** Markdown 原始字节导入/导出、immutable revisions/409、私有素材上传读取、发布/取消/核验、显式补图、译文互链任务、精确分发批准、人工内容包和当前来源 report、指标查询/授权刷新、collector/consent/GPC/DNT、Publisher 写接口及审计。它们需要新 UI 接线和适用场景验证。

素材增量只限 C03 的历史任务上下文：现有 `GET /assets/:id` 按调用者默认可见 revision 判断非作者访问，不能保证旧任务图片始终可见。例如 Publisher 确认含图 R1 后，作者提交不含该图的 R2，直接复用原图片 URL 会拒绝。新增受控路径应绑定任务和确切 revision；普通草稿上传/预览仍复用现有素材接口。

Media changes are limited to historical task context. Existing asset access uses the caller's default visible revision; an image in confirmed R1 may become inaccessible to a Publisher after a new submission R2. A task-scoped path must authorize the exact frozen revision and its referenced assets, without broadening access to other draft images. Ordinary uploads and previews retain the existing API.

## 7. 实施工作包 / Work packages

按三个主线组织：A 内容与原文（01–03）、B 连接与分发（04–05）、C 治理/指标/公开站（06–07）；00 固化合同，08 收口。以下为工程人日粗估，包含相应自动化与一次评审修复，不含等待账号/订阅/外部审批、购买服务或上游开发排期。

Three streams cover content/originals (01–03), connections/distribution (04–05), and governance/metrics/public sites (06–07), with shared contract and integration packages. Estimates are engineering person-days, including relevant tests and one review/fix cycle, excluding external access waits or upstream development.

| WP | 产出与完成标准 | 依赖 | 人日 |
| --- | --- | --- | --- |
| **00 合同与验收基线** | 固定实体/状态/DTO、C01–C10 scope、逐页 API mapping、权限矩阵；给新后端行为先写失败用例；确认新增 schema/注册兼容与数据迁移方案 | 本计划确认 | 2–3 |
| **01 应用壳与身份工作区** | B 导航、EN/简中、同源 assets、现有 OIDC、恢复路由；实现 C01/C04；个人/多组织/目录故障与站点 blocker可见，旧 UI 可回退 | 00 | 3–4 |
| **02 内容库与双语编辑器** | C02；真实分页、投稿/线上指针、每语言 creator/UUID、保存/409、原始文件/历史/私有预览和图片、译文关联；刷新后状态一致 | 00、01 | 5–7 |
| **03 原文确认与任务** | C03 基础；发布/更新/下线、取消/核验/补图、互链；202 后跨页读回，未知结果不重发；补图前后状态严格符合现有服务 | 02 | 3–4 |
| **04 连接与精确批准交互** | C06；渠道/指定连接、Nyx 管理返回、取消/未绑定/失效/错 owner、状态重验；复用 request-approval/authorize，明确授权即入队；凭证不入浏览器 | 00、01；真实 Nyx 合同/指定账号 | 4–6 |
| **05 分发详情与人工闭环** | 扩展 C03 + C07–C09；全文/摘要、持久化延迟待办、DEV/Hashnode 自动能力、Medium/HackerNoon 人工流程、既有副本更新/移除/失联、旧来源只读认回、备注/历史 | 03、04 | 5–7 |
| **06 指标、成员与设置** | C05；接现有 metrics/refresh，指标来源/时间/覆盖/Unavailable；真实成员目录与 Publisher grant/revoke；站点设置只读、帮助闭环 | 01；成员上游目录；05 提供实际副本 | 3–4 |
| **07 公开 Ghost B 主题** | 首页/文章/分页、EN/ZH站点导航、已发布译文互链、稳定URL/SEO、正确author；接既有 tracker/consent，CMS 不可用不影响已有文章 | 00、03；配置好的 Ghost 站点 | 2–3 |
| **08 联调、回归与灰度交接** | 完成下述验收；CMS/service一致性、真实外部副本证据、迁移/回退演练、用户使用说明和具名运维签收记录；未具备外部条件的项明确未验 | 01–07；外部账号/内容授权/运维输入 | 3–5 |
| **合计** | 当前范围的预算级估算；WP00 后按合同与上游可用性复估 | 不以原型制作耗时估生产接入 | **30–43** |

可按 2 位工程同事 + 兼职 QA/设计复核安排，预留约 **4–6 周日历时间**，外部等待另计。首个可用内容工作台里程碑为 WP00–02（10–14 人日）；其余包按依赖并行，不能把总人日直接除以人数当交付承诺。

For two engineers with part-time QA/design review, allow approximately **4–6 calendar weeks**, excluding external waits. The first usable content workspace is WP00–02, estimated at 10–14 person-days. These are planning estimates, to be revised after contract definition.

## 8. 验证、指标与交付门禁 / Validation and acceptance

### 里程碑 / Milestones

- **M1：真实内容工作台。** 登录、工作区、内容库和编辑器使用真实 API；保存、刷新、冲突、两语言与私有图片可演示。此时不把外部分发标为已完成。
- **M2：原文与分发闭环。** 原文发布/补图核验、跨页任务、精确批准、自动/人工副本、延迟待办均持久可恢复；受控环境验证后才按具体授权验证真实外部动作。
- **M3：全站可交付。** 指标、成员/设置、公开 Ghost theme、双入口一致性、回退和运维交接完成；外部证据未齐则保持对应未验状态，不能只凭新 UI 关闭 D1–D9。

Milestones are a real content workspace, an original/distribution workflow, and a fully integrated site with operational handoff. Each milestone requires real API behavior; visual completion alone does not satisfy formal delivery acceptance.

### 核心验收 / Required checks

| 风险面 | 验收场景与证据 |
| --- | --- |
| 身份/隔离 | 个人、组织 Member/Publisher/Admin、多组织；仅组织目录故障个人仍可用，Nyx 身份不可验时 fail closed；撤权和切 owner 后旧数据/动作不可沿用；前端与 service 同规则 |
| 内容/文件 | 两语言不同 creator、重复译文候选、不泄漏未提交稿；旧提交发布同时新提交仍 pending；409 不覆盖稿；BOM×LF/CRLF 原始字节/SHA一致；R1 含图任务在提交不含图 R2 后仍能按任务权限查看，未引用图片及跨 owner 读取拒绝 |
| 发布/恢复 | 固定 revision/owner/byline/rights；双击/超时相同幂等键；离页刷新恢复；unknown 仅外部读取、零新增写；补图仅适用状态、partial 可解释；旧 POST 不覆盖新 GET |
| 连接/批准 | owner/user-service/provider account 精确绑定；取消/关闭/过期/重放/未绑定/账号变更；组织自动批准绑定内容+动作+连接，变更后重确认；失联不回退其他账号 |
| 延迟/人工 | 刷新/重启后待办保留；到期前无 outbound job，到期后无自动写；延迟移除期间副本更新/连接变化，重启后仍指向原 copyId 或明确阻断，不改选“最新副本”；人工 submitted/reviewing不当published；旧来源认回零外部写；备注持久；移除验证同一已知 URL |
| 指标/公开页 | UTC 日期、每日估算与累计快照区分、Unavailable≠0、source/updated/coverage；拒绝/撤回/GPC/DNT 优先；公开中英 host 独立；私有预览不计数；已有 Ghost 页面不依赖 CMS 在线 |
| 工程交付 | 对新增/变更业务合同执行失败先行→实现→回归；受影响现有测试、typecheck、前端构建及关键浏览器流；迁移验证；正式发布前固定 SHA 运行适用整体验证，记录 fixture/local/live 边界 |

北极星指标：有授权且目标可用的会话完成“保存 → 确认 → 原文核验 → 目标结果跟进”的比例及中位完成时间，先用验收会话建立基线；人工平台编辑审等待与系统耗时分开。目标是必测场景全部通过，而非预填虚构转化率。

North-star metrics are the completion rate and median completion time of authorized, supported publishing workflows. Establish a baseline using acceptance sessions and separate platform editorial waiting time from system time. Do not invent production conversion numbers.

保护指标：跨 owner/语言错发、私有内容越权暴露、重试造成重复副本、unknown 恢复触发新写、提前执行延迟任务、无许可统计，各为 **0**；旧新 UI API 错误和任务失败率不得回归。性能以代表性分页数据和有界查询验证，不全量拉文章再客户端过滤；目标阈值在 WP00 记录实际基线后确定。

Guardrails require zero cross-owner/language writes, privacy violations, duplicate copies from retries, new writes during uncertain recovery, premature deferred execution and tracking without consent. Validate bounded pagination and query behavior against representative datasets rather than loading the entire workspace.

### 上线、数据与回滚 / Rollout and rollback

新增 UI 先放独立入口或配置开关，与旧界面共用 session/业务 API；切换策略属于拟议实现，当前无该开关。C02 的投稿完成记录、C06 attempt、C07 plan、C09 notes 等需要受控的向后兼容 schema 迁移和备份，不只在 Store 构造器里临时加字段。若新增服务操作，保留注册 preimage、更新 scope/operation set，验证旧调用不受影响。

Stage the new UI behind a separate route or configuration switch; this switch does not exist yet. Persisted submission lifecycle, attempts, plans and notes need explicit backward-compatible migrations and backups. New service operations require registration snapshots and compatibility checks.

回滚 UI 路由/assets 不撤销数据库记录或已发生的外部发布；保留旧 UI 和新增数据。发布异常先停相关出站、保留任务/Trace，走现有核验/恢复；公开 Ghost theme 独立保留旧包回退。不得回滚审批 generation、复活旧 blocked 命令或用旧数据库覆盖新发布事实。上线前试验“新 API + 旧 UI”兼容与备份恢复。

UI rollback does not undo database records or external publications. Preserve tasks and traces, stop affected outbound work and use existing reconciliation. Roll back the Ghost theme independently. Never revive blocked commands or restore an older database over new publication facts.

## 9. 已验证事实、假设与剩余依赖 / Evidence and dependencies

**本轮实际完成：** 成功快进拉取检查、远端分支/SHA 核对、Gist 内容 hash 对照、原型与 source/API/schema/status 文档逐项映射，以及两位只读 reviewer 的内容/分发与身份/指标独立核对。仅新增计划文件。未运行新的业务测试、未验证实时 API 会话、未创建真实连接或发布内容。

**Completed this round:** successful fast-forward pull check, remote SHA verification, requirement hash comparison, prototype/API/schema/status mapping, and two read-only reviews. Only this plan was added. No new business test run, live authenticated API validation, connection creation or publication occurred.

假设：保留 B 风格与默认英文/中文切换；沿用已选本地 Nyx/CMS 环境；站点由运维配置；先以 EN 外部分发；无自动 scheduler；不用新技术框架作为任务前置。若这些假设变化，WP00 更新影响而不静默扩范围。

Assumptions: keep B styling and English/Chinese UI, retain the chosen local environment, use operator-managed sites, begin external distribution in English, and exclude automatic scheduling. Changes to these assumptions require an explicit scope update.

外部依赖：当前 Nyx 成员目录可用合同和连接返回/绑定能力；DEV 指定作者/组织账号、Hashnode 有效 publication/资格；Medium/HackerNoon 人工账号；公开原文/图片；组织 Admin 具体批准；可使用的测试内容；域名/维护/费用责任人。已有本地身份/注册/恢复证据继续复用；本计划不要求重建远端环境，也不提前购买订阅。账号/上游未齐时推进可独立工作，用 fixture 验证软件并如实标注，最终正式验收保留外部门禁。

External dependencies include verified Nyx membership/connection contracts, eligible destination accounts, public originals/media, exact Admin approvals, authorized test content and named operations/cost ownership. Existing local evidence is retained. Fixtures can unblock software development but do not replace real external acceptance.

## 10. 来源索引 / Source index

- [需求 v0.7 固定 revision](https://gist.github.com/ctkm-aelf/eea0b7fc47d09d4c891adfbb1c4684af/79e69842f5bacba7f8204f62d151018bacf98d91)；本地 `docs/source/manifest.json`。
- [已确认 B 原型交付记录](../prototypes/nyx-cms-b/DELIVERY.md)、[页面总览](../prototypes/nyx-cms-b/review.html)。
- [CMS routes / app.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/app.ts)：双入口、me、所有业务路由、CSP。
- [content.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/content.ts)：visibleRevision、submission、translation、分页。
- [publishing.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/publishing.ts)：确认/幂等、补图前提、任务状态。
- [distribution.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/distribution.ts)：精确连接、批准即入队、人工跟进和核验。
- [auth.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/auth.ts)、[policy.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/policy.ts)、[nyxid.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/nyxid.ts)：session/CSRF、权限、配置绑定。
- [metrics.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/metrics.ts)、[tracker.js](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/web/tracker.js)：指标语义与 consent。
- [openapi.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/openapi.ts)、[store.ts](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/src/store.ts)：现有 schema 与持久化范围。
- [最新交付状态](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/docs/delivery-status.md)、[外部验收交接](https://github.com/aelf-hzz780/chronoai-cms/blob/ce4fb1a9bc3f5785aca141ea7e17f77bb0da006a/docs/continuation-external-handoff-20261103.md)：开发完成与正式签收边界。
- [NyxID 本轮上游差异](https://github.com/aelf-hzz780/NyxID/compare/ff302d5ecfe8d188cf0f167995e87bc08c722296...85e23be62cae48b334a961ae81c62aca0a65ecb2)：本轮仅远端核对，未替换现有本地补丁环境。
