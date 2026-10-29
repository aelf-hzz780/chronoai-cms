# I7 BOM渲染与编辑导航保护（开发记录）

必需修复R020：`ed1239fb96a60d513ab3cbbc70c295282aa7f327`；非门禁R021体验改进：`0649608b2bb475b1db5f18f52c3eb759132f06dc`。分支codex/003-blogsystem-delivery。R001–R019的已登记必需缺陷保持各自固定源码上的独立关闭，R020等待独立复验；完整D1–D9/A01–A52及Live未整体通过。

## R020：编码BOM只在渲染输入处理

独立CMS实际文件导入发现BOM＋CRLF原稿虽能byte exact保存与下载，首行Markdown标题却渲染为含U+FEFF的普通段落。共享render现在仅在传入markdown-it前移除开头一个U+FEFF；私有preview和Ghost controlledHtml均使用此函数。存储、revision digest和下载继续保留原始BOM／CRLF，内部U+FEFF不变。

TDD先复现首行h1缺失，再验证实际import→个人／组织×EN／ZH四组合、CMS／service两入口preview及download、Ghost controlledHtml与private preview相同。首块列表、引用、代码块、表格均正确；strict TypeScript＋78项测试通过，0失败／跳过，`.runtime/r020-check.log`。

公开路径另用实际GhostAdapter＋BrowserRenderProof／Chrome和自有随机loopback HTTP核验个人／组织×EN／ZH四组合，BOM首行正确h1、verify均true、源文不变；`.runtime/r020-public/results.json`。此为合成Admin／公开页fixture，未调用真实Ghost或外部账号，不提升为Live或四站整体结论。

## R021：非强制的未保存编辑保护

原任务明确acceptance_gate=false，不新增验收门禁。导航到另一文章、切换owner、新建文章及关联译文前，共享dirty guard提示明确放弃或取消；取消保留编辑区和preservedMarkdown，owner选择器回到原工作区。成功保存后直接回读新revision，不重复提示。干净BOM／CRLF稿用原始source比较，避免textarea换行规范化造成误提示。

实际Chrome＋实际Fastify／web脚本先复现丢失，再通过10项检查：文章／new／owner取消保留，三类明确放弃动作正常，干净稿无误提示，取消后只改标题再保存／浏览器下载仍BOM／CRLF byte exact，private preview正确h1，新草稿切语言保留正文。证据`.runtime/r021-editor/results.json`及同目录browser.mjs，node --check通过。此提交仅改web/app.js，未重复无变化的后端suite；78项测试对应ed1239f，浏览器验证对应0649608的同一UI源码。

## 环境与证据边界

R019已在8aa2a02独立关闭，同一首轮失败release正常恢复补证已独立核对；详见review-i6.md，首次失败原因仍未知。8828d6c恢复工件完成独立审计后，按原任务协调仅停止blogsystem-restore-77b017f2-personal／org的8个恢复容器，全部卷／证据保留；dev与current-machine继续healthy。独立验收另建四站与平台数据库，不修改本开发dev数据。

没有重复无变化的restart／restore，没有真实外发或修改官方Ghost源码。真实NyxID／provider、生产域名／运维与费用责任／隐私及RPO/RTO保留原外部依赖；remote仍保留此前Repository not found记录，未push。运行证据和私有配置不提交Git。
