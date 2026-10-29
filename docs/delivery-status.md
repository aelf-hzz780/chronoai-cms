# 交付状态（开发台账，不是独立验收结论）

分支：`codex/003-blogsystem-delivery`；基点019222c，I1为5eb51a7，R001–R005修复为c6de8b5；I2提交见Git历史。当前修复源码为804e7c4（R028；含R027 b1d30b2、R025 2b5f9e2、R024 74978bc、R023 586ff1a、R022 792a7bb、R021 0649608、R020 ed1239f），R026文档为557518d／fe3fd60；I3–I13记录见review-i3-p1.md、review-i3-p2.md、review-i4.md、review-i5.md、review-i6.md、review-i7.md、review-i8.md、review-i9.md、review-i10.md、review-i11.md、review-i12.md、review-i13.md；实际运行证据按各自固定源码与sourceFingerprint逐文件对应。

状态含义：implemented为开发状态；Document／Local／Live结论分别记录。**R001–R028已全部独立有界关闭（R021非门禁）；51场景Local PASS，A05 Local BLOCKED，可继续推进的Local工作为0。D1–D9正式签收仍为0，全部52场景的Live必需目标门禁未满足。** 不以fixture、文档或缺陷关闭替代真实目标验收。

最新独立综合账目：原任务`.runtime/acceptance-review/integration-review/case-ledger-current.json`（2026-10-29T11:09:28.646402+00:00，业务源码804e7c4）。Document为48 PASS／4 BLOCKED（A01/A05/A06/A52），Local为51 PASS／1 BLOCKED（A05缺具名目标部署／付款／运维输入），Live为52 BLOCKED，整体为BLOCKED_EXTERNAL_INPUTS_NOT_ACCEPTED。确定性Local分支无需仅因共享A01/A05/A06目标门禁未通过而逐项重复；A43/A44不额外强求Unavailable或未获授权的外部数字。逐项证据、最终差量及外部输入见[独立Local收尾](review-i13.md#独立-local-收尾2026-10-29)。

独立恢复证据继续有效：固定74978bc完整加密capture／新卷四Ghost恢复、全字段BLOB审计、丢响应只读对账、撤权queued零写入与新稿新图发布；A50另含6条非空delivery／payload／native approval的加密平台恢复与Local HTTP重验，详见review-local-recovery-749.md。短资源窗口已结束：原任务review App／Ghost／identity已停止，卷／keys／证据保留；dev8及baseline4已恢复并验证healthy。本任务无需操作环境；等待外部输入或新的具体缺陷，不再派生开发或重复测试，未push／merge。

## 增量 I2

native NyxID契约、DEV/Hashnode策略与辅助投稿、指标/consent、发布译文投影、私有图片真实共享卷、加密备份恢复、API指南、CMS选择器和运维模板。44项本地测试通过，另有真实四Ghost八组合和新卷恢复证据，见review-i2.md。

## 增量 I3／I4

修复发送边界身份／原文漂移、已接受写入缺映射、恢复project类型别名、known-copy身份、paused只读恢复、分发日期与采集缺口。剩余四项增补Chromium渲染证明、迟到metadata写纠正、跨重启采集覆盖。原任务已逐项关闭R001–R017，其中R002／R011在910591d真实Chromium复验关闭；结论限对应分支和固定源码。

## 增量 I5

8828d6c支持纯图片正文及普通129段文章，文字分组截图保留逐字形证明；公开发布前新增1024文字节点／50000 Unicode code point容量边界，超出零Ghost访问并保留原稿。strict TypeScript与76项测试通过。当前源码四站八组合、四Ghost实际重启与48秒新卷加密恢复已完成，70文件指纹完全一致，见review-i5.md。原任务已独立关闭R018，并确认R002关键6分支、R011实际report7分支保持通过；R001–R018已登记缺陷均关闭。完整Local矩阵及最新恢复工件的逐项独立核对仍在继续，完整D/A与Live门禁继续保留。

## 增量 I6

独立新增R019发现核验滚动时页面JS能改写同一Text.data，旧像素证明误接受变化后的文字。8aa2a02在首次滚动前绑定原始正文身份、全程监测变更并最终复查；即使恢复原文也拒绝，校验器自己的临时DOM变更逐条精确豁免。R019已独立关闭，strict与77项测试独立通过。开发四站八组合补验通过，71文件指纹一致；首轮personal-zh未验证失败及正常reconcile恢复同一记录的证据保留，恢复后的数据库／页面／图片已独立核对，首次原因仍未知。8828d6c恢复工件已通过原任务逐项独立解密／checksum／9表全字段BLOB／16页与图片核对；历史结论不提升为当前源码或完整D/A通过。详见review-i6.md。

## 增量 I7

ed1239f修复BOM导致首块Markdown语法错误：仅规范渲染输入，原始存储／下载保持byte exact；strict与78项测试通过。R020独立专项报告已CLOSED，10个记录分支通过。0649608另提供R021非门禁导航放弃／取消保护，开发10项实际Chrome检查与独立8分支复验通过，保留BOM／CRLF源跟踪；R021为CLOSED_LOCAL_RETEST，不新增验收门禁。完整Local端到端审查继续单独进行，详见review-i7.md。

## 增量 I8

792a7bb修复R022 OpenAPI实际响应契约：201／202状态、8类数组、图片与Markdown二进制媒体、preview可选历史revision及受既有移除守卫约束的removed枚举；补34个operation的scope交接说明。独立专项报告CLOSED_LOCAL_RETEST：34路由及operationId、36次实际响应、移除404／410及拒绝守卫、历史revision／owner与scope均符合；完整80项测试与strict独立通过，原任务确认R022关闭。R001–R022均完成各自有界修复，R021仍非门禁，不提升正式D/A或Live。目标NyxID注册／导入兼容性仍BLOCKED。dev按独立验收资源窗口继续暂停，卷保留；没有新具体缺陷时不重复自测或启动Ghost，详见review-i8.md。

## 增量 I9

586ff1a修复R023 CMS文件选择器重复选择：图片与Markdown读取File后清空input，reset/openArticle上下文切换再次清空；图片异步完成时校验原articleId，避免切换文章污染编辑器。临时真实Chromium＋Fastify fixture验证同PNG路径跨EN／ZH文章、校验失败后重试、同Markdown路径重复导入均通过；node syntax与strict＋80项本地测试通过。独立真实Chrome四分支（跨文章、401重试、BOM/CRLF二次导入下载、延迟上传切换）及7项trusted/input断言通过，R023已关闭；未操作3398／3399、Ghost或dev源站，详见review-i9.md。

## 增量 I10

74978bc修复R024 Ghost consent面板误挂到related-post card的footer导致Allow／Decline导航离开当前文章：面板固定挂到BODY，按钮阻止默认及冒泡，保留required consent、撤回、GPC/DNT和脱敏采集。tracker fixture与真实Chromium DOM fixture覆盖默认主题footer、无footer、Allow/Decline URL保持及一次采集；strict与81项测试通过。独立真实Ghost 6.73.0默认主题EN/ZH确认面板无ancestor anchor、URL保持，EN拒绝后PV仍3、ZH拒绝后PV仍1，R024已关闭；未操作3398／3399、review Ghost或dev源站，详见review-i10.md。

## 增量 I11

2b5f9e2修复R025，CMS每条分发记录可展开API历史，安全显示状态、时间及存在的诊断／Trace，保留当前状态、链接与选择器。实际App＋Chrome原probe先red后green并固定SHA通过，覆盖两目的地及HTML诊断文字渲染；未改后端或重复81项suite。557518d修复R026，更新README／验收首部及运行／运维导航，phase0保留历史。独立R025固定2b5f9e2与R026固定fe3fd60均PASS并关闭，41链接／anchors有效、正式矩阵第1节后9750字节及source／phase0／baseline未变；总体仍INCOMPLETE，不提升完整D/A或Live，详见review-i11.md。

## 增量 I12

b1d30b2修复R027，DeliveryWorker异常event／audit沿用原delivery确认Trace，actor仍worker；仅一行业务参数变化，权限／状态／fence不变。两项TDD及三个相关失败／只读对账回归共5/5和strict通过，Native HTTP fixture仅重跑D05/D15，确认精确连接禁用零出站、Trace可关联。R027独立7/7及strict通过，CLOSED_LOCAL_RETEST；未重跑全检／其余14分支／四Ghost，未操作资源窗口，详见review-i12.md。

## 增量 I13

804e7c4修复R028，CMS取消／对账后以刷新GET读回的同一记录状态反馈，手动刷新清除旧queued提示；列表、历史及选择器保持。真实App＋Chrome随机loopback fixture固定SHA 6/6通过，含原文／分发对账旧POST响应与新GET读回交错；同脚本加载修复前源码稳定复现queued旧提示。node syntax及diff check通过。独立固定804e7c4 UI专项4/4 PASS并关闭R028，history／Trace／三个选择器／原文链接保持。原始Local剩余差量亦已完成；未重复取消安全／全检／四Ghost或操作资源窗口，详见review-i13.md。

## D1–D9

| 交付 | 开发状态 | 证据层级 | 剩余正式门禁 |
|---|---|---|---|
| D1 | implemented | 独立Local＋部署模板；A05外部输入受阻 | 真实NyxID、具名目标HTTPS部署／容量／付款运维责任 |
| D2 | implemented | 独立Local API／签名／原文／指标闭合 | 目标service注册与真实双入口授权 |
| D3 | implemented | 独立Local角色／owner／入口／时序闭合 | 目标NyxID角色／委托／撤权契约及共享部署门禁 |
| D4 | implemented | 独立Local源文／素材／冲突／译文／CMS闭合 | 共享目标身份与部署门禁 |
| D5 | implemented | 独立Local四Ghost／更新／取消／核验闭合 | 目标身份与部署门禁 |
| D6 | implemented | 独立Local Native契约与14功能差量闭合 | 真实连接／账号／订阅／精确批准及内容动作写入授权 |
| D7 | implemented | 独立Local生命周期／恢复／UI闭合，R025/R028已关闭 | 真实平台副本生命周期与人工流程 |
| D8 | implemented | 独立Local collector／看板／API／consent闭合 | 目标隐私／部署／真实授权数据源；无权计数不强求数值 |
| D9 | implemented | Document＋独立Local四站及非空delivery隔离恢复 | 具名运维／监控／隐私备份策略、目标RPO/RTO与正式交接 |

## A01–A52

以下开发状态均为implemented；Document／Local列直接同步独立综合账目，所有正式场景仍受共享A01/A05/A06目标门禁及适用的外部输入约束。代码／证据列为索引，不以测试名推断结论。表中既有有界证据与最终差量按固定源码组合，详细来源及Live要求以综合账目为准。

| 场景 | 开发状态 | Document | Local | 代码/证据索引 | 有界证据与外部边界 |
|---|---|---|---|---|---|
| A01 | implemented | BLOCKED | PASS | auth.test.ts / nyxid-registration.md | OIDC本地签名流程；目标NyxID双入口Live未验证 |
| A02 | implemented | PASS | PASS | auth.test.ts | 签名、state/nonce/audience/PKCE/hash本地回归 |
| A03 | implemented | PASS | PASS | auth.test.ts | 会话注销与重放本地回归 |
| A04 | implemented | PASS | PASS | infra/platform/nginx.conf.example | 四角色CMS/service凭证×四Ghost 32拒绝＋4正控通过；目标部署访问配置待确认 |
| A05 | implemented | BLOCKED | BLOCKED | operations.md | BLOCKED：缺具名目标域名／资源、付款／运维责任；无待实现代码项 |
| A06 | implemented | BLOCKED | PASS | http.test.ts / operations.test.ts | 双入口本地API；NyxID service注册Live BLOCKED |
| A07 | implemented | PASS | PASS | http.test.ts / four-ghost.integration.ts | 双入口四站及service个人／CMS组织新正文更新通过，URL／remoteID保持；真实NyxID委托待验证 |
| A08 | implemented | PASS | PASS | operations.test.ts / metrics.test.ts / four-ghost.integration.ts | 原文bytes和同口径查询局部 |
| A09 | implemented | PASS | PASS | auth.test.ts / content.test.ts | scope/伪造身份/委托边界局部 |
| A10 | implemented | PASS | PASS | content.test.ts / four-ghost.integration.ts | 个人与组织owner局部 |
| A11 | implemented | PASS | PASS | content.test.ts / four-ghost.integration.ts | 成员线上写拒绝局部 |
| A12 | implemented | PASS | PASS | content.test.ts | Local角色矩阵及实际Admin revoke/grant审计通过；目标身份门禁保留 |
| A13 | implemented | PASS | PASS | http.test.ts / content.test.ts / review-i1.test.ts | 私有revision/搜索隔离局部 |
| A14 | implemented | PASS | PASS | content.test.ts / distribution.test.ts | owner/连接/版本边界局部 |
| A15 | implemented | PASS | PASS | publishing.test.ts / distribution.test.ts | 出站前重验与fingerprint局部 |
| A16 | implemented | PASS | PASS | content.test.ts | 离组访问与个人保留局部 |
| A17 | implemented | PASS | PASS | operations.test.ts / four-ghost.integration.ts | UTF8 BOM/CRLF、原文bytes八组合局部 |
| A18 | implemented | PASS | PASS | content.test.ts / http.test.ts | 并发revision冲突局部 |
| A19 | implemented | PASS | PASS | http.test.ts / review-i1.test.ts / four-ghost.integration.ts | 两入口新PNG取消后不认领、新图404／私读正确、旧公开图hash保持 |
| A20 | implemented | PASS | PASS | content.test.ts / four-ghost.integration.ts | 工作稿不改变线上正文局部 |
| A21 | implemented | PASS | PASS | content.test.ts / four-ghost.integration.ts | 译文独立发布、过期标记局部 |
| A22 | implemented | PASS | PASS | four-ghost.integration.ts | 公开译文互链与下线清链局部 |
| A23 | implemented | PASS | PASS | four-ghost.integration.ts | 真实四Ghost安装八组合local |
| A24 | implemented | PASS | PASS | four-ghost.integration.ts / review-i1.test.ts | Local可见owner／作者／语言、正文、metadata／互链及重启sitemap闭合；共享目标门禁保留 |
| A25 | implemented | PASS | PASS | publishing.test.ts / review-i1.test.ts | 全文证明失败与known-write/GET失败回归 |
| A26 | implemented | PASS | PASS | operations.md / recovery.integration.ts | 源码独立架构与隔离恢复；8828d6c停API后公开页／图片保持可用；四Ghost实际重启通过 |
| A27 | implemented | PASS | PASS | nyxid.test.ts / distribution.test.ts | native exact连接无fallback契约；真实账号BLOCKED |
| A28 | implemented | PASS | PASS | nyxid.test.ts / distribution.test.ts | 精确批准契约；真实NyxID Admin Live BLOCKED |
| A29 | implemented | PASS | PASS | distribution.test.ts / nyxid.test.ts | payload/request digest与连接指纹局部 |
| A30 | implemented | PASS | PASS | targets.test.ts / distribution.test.ts | DEV契约local；真实发布更新BLOCKED |
| A31 | implemented | PASS | PASS | targets.test.ts | Hashnode canonical/body/author/Pro契约local；Live BLOCKED |
| A32 | implemented | PASS | PASS | distribution.test.ts / api-guide.md | 辅助package/report local；真实投稿审核BLOCKED |
| A33 | implemented | PASS | PASS | distribution.test.ts | 英文限定/原文freshness/摘要局部；无自动调度 |
| A34 | implemented | PASS | PASS | distribution.test.ts / targets.test.ts | rights与能力限制局部；订阅Live BLOCKED |
| A35 | implemented | PASS | PASS | distribution.test.ts / web/app.js | 状态／历史／Trace／选择器闭合，R025/R028已关闭；真实副本生命周期待目标输入 |
| A36 | implemented | PASS | PASS | publishing.test.ts / distribution.test.ts / review-i1.test.ts | uncertain只读恢复/lease fencing局部 |
| A37 | implemented | PASS | PASS | distribution.test.ts | Local一目标失败／另一目标成功及下线后已知副本移除闭合；真实平台待输入 |
| A38 | implemented | PASS | PASS | publishing.test.ts / distribution.test.ts | Local取消／迟到批准防复活及两入口取消审计闭合；真实平台待输入 |
| A39 | implemented | PASS | PASS | distribution.test.ts / targets.test.ts | 已知copy失账号/下线flag/人工移除局部 |
| A40 | implemented | PASS | PASS | targets.test.ts / distribution.test.ts | source/canonical/owner/body与重连提示local |
| A41 | implemented | PASS | PASS | metrics.test.ts / four-ghost.integration.ts | collector真实HTTP和双入口过滤局部 |
| A42 | implemented | PASS | PASS | metrics.test.ts / four-ghost.integration.ts | 来源/未归因/受限campaign局部 |
| A43 | implemented | PASS | PASS | metrics.test.ts / targets.test.ts | Unavailable／null与有权counter契约通过；不强求无权或不可用外部数字 |
| A44 | implemented | PASS | PASS | metrics.test.ts | daily估算、无跨平台unique claim通过；无额外无条件数字Live门禁 |
| A45 | implemented | PASS | PASS | metrics.test.ts / four-ghost.integration.ts | owner聚合/他人拒绝/预览排除局部 |
| A46 | implemented | PASS | PASS | tracker.test.ts / metrics.test.ts | consent/GPC/DNT/撤回/失效不阻塞局部 |
| A47 | implemented | PASS | PASS | auth.test.ts / http.test.ts / operations.md | 密钥不回显与私有资源局部；生产审计待验证 |
| A48 | implemented | PASS | PASS | content.test.ts / distribution.test.ts / operations.md | 写入／确认／批准／CLI／角色变更／取消审计闭合，L4及R027通过；运维具名责任待输入 |
| A49 | implemented | PASS | PASS | recovery.test.ts / recovery.integration.ts / review-local-recovery-749.md | Local四站加密恢复及非空delivery恢复闭合；生产备份策略／RPO/RTO待输入 |
| A50 | implemented | PASS | PASS | recovery.test.ts / recovery.integration.ts / review-local-recovery-749.md | 独立749四站恢复及6条非空delivery平台恢复、暂停期2GET/0新写、撤权/过期/漂移queued零新写通过；Local HTTP fixture，真实NyxID/provider仍BLOCKED |
| A51 | implemented | PASS | PASS | operations.md / recovery.integration.ts / review-local-recovery-749.md | 独立749源站停止时恢复20项公开读回通过；r1失败现场保留，r2成功CLI45秒非生产RPO/RTO |
| A52 | implemented | BLOCKED | PASS | operations.md / nyxid-registration.md / review-i2.md | 文档交接已补；真实账号、部署、责任与订阅缺口保留 |

## 外部 BLOCKED

- B1：真实 NyxID issuer、应用／service 注册、授权与组织／委托／精确批准实际契约和测试角色；关联 D1/D2/D3/D6。
- B2：DEV 个人／组织、Hashnode 组织 Pro 和有权账号、NyxID exact connections；关联 D6。无真实账号写入。
- B3：Medium／HackerNoon 账号、人工提交负责人、明确获准内容和外部写入授权；关联 D6/D7。
- B4：生产 HTTPS 域名、部署容量、付款责任、隐私保留策略及 RPO/RTO；关联 D1/D8/D9。
- B5：目标 remote `git@github.com:aelf-hzz780/chronoai-cms.git` 2026-10-29 10:59Z原任务只读重试仍Repository not found；不阻止本地开发和增量 commit。

以上外部输入继续BLOCKED；当前可独立推进Local工作为0。Local PASS限独立账目声明的证据与源码边界，不以Mock／文档降级必需真实目标交付，不将其提升为Live或正式D/A签收。
