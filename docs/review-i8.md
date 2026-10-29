# I8 OpenAPI实际响应契约（开发记录）

R022修复源码：`792a7bb024cfa5dee33dcdca72a27cf16d1997b8`；分支codex/003-blogsystem-delivery。关联D2及D4/D7，A06/A07/A08/A19/A39。独立专项报告为CLOSED_LOCAL_RETEST，原任务确认R022关闭；完整D1–D9/A01–A52及Live未整体通过。

## R022：按实际App声明成功响应

固定0649608的独立审查发现成功响应统一声明200/object，辅助report漏removed，preview漏可选revision。此次只修契约与交接文档，不修改App、Policy或Distribution业务权限。

createArticle、importMarkdownFile、uploadPrivateImage声明201；confirmOriginal、confirmDistribution声明202并明确接受确认不等于公开发布。8类列表／状态／审计声明200 JSON array，私有图片声明PNG/JPEG/GIF/WebP二进制，Markdown下载声明text/markdown二进制，其余操作保留200 JSON object。preview声明可选的有权历史revision。report补removed，说明只允许已确认remove动作，须对精确已知副本URL核验404/410。

api-guide.md补实际响应对照和使用语义；nyxid-registration.md补34个operation的scope交接表，包含真实AuthManager要求的content:read baseline。HTTP Bearer／apiKey不冒充OAuth scope声明，目标NyxID的真实导入兼容性／注册／调用仍为外部BLOCKED。

## 验证与边界

TDD先复现201缺失与removed枚举缺失，再通过实际Fastify App响应核对status、Content-Type、JSON顶层类型或原始字节。覆盖3类201、2类202、全部8类数组（含空数组）、四图片MIME、BOM/CRLF Markdown下载和历史preview；实际report路径验证create不能removed、已知URL仍200不能removed、精确已知URL404才settle removed。图片测试中的JPEG/GIF/WebP仅是handler可接受的最小签名，验证媒体／字节契约，不代表图片解码检查。

`npm run check`：strict TypeScript与80项测试全部通过，0失败／跳过；证据`.runtime/r022-check.log`，red／green记录分别为`.runtime/r022-red.log`和`.runtime/r022-green.log`。基于原独立probe重绑当前工作树并补status／media／type断言，固定792a7bb重跑通过34路由parity、唯一operationId、401及实际响应检查；证据`.runtime/r022-contract/contract-evidence.json`与同目录probe、schema、log。这些为开发自测，不能替代独立结论。

固定792a7bb的独立Local专项报告确认：34路由及稳定唯一operationId一致，36次实际响应匹配201／202／200与object／array／Markdown及四图片MIME；confirmed remove仅在精确已知URL404／410后removed，错误动作／copy／URL及200／503拒绝；有权历史revision可读、跨owner拒绝，34操作scope交接符合原权限。7个授权／运行时源文件与0649608逐字节一致。原任务另确认完整80项测试与strict独立通过。证据为原任务工作树`.runtime/acceptance-review/reviews/792a7bb/service-contract/service-contract-review.json`及同目录probe、schema、contract-results。该报告仅限内存App／Policy与媒体字节fixture；已知原文／副本状态为fixture，远端只读GET被拦截，不代表真实NyxID或provider Live。

原任务已确认R001–R022均完成各自有界修复，R021保持非门禁。正式D/A、目标NyxID导入／注册及外部Live继续未整体通过。独立review四Ghost已healthy，低内存限制生效，Node24＋Chromium155验收镜像已建；原任务继续实际应用、签名issuer、浏览器访客及恢复验收，结论另行记录。

原文published状态仅在内存fixture设置，没有Ghost／Worker写入；副本公开GET由测试模拟，没有DEV／Hashnode／Medium／HackerNoon真实外发。未重复无变化的四站／恢复验收。按独立验收资源窗口要求，dev8容器继续暂停，恢复克隆继续停止，卷／私有配置／证据保留，current-machine四容器维持运行。没有新具体缺陷时不重复自测或启动Ghost。运行证据不提交Git；未push。
