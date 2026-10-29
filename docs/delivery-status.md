# 交付状态（开发台账，不是独立验收结论）

分支：`codex/003-blogsystem-delivery`；基点019222c，I1为5eb51a7，R001–R005修复为c6de8b5；I2提交见Git历史。当前修复源码为0649608（含R020 ed1239f），I3–I7记录见review-i3-p1.md、review-i3-p2.md、review-i4.md、review-i5.md、review-i6.md、review-i7.md；实际运行证据按各自固定源码与sourceFingerprint逐文件对应。

状态含义：implemented仅表示部分实现，不代表完整场景通过；local只说明合成或本地实机范围，不能代替live。**D1–D9独立验收仍全部未通过，A01–A52没有宣称完整参数矩阵通过。** 原任务独立复验与开发自测分开。

## 增量 I2

native NyxID契约、DEV/Hashnode策略与辅助投稿、指标/consent、发布译文投影、私有图片真实共享卷、加密备份恢复、API指南、CMS选择器和运维模板。44项本地测试通过，另有真实四Ghost八组合和新卷恢复证据，见review-i2.md。

## 增量 I3／I4

修复发送边界身份／原文漂移、已接受写入缺映射、恢复project类型别名、known-copy身份、paused只读恢复、分发日期与采集缺口。剩余四项增补Chromium渲染证明、迟到metadata写纠正、跨重启采集覆盖。原任务已逐项关闭R001–R017，其中R002／R011在910591d真实Chromium复验关闭；结论限对应分支和固定源码。

## 增量 I5

8828d6c支持纯图片正文及普通129段文章，文字分组截图保留逐字形证明；公开发布前新增1024文字节点／50000 Unicode code point容量边界，超出零Ghost访问并保留原稿。strict TypeScript与76项测试通过。当前源码四站八组合、四Ghost实际重启与48秒新卷加密恢复已完成，70文件指纹完全一致，见review-i5.md。原任务已独立关闭R018，并确认R002关键6分支、R011实际report7分支保持通过；R001–R018已登记缺陷均关闭。完整Local矩阵及最新恢复工件的逐项独立核对仍在继续，完整D/A与Live门禁继续保留。

## 增量 I6

独立新增R019发现核验滚动时页面JS能改写同一Text.data，旧像素证明误接受变化后的文字。8aa2a02在首次滚动前绑定原始正文身份、全程监测变更并最终复查；即使恢复原文也拒绝，校验器自己的临时DOM变更逐条精确豁免。R019已独立关闭，strict与77项测试独立通过。开发四站八组合补验通过，71文件指纹一致；首轮personal-zh未验证失败及正常reconcile恢复同一记录的证据保留，恢复后的数据库／页面／图片已独立核对，首次原因仍未知。8828d6c恢复工件已通过原任务逐项独立解密／checksum／9表全字段BLOB／16页与图片核对；历史结论不提升为当前源码或完整D/A通过。详见review-i6.md。

## 增量 I7

ed1239f修复BOM导致首块Markdown语法错误：仅规范渲染输入，原始存储／下载保持byte exact；strict与78项测试通过。0649608另提供R021非门禁导航放弃／取消保护，10项实际Chrome检查通过，保留BOM／CRLF源跟踪。R020等待独立复验；R021不新增验收门禁。详见review-i7.md。

## D1–D9

| 交付 | 开发状态 | 证据层级 | 主要未通过部分 |
|---|---|---|---|
| D1 | implemented | local局部+部署模板 | NyxID Live、public HTTPS部署、费用责任 |
| D2 | implemented | local API/签名/原文/指标 | 目标service注册和真实全操作Live |
| D3 | implemented | local权限矩阵局部 | 完整角色×owner×入口×时序；Live |
| D4 | implemented | local源文/冲突/素材/译文+CMS smoke | 完整编辑交互与权限矩阵 |
| D5 | implemented | local四Ghost实机 | 完整确认/元数据/故障组合与Live身份 |
| D6 | implemented | local native/供应商契约 | 真实连接、订阅、exact Admin及发文/投稿Live BLOCKED |
| D7 | implemented | local状态/恢复/人工跟进 | 真实副本生命周期与完整UI矩阵 |
| D8 | implemented | local真实collector+看板+API | 生产隐私/外部授权源Live与完整参数矩阵 |
| D9 | implemented | document+local四站隔离恢复 | 生产部署/监控/责任/RPO/RTO和独立验收 |

## A01–A52

以下均为implemented（局部），非验收通过。测试名中的A编号为需求映射，不是独立结论；若只提供设计/模板，明确说明未实测。

| 场景 | 开发状态 | 代码/证据 | 边界和剩余验证 |
|---|---|---|---|
| A01 | implemented | auth.test.ts / nyxid-registration.md | OIDC本地签名流程；目标NyxID双入口Live未验证 |
| A02 | implemented | auth.test.ts | 签名、state/nonce/audience/PKCE/hash本地回归 |
| A03 | implemented | auth.test.ts | 会话注销与重放本地回归 |
| A04 | implemented | infra/platform/nginx.conf.example | public Admin阻断模板；生产HTTP实测未执行 |
| A05 | implemented | operations.md | 部署/成本项已列；容量、付款责任、public安装BLOCKED |
| A06 | implemented | http.test.ts / operations.test.ts | 双入口本地API；NyxID service注册Live BLOCKED |
| A07 | implemented | http.test.ts / four-ghost.integration.ts | 双入口四站局部；NyxID真实委托Live BLOCKED |
| A08 | implemented | operations.test.ts / metrics.test.ts / four-ghost.integration.ts | 原文bytes和同口径查询局部 |
| A09 | implemented | auth.test.ts / content.test.ts | scope/伪造身份/委托边界局部 |
| A10 | implemented | content.test.ts / four-ghost.integration.ts | 个人与组织owner局部 |
| A11 | implemented | content.test.ts / four-ghost.integration.ts | 成员线上写拒绝局部 |
| A12 | implemented | content.test.ts | Admin/Publisher管理与撤权局部 |
| A13 | implemented | http.test.ts / content.test.ts / review-i1.test.ts | 私有revision/搜索隔离局部 |
| A14 | implemented | content.test.ts / distribution.test.ts | owner/连接/版本边界局部 |
| A15 | implemented | publishing.test.ts / distribution.test.ts | 出站前重验与fingerprint局部 |
| A16 | implemented | content.test.ts | 离组访问与个人保留局部 |
| A17 | implemented | operations.test.ts / four-ghost.integration.ts | UTF8 BOM/CRLF、原文bytes八组合局部 |
| A18 | implemented | content.test.ts / http.test.ts | 并发revision冲突局部 |
| A19 | implemented | http.test.ts / review-i1.test.ts / four-ghost.integration.ts | 净化、私有素材、cancel/uncertain不promote局部 |
| A20 | implemented | content.test.ts / four-ghost.integration.ts | 工作稿不改变线上正文局部 |
| A21 | implemented | content.test.ts / four-ghost.integration.ts | 译文独立发布、过期标记局部 |
| A22 | implemented | four-ghost.integration.ts | 公开译文互链与下线清链局部 |
| A23 | implemented | four-ghost.integration.ts | 真实四Ghost安装八组合local |
| A24 | implemented | four-ghost.integration.ts / review-i1.test.ts | 可见owner/作者/语言、正文、metadata/互链及重启后sitemap局部；完整矩阵待独立验收 |
| A25 | implemented | publishing.test.ts / review-i1.test.ts | 全文证明失败与known-write/GET失败回归 |
| A26 | implemented | operations.md / recovery.integration.ts | 源码独立架构与隔离恢复；8828d6c停API后公开页／图片保持可用；四Ghost实际重启通过 |
| A27 | implemented | nyxid.test.ts / distribution.test.ts | native exact连接无fallback契约；真实账号BLOCKED |
| A28 | implemented | nyxid.test.ts / distribution.test.ts | 精确批准契约；真实NyxID Admin Live BLOCKED |
| A29 | implemented | distribution.test.ts / nyxid.test.ts | payload/request digest与连接指纹局部 |
| A30 | implemented | targets.test.ts / distribution.test.ts | DEV契约local；真实发布更新BLOCKED |
| A31 | implemented | targets.test.ts | Hashnode canonical/body/author/Pro契约local；Live BLOCKED |
| A32 | implemented | distribution.test.ts / api-guide.md | 辅助package/report local；真实投稿审核BLOCKED |
| A33 | implemented | distribution.test.ts | 英文限定/原文freshness/摘要局部；无自动调度 |
| A34 | implemented | distribution.test.ts / targets.test.ts | rights与能力限制局部；订阅Live BLOCKED |
| A35 | implemented | distribution.test.ts / web/app.js | 逐目标state/history局部；完整UI矩阵待补 |
| A36 | implemented | publishing.test.ts / distribution.test.ts / review-i1.test.ts | uncertain只读恢复/lease fencing局部 |
| A37 | implemented | distribution.test.ts | 一目标失败与另一目标成功、原文下线后移除已知副本本地回归；完整矩阵待独立验收 |
| A38 | implemented | publishing.test.ts / distribution.test.ts | cancel与迟到批准防复活局部 |
| A39 | implemented | distribution.test.ts / targets.test.ts | 已知copy失账号/下线flag/人工移除局部 |
| A40 | implemented | targets.test.ts / distribution.test.ts | source/canonical/owner/body与重连提示local |
| A41 | implemented | metrics.test.ts / four-ghost.integration.ts | collector真实HTTP和双入口过滤局部 |
| A42 | implemented | metrics.test.ts / four-ghost.integration.ts | 来源/未归因/受限campaign局部 |
| A43 | implemented | metrics.test.ts / targets.test.ts | Unavailable/null与authorized counters契约local |
| A44 | implemented | metrics.test.ts | daily估算说明，无跨平台unique claim |
| A45 | implemented | metrics.test.ts / four-ghost.integration.ts | owner聚合/他人拒绝/预览排除局部 |
| A46 | implemented | tracker.test.ts / metrics.test.ts | consent/GPC/DNT/撤回/失效不阻塞局部 |
| A47 | implemented | auth.test.ts / http.test.ts / operations.md | 密钥不回显与私有资源局部；生产审计待验证 |
| A48 | implemented | content.test.ts / distribution.test.ts / operations.md | 写入/确认/批准/运维CLI审计；运维私有读取需工单流程 |
| A49 | implemented | recovery.test.ts / recovery.integration.ts | 加密四站全量隔离恢复local；非生产RPO/RTO |
| A50 | implemented | recovery.test.ts / recovery.integration.ts | 恢复出站暂停/旧session失效/unknown不重发local |
| A51 | implemented | operations.md / recovery.integration.ts | 8828d6c四Ghost重启与四站新卷恢复local；生产RPO/RTO BLOCKED |
| A52 | implemented | operations.md / nyxid-registration.md / review-i2.md | 文档交接已补；真实账号、部署、责任与订阅缺口保留 |

## 外部 BLOCKED

- B1：真实 NyxID issuer、应用／service 注册、授权与组织／委托／精确批准实际契约和测试角色；关联 D1/D2/D3/D6。
- B2：DEV 个人／组织、Hashnode 组织 Pro 和有权账号、NyxID exact connections；关联 D6。无真实账号写入。
- B3：Medium／HackerNoon 账号、人工提交负责人、明确获准内容和外部写入授权；关联 D6/D7。
- B4：生产 HTTPS 域名、部署容量、付款责任、隐私保留策略及 RPO/RTO；关联 D1/D8/D9。
- B5：目标 remote `git@github.com:aelf-hzz780/chronoai-cms.git` 2026-10-29只读重试仍Repository not found；不阻止本地开发和增量 commit。

以上保留未通过，不以 Mock／文档降级必需交付。不得把本地自测 verified 解释为原任务独立验收通过。
