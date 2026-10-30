# I14 真实 NyxID 双入口集成（开发记录）

R029修复业务源码：`2d65bc0a8c191bc99ce6cf22cb995c7c004062aa`；关联D1/D2、A01/A06。2026-10-30固定SHA真实联调为`PASS_ACTUAL_LOCAL_NYXID`，7组检查通过；strict、86/86本地测试与最后相关10/10通过。**R029独立复验待返回，不自行关闭，不提升正式D1–D9／A01–A52签收。**

## 问题与修复

原任务在真实官方NyxID启动时发现，旧默认OIDC业务scope无法注册。独立新client实际请求返回400、error_code 1008：`Unknown OIDC scope 'content:read'`。原有测试Admin/client未修改；先red证据为`red.json`，不是用fixture模拟官方拒绝。

修复默认只申请`openid profile`并仅映射`content:read`。CMS与service分别通过`NYXID_CMS_CAPABILITY_SCOPES_JSON`和`NYXID_SERVICE_CAPABILITY_SCOPES_JSON`将平台capability映射到该入口实际scope，数组为AND关系，缺key即无能力。拒绝未知key、空scope、仅identity scope授予额外能力及新旧映射混用；保留旧全局配置迁移路径。注册与完整配置示例见[NyxID交接](nyxid-registration.md)。

本轮CMS写能力显式需要`proxy`，service写能力需要`account:read`与`proxy:*`，它们不替代owner、当前Member/Admin、指定Publisher及组织外部写入精确批准。CMS access token额外核对签名`client_id`，每请求重新验签、在线introspection并按当前配置重算capability；保存任务也按当前入口映射重验。service默认采用真实代理注入的双签名header，直接Bearer另需显式client白名单。两个入口首次认证共用issuer/sub的确定性个人workspace；`/me`的canPublish还需当前publish能力。

实测Colima时钟比宿主快约0.62秒，identity仅对未来iat增加最多5秒容差；过期仍拒绝、最长60秒identity lifetime约束保持。未延长expiry，未绕过签名、组织角色或审批。

## 固定SHA实际验证

使用官方NyxID **0.75.0**，源码`38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`，UI `http://localhost:3000`、API/issuer `http://localhost:3001`。Docker context为`colima-blogsystem`，project为`nyxid-blogsystem-local`。未修改官方源码。

本任务App为`http://localhost:3117`，service通过`http://host.docker.internal:3117`访问，独立DB/media。新建独立命名client、四个真实用户（个人、组织Admin、Member、Publisher）、组织与service `blog-r029-isolated`。原有测试Admin只用于官方API管理独立对象，不改变其账号配置；四个业务用户均实际完成浏览器OIDC code/PKCE与真实service代理请求。无identity／authority fixture。

| 检查组 | 固定SHA结果 |
| --- | --- |
| 四用户双入口 | CMS实际code/PKCE登录与代理签名identity/delegation均成功；同subject、同workspaces |
| 个人内容 | CMS建稿service读取、service建稿CMS读取；另一真实用户两个入口均403 |
| 组织权限，两个入口分别执行 | Member可建稿／提交但发布403；Admin授予Publisher后可202排队／200取消；撤销后旧会话再次确认403；Admin可排队／取消 |
| CMS实际只读授权 | 实际OIDC缩为openid profile，读取成功、canPublish=false，建稿403 INSUFFICIENT_SCOPE |
| service实际只读委托 | 独立service实际改为account:read后读取成功、canPublish=false、建稿403；已恢复full配置 |
| 实际离组 | 官方组织API移除成员，保留CMS session与新service代理访问组织内容均403；已恢复成员 |
| 实际停用 | 官方管理API停用独立个人用户，原CMS session从200变401；已重新启用用户 |

service非GET默认可能等待NyxID人工审批。本轮使用当前用户的官方审批API，仅批准当次独立本地服务动作，不设置duration或通配grant。组织向外部平台的精确内容／目标／动作批准仍保留。本地site使用不发出的invalid目标，只验证发布确认排队与取消；没有启动Worker、访问Ghost或外部provider，也没有真实发文／精确外部分发receipt证据。

两轮早期完整脚本因误期待官方成员删除／新增为200而停止；实际成功码分别204／201，已修正harness。它们不算产品缺陷或最终通过证据。最终脚本退出0并生成7组PASS。独立诊断的旧只读预期不用于结论。

## 可复核证据与交接

开发树Git忽略目录：`/Users/richardhuang/.codex/worktrees/6898/BlogSystem/.runtime/r029-nyxid/`。

- `red.json`：官方拒绝旧scope的实际400／1008。
- `typecheck.log`、`tests.log`：strict与86/86；`targeted-final.log`：最后相关10/10。
- `integration.mjs`、`integration-result.json`、`fixed-sha.log`：最终实际浏览器／官方API／代理脚本、固定业务SHA、7组检查和38次记录的业务HTTP响应。登录、缩scope及停用等另在脚本中断言；不以HTTP数组行数替代覆盖范围。
- `source-fingerprint.json`、`document-verification.json`：70个源码／测试／配置文件与业务commit逐字节一致，36个本地文档链接／anchor有效；两份来源checksum正确，正式验收第1节起9750字节保持原文，phase0／baseline／manifest未改。
- 私有运行入口为`private/app.env`，独立用户／client／service／org配置也在private目录；目录0700、文件0600。读取凭据时避免输出原文，正式交付仅使用脱敏注册导出。

曾有一次Playwright默认超时错误将独立测试会话头写入诊断输出；已撤销相关上游会话并注销对应CMS session，重新登录。原始日志置于private，后续错误只保留首行并限制诊断输出。该处置不改变业务修复范围。

App3117保留供原验收任务定点复验；诊断3118已停，NyxID service base已恢复3117。未操作四Ghost/dev/baseline/恢复卷，未push／merge。R029待原任务独立判定；2026-10-29的R001–R028关闭与51 Local PASS属于历史固定源码账目。目标部署运维责任、真实外部账号和具体内容／动作授权等仍BLOCKED，当前真实本地身份通过不代替正式D/A签收。
