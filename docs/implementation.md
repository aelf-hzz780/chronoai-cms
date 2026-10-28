# 实施设计与迭代

2026-10-28；正式范围继续以 v0.7 两份原文为准。本文件记录工程选择，不改变产品权限。

## 技术选择

- Node.js 24.18.x + TypeScript strict，Fastify 负责 HTTP、输入边界与统一 Trace ID。采用模块化单体与独立 Worker，共享应用用例，避免双入口复制业务判断。
- SQLite（Node 内置 `node:sqlite`）保存平台数据，使用 WAL、外键、事务、唯一约束和迁移版本。首个部署为单主机持久卷，API 与 Worker 同盘；不支持跨主机共享数据库或无限并发。相较 PostgreSQL，可减少本地和初期运维依赖；扩容前须压测并迁移数据库 Adapter。Ghost 继续各自使用官方支持的 MySQL。Node SQLite 当前实验性警告计入运维限制。
- 浏览器 CMS 使用原生表单与独立 JavaScript 模块，Markdown textarea 提供导入、导出与鉴权预览；不把编辑器状态当作源文。`markdown-it` 渲染并经 `sanitize-html` 净化，禁止原始 HTML、危险协议和远端图片抓取。
- `jose` 验证 OIDC／服务 JWT；生产没有本地登录或测试身份头。当前成员、委托、连接和精确批准经 NyxID Authority Adapter 查询；目标实例未确认的契约须标为候选并保持 Live blocked。
- Node test runner 进行业务与 HTTP 参数化测试；TypeScript 检查协议边界；正式外部 Adapter 用可控 HTTP 服务器验证契约与不确定结果。Mock 证据仅为 local。

## 边界与模式

控制层只处理协议、输入校验、会话／scope；应用服务编排用例；Policy 集中授权；Store 封装事务与查询；外部 Adapter 隔离供应商差异。显式状态机和事务 outbox 处理确认版本、每目标状态与进程中断。远端已发送而结果不明时转 uncertain，禁止盲目重发。

owner、credited author、actor 分开保存。组织 Admin 不自动获得未提交他人草稿读取／改写能力；提交与确认固定 revision，后续编辑不改变快照。实时身份与权限查询失败时拒绝受保护操作，错误保留 Trace ID，不回显授权材料。

## 交付顺序

1. 权限／源文／修订／投稿／双入口 API 与 CMS，先反例测试再实现。
2. OIDC／服务验证、四个原版 Ghost 站点、确认版本与图片、译文独立发布。
3. NyxID 精确连接与批准、DEV／Hashnode 自动 Adapter、辅助投稿、生命周期与恢复对账。
4. 指标采集和查询、隐私、隔离备份恢复、运维与独立验收修复。

不新增可选产品范围。每次增量更新交付台账，真实提交交原任务独立复验；开发 verified 不等于验收通过。

## 回滚与外部依赖

保留现有实验、数据卷及官方 Ghost 镜像；开发采用独立端口／project／凭证。应用回滚先暂停准入与出站，保留审计／远端映射，对 uncertain 记录只读对账，外部副本通过生命周期动作处理。数据库迁移与 Ghost 升级必须先备份并在隔离环境演练。

Live 仍需：真实 NyxID issuer、应用／服务注册和调用人契约、测试角色及组织、精确连接与批准；DEV 个人／组织账号、Hashnode 组织 Pro；具体测试内容与外部发文授权；Medium／HackerNoon 人工负责人；HTTPS 域名、付款责任及生产 RPO／RTO。缺失项不以文档或 Mock 宣称完成。
