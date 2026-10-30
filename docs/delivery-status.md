# 交付状态（开发台账，不是独立验收结论）

分支：`codex/003-blogsystem-delivery`。当前业务源码为 `041865217bb876b4d885a88a1e1344cb11af4345`（R034 MCP文件交付，保留4a27487的R033恢复与abfb988的R031临时保护；R030为76595bc，含R029 `2d65bc0`）；此前 R028 为804e7c4，R027为b1d30b2，R026文档为557518d／fe3fd60。I1–I13及其历史修复沿Git记录和各review文档追踪；真实NyxID及保存授权修复见 [I14](review-i14.md)、[I15](review-i15.md)。实际证据按固定业务源码与逐文件指纹对应。

状态含义：implemented为开发状态；Document／Local／Live分别记录。历史上R001–R030在各自固定SHA有界关闭（29项必需缺陷及R021非门禁），R029／R030固定业务源码为76595bc；51 PASS／A05 BLOCKED仅是R031发现前的历史Local modeled统计，不能作为abfb988的当前结论。历史报告及边界见 [I15](review-i15.md#独立有界闭合2026-10-30)。

**当前以[最新root独立台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)为准。** 临时安全阻断的有界PASS不自动改写完整能力台账。R033已在4a27487／3ded07e、R034已在0418652／98bac5b独立有界关闭。实际NyxID＋四Ghost初始发布、非空指标及个人生命周期的新证据与组织verifying待恢复边界见 [I20](review-i20.md)；实际门户／CMS入口、多组织／受限代理及必要恢复等差量继续独立追踪。不以重新确认或重发替代对账，不外推旧R004覆盖。

**R031/P1 OPEN（A09/A15、D2/D3/D5/D9）**：官方普通delegation缺少原key在线来源。abfb988临时fail-closed保护已获root Local专项及独立App3447真实官方NyxID重放的有界PASS，见[实际报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/actual-nyxid/review.json)；完整key/child命令来源契约仍BLOCKED上游。R032/P2文档修正已在11b6011独立有界关闭，见[报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/R032-documentation-retest.json)。**R033/P1（A36/A49/A50、D7/D9）已独立有界关闭**，见 [I18](review-i18.md)。**R034/P1（A08/A17、D2/D4）已独立有界关闭**，见 [I19](review-i19.md)。R029／R030不重开，R031不降N/A，边界见 [I17](review-i17.md)；研究见 [I16](review-i16.md)。

历史独立综合账目：原任务`.runtime/acceptance-review/integration-review/case-ledger-current.json`（2026-10-29T11:09:28.646402+00:00，业务源码804e7c4）。当时Document为48 PASS／4 BLOCKED（A01/A05/A06/A52）、Local为51 PASS／1 BLOCKED（A05缺具名目标部署／付款／运维输入）、Live为52 BLOCKED，整体BLOCKED_EXTERNAL_INPUTS_NOT_ACCEPTED。该账目及“可推进Local工作为0”属于当时结论，不包含后续R029／R030闭合及真实NyxID复验；下方矩阵保留该独立结论，新增开发证据另行标注。A43/A44不强求Unavailable或未经授权的外部数字。历史来源见[独立Local收尾](review-i13.md#独立-local-收尾2026-10-29)。

独立恢复证据继续按固定74978bc及各历史工件的边界保留，详见review-local-recovery-749.md。环境按轮次区分：I14／I15（2d65bc0／76595bc）的开发联调使用独立App3117及其DB/media和测试用户/client/org/service；I17（abfb988）的开发验证另建App3437，I18将其安全重启至4a27487，I19重启至0418652做MCP文件验证后停止，root独立重放另用App3447。这些轮次不是同一环境或同一证据集，端口仅作本地证据标识，不保证持续运行。I17／I18 Worker只在私有一致SQLite副本配安全adapter运行，I19未启动Worker，均无真实Ghost/provider写入。历史R032仅修文档；I18／I19只操作自己的3437对象，未操作root3447／3417、旧3117、Ghost/dev/baseline或其恢复卷，未改角色／Publisher或官方NyxID源码，未push／merge。

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

## 增量 I14

`2d65bc0`修复R029（D1/D2、A01/A06）：官方NyxID 0.75.0拒绝旧默认业务scope，现默认OIDC为openid profile，只授予读取；CMS与service分别使用显式capability AND映射，额外权限不由identity scope自动获得。CMS签名client_id绑定、每请求introspection及当前映射重算、service双签名传播／直接Bearer client白名单、当前组织角色／Publisher继续共同约束。strict、86/86本地测试及最终相关10/10通过。固定SHA真实四用户完成两入口同身份／workspace、个人互通与隔离、组织角色grant/revoke、只读scope、实际离组及停用检查，共7组通过。service非GET由当前用户通过官方审批API逐次批准独立本地动作，无通配grant；排队／取消不代表Ghost发布或外部分发。R029最终随76595bc独立有界关闭，详见 [I14](review-i14.md) 及 [注册配置](nyxid-registration.md)。

## 增量 I15

`76595bc`修复R030（A09/A15、D2/D3/D5/D9）：新认证与保存Actor重验共用CallerAuthorization，完整核对当前入口、entry/global/raw能力及CMS/direct service client／audience或propagated service来源绑定。mapping整项移除也重算；CMS session所有模式均重验签名client；direct service所有模式均需显式client白名单。加密队列缺来源绑定则blocked并要求重新确认，短identity assertion过期不误杀仍有效delegation的延时任务。TDD在旧源码28/40分支失败，修复后40/40通过（含父测试为41），覆盖两个Worker；strict及完整127/127、原独立6场景重跑6/6通过。真实NyxID增补及独立结论见 [I15](review-i15.md)，R029／R030已独立有界关闭：strict＋127/127、原6＋新增27条Local分支及真实NyxID 10组／39条HTTP通过；两入口queued撤Publisher后实际ReleaseWorker blocked／FORBIDDEN／0adapter调用。本轮仍无真实Ghost/provider写入；后续原生差量验收继续。

## 增量 I16

R031已在真实API key撤服务范围及删除两条路径复现；Worker安全adapter避免了实际发文。官方service delegation没有原key／child来源，普通introspection只见仍active派生token；已有raw-key service-wide introspection不支持逐请求审批场景，read request-proof不能授权queued写。最小上游契约、有限可执行范围与两个Worker后续验收见 [I16](review-i16.md)。I16研究时业务源码仍76595bc，未修改官方Nyx或环境；后续ready后的临时保护及网络实测另见I17。

## 增量 I17

`abfb988`实现R031临时来源保护：统一Policy.publish要求代理queued-write具有已验签、非空且官方在线有效的lineage，历史实现覆盖两个Worker、metadata投影及复核原来源；普通读取／草稿／取消保留现有权限。strict与141/141、授权专项55/55通过。开发App3437完成实际OAuth service queued正控及撤consent后缩scope／独立删除consent的两个Worker阻断，各0adapter／0写入；真实无lineage key正常／撤范围／删除旧快照均阻断。release来自实际API，delivery连接／provider为fixture，Worker只在私有DB副本运行，无Ghost/provider出站；该轮源7条任务已取消，13个DB暂停外发。root另在App3447完成5组／10Worker有界PASS。完整key/child能力仍OPEN/BLOCKED；复核原来源造成的恢复回归已独立确认为R033，当前修复见I18。历史限制、失败尝试、回滚及证据见 [I17](review-i17.md)。

## 增量 R032 文档修正

按[独立文档报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/abfb988/documentation-review.json)修正README及本页的统计和环境表述，并同步验收首部与I17的证据边界：旧51 PASS与App3117均标注历史轮次。11b6011提交时引用的是2026-10-30T05:41:21.997443+00:00的49 PASS／1 BLOCKED／2 FAIL快照，现改由最新root台账提供当前状态。R032已独立有界关闭；正式验收第1节起矩阵及source／phase0／baseline保持原文，不关闭R031或提升D/A签收。

## 增量 I18

`4a27487`修复独立R033/P1：uncertain复核和恢复Worker仅以当前合法caller执行access授权，原Actor作为审计证据保留，不再将其queued-write有效性作为读取前提；恢复中beforeWrite继续拒绝新写。strict、相关77/77及全量146/146通过。App3437真实官方OAuth撤consent后，fresh CMS owner使两个Worker各1读取／0新写完成恢复；R031六组／12Worker正反控通过。临时key已删、源queued=0、15个源／副本DB均暂停；无Ghost/provider网络写入，连接与远端结果为fixture。root在4a27487／3ded07e以Local21行为分支、114相关测试、strict及实际官方NyxID两Worker各1读取／0新写独立有界关闭R033；R031实际五组／10Worker保护继续通过。不提升完整能力，证据与局限见 [I18](review-i18.md)。

## 增量 I19

`0418652`修复R034/P1：真实NyxID MCP对非图片响应做text解码会丢Markdown BOM，现用明确base64 JSON文件封装；`downloadMarkdown`迁至`/markdown-file`，需重新导入34操作，直接HTTP／CMS原`/markdown`保留。strict、相关19/19及全量155/155通过。App3437实际官方OAuth＋精确服务consent＋MCP协议2025-03-26完成中英×BOM有无×LF／CRLF八组，32个实际解码落盘.md逐字节及SHA一致；后续修订、旧revision、stale409及真实跨owner403通过，24次本地精确动作逐次官方批准。App验证后停止，source queued=0、paused=true，无Worker／Ghost／provider出站。root在0418652／98bac5b以155既有测试、独立23组／249 HTTP及真实MCP七个.md保存／读回、旧稿／修订／stale409／跨用户403独立有界关闭R034；完整D/A不提升，见 [I19](review-i19.md)。A01/D1普通用户门户Launch入口另有[上游缺口](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/4a27487/portal-contract-review.json)。

## 增量 I20

固定业务源码0418652的实际官方NyxID＋四原版Ghost八组初始发布通过，独立environment核对原版镜像、源码／卷／owner与原文／素材绑定；真实浏览生成非空指标，12组CMS／service查询一致。CMS个人更新、双向hreflang、stale及下线有界通过，组织英文更新有界通过；后续 r3/r4 另通过现有组织译文 stale→unpublish 生命周期、普通成员个人 CMS/service × EN/ZH（首个 CMS-EN 为历史实际发布只读补核，另三篇新增）、两个未发送新图取消分支、同组织 Admin/member 精确角色私有资源拒绝，以及默认浏览器认证与退出后的旧 cookie 失效。组织中文首次INTERNAL原因未定；正式生产RPO/RTO、外部分发恢复、实际外部平台和普通 Nyx 门户 Launch 仍待验；已发送或外部分发取消、显式垃圾回收不属于本轮新增证据范围。root本地源／恢复App与四站九容器已停止、外发暂停、卷与现场保留；dev八容器原ID／image／volume恢复及九端点200仅是资源窗口收尾，不是备份／数据恢复验收。中英报告、逐项证据与界限见 [I20](review-i20.md) 与 [I21](review-i21.md)。

Git交付：root已验证 `f528dc0` 正常push至功能分支 `origin/codex/003-blogsystem-delivery`，main仍仅原始baseline `019222c`，未force／merge；本批次后续文档提交待 review/push，PR API仍403，尚未创建PR。R031完整能力和A01普通门户入口仍上游BLOCKED，Native整体及正式D/A未签收，动态状态沿用root台账。

## D1–D9

| 交付 | 开发状态 | 证据层级 | 剩余正式门禁 |
|---|---|---|---|
| D1 | implemented | 历史独立Local＋部署模板；76595bc真实NyxID双入口独立有界通过 | 实际门户／CMS入口验收、目标HTTPS部署／容量／付款运维责任 |
| D2 | implemented | 历史独立Local API；76595bc真实service代理与CMS授权独立有界通过 | 实际OpenAPI注册、多组织／受限代理及目标service正式交接与全部用例验收 |
| D3 | implemented | 独立Local角色／owner／入口／时序闭合 | 目标NyxID角色／委托／撤权契约及共享部署门禁 |
| D4 | implemented | 独立Local源文／素材／冲突／译文／CMS闭合 | 共享目标身份与部署门禁 |
| D5 | implemented | 独立Local四Ghost／更新／取消／核验闭合 | 目标身份与部署门禁 |
| D6 | implemented | 独立Local Native契约与14功能差量闭合 | 真实连接／账号／订阅／精确批准及内容动作写入授权 |
| D7 | implemented | 独立Local生命周期／恢复／UI闭合，R025/R028已关闭 | 真实平台副本生命周期与人工流程 |
| D8 | implemented | 独立Local collector／看板／API／consent闭合 | 目标隐私／部署／真实授权数据源；无权计数不强求数值 |
| D9 | implemented | Document＋独立Local四站及非空delivery隔离恢复 | 具名运维／监控／隐私备份策略、目标RPO/RTO与正式交接 |

## A01–A52

下表保留以804e7c4历史综合账目为基础、叠加截至76595bc有界补充的证据索引；Document／Local列未回填R031之后的当前状态，不能读作abfb988、4a27487或0418652验收结果，R031／R033／R034相关场景当前以本页首部链接的root台账为准。开发implemented不代表签收；所有正式场景仍受共享A01/A05/A06目标门禁及适用外部输入约束，不以测试名推断结论。详细来源与最新状态以root独立台账为准。

| 场景 | 开发状态 | Document | Local | 代码/证据索引 | 有界证据与外部边界 |
|---|---|---|---|---|---|
| A01 | implemented | BLOCKED | PASS | auth.test.ts / nyxid-registration.md / review-i14.md | modeled结论保留；76595bc真实NyxID双入口独立通过，R029／R030有界关闭，门户差量继续 |
| A02 | implemented | PASS | PASS | auth.test.ts | 签名、state/nonce/audience/PKCE/hash本地回归 |
| A03 | implemented | PASS | PASS | auth.test.ts | 会话注销与重放本地回归 |
| A04 | implemented | PASS | PASS | infra/platform/nginx.conf.example | 四角色CMS/service凭证×四Ghost 32拒绝＋4正控通过；目标部署访问配置待确认 |
| A05 | implemented | BLOCKED | BLOCKED | operations.md | BLOCKED：缺具名目标域名／资源、付款／运维责任；无待实现代码项 |
| A06 | implemented | BLOCKED | PASS | http.test.ts / operations.test.ts / review-i14.md | modeled结论保留；实际签名代理独立通过，OpenAPI注册／受限代理及正式交接待验 |
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

- B1：本地真实NyxID双入口、角色／委托与queued撤权已独立通过，R029／R030有界关闭；实际门户／CMS入口、OpenAPI注册、多组织／受限代理及目标注册交接、组织向外部平台精确批准／receipt仍需相应证据，关联D1/D2/D3/D6。
- B2：DEV 个人／组织、Hashnode 组织 Pro 和有权账号、NyxID exact connections；关联 D6。无真实账号写入。
- B3：Medium／HackerNoon 账号、人工提交负责人、明确获准内容和外部写入授权；关联 D6/D7。
- B4：生产 HTTPS 域名、部署容量、付款责任、隐私保留策略及 RPO/RTO；关联 D1/D8/D9。
- B5：历史Repository not found／SSH写权限阻塞已解除；root已验证`f528dc0`正常push功能分支`origin/codex/003-blogsystem-delivery`。本批次新增文档commit待review/push；当前仅PR创建API返回403 `Resource not accessible by integration`，尚未创建PR，未merge，见 [I20](review-i20.md) 与 [I21](review-i21.md)。

外部账号／内容动作授权／目标部署与责任等输入继续BLOCKED；R029／R030已独立有界关闭，原任务继续上述实际原生验收差量。Local PASS限独立账目声明的证据与源码边界，不以Mock／文档降级必需真实目标交付，不将本地开发通过提升为Live或正式D/A签收。
