# I16 R031 API key 来源撤权契约研究

本页为保护前研究快照。后续`abfb988`已实现临时fail-closed并完成真实OAuth service正反控开发验证，当前状态、保守影响及完整能力仍OPEN的边界见 [I17](review-i17.md)。下文“尚无保护／等待ready”描述I16当时状态，不能作为当前部署结论。

R031/P1，关联A09/A15、D2/D3/D5/D9；业务源码仍为`76595bcc5883f826aaf49acb3e3575531e41cb26`。**R031为OPEN，本记录是源码／既有实证分析，不是修复通过或新增网络验证；R029／R030保留各自有界CLOSED。**

## 实证与执行边界

原任务在另一个隔离App3427、service `blog-root-matrix-765`、真实多组织Publisher及限定精确UserService的API key下，逐条通过官方批准建立queued：移除key的服务列表后新proxy拒绝403，删除另一个key后新proxy拒绝401，但保存delegation的实际ReleaseWorker仍到达安全adapter，并通过beforeWrite。两个分支adapterCalls=1、authorizedWrites=1；安全adapter随后抛错，未做真实Ghost/provider写入。证据为[独立R031报告](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/reviews/76595bc/native-matrix/R031.json)及同目录`key-revocation-review.json`、`key-worker-review.json`、`deletion-revocation-review.json`、`deletion-worker-review.json`。

`delegation-lineage-review.json`与`delegation-safe-claims.json`分析已认证队列中的credential：签名claims有service-origin、act、user sub及服务／节点allowlist快照，没有原key、child credential或在线来源授权引用；删key后官方introspection仍active。decode只用于分析字段，不授予权限。两条Trace为`e9643381-fa0b-499e-95e1-a6b772d3a6a5`及`761f6708-c354-4bd7-aa4c-df800810e598`。

原任务已通过实际API取消源5条release，sourcequeued=0、临时Publisher=0，原key列表与成员恢复，删除控制key保持删除。本任务没有访问这些对象。root通知Nyx backend短暂重启／security_readiness配置窗口，本轮只离线阅读源码和已有脱敏证据，未发起Nyx网络请求；实际复现须等root明确ready并另建对象／DB／端口。未改Nyx源码、运行配置或任何栈。

## 官方0.75.0源码结论

官方仓库`/Users/richardhuang/workspace/ChronoAI/NyxID`固定`38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`，检查时工作区干净。

| 源码入口 | 已确认行为 | 对R031的含义 |
| --- | --- | --- |
| `backend/src/handlers/proxy.rs:5019`、`services/identity_service.rs:18` | 已准入proxy生成service delegation，复制TokenRestrictionClaims | 原请求批准过，不等于保存token能查询原key当前状态 |
| `backend/src/crypto/jwt.rs:439`、`:460`、`:1109` | restrictions包含资源、服务／节点快照及OAuth lineage；普通API key来源未保留，service token无原key引用 | 博客不能从该token可信恢复具体原key或child incarnation |
| `backend/src/services/identity_service.rs:78` | identity assertion绑定user与service，不含原key来源 | 保存短assertion或延长其有效期也不能补齐来源 |
| `backend/src/services/oauth_token_authority_service.rs:373` | service-origin且无client时，仅在存在OAuth lineage时重验该lineage，随后返回active user | 无key lineage时，普通JWT introspection无法发现删key／缩服务范围 |
| `backend/src/services/proxy_service.rs:477`、`:503` | 可按服务配置转发原Bearer；不从x-api-key或scheduled credential合成 | 可为原key在线校验提供输入，但现有博客没有接入该来源链，不能信任自报key ID |
| `backend/src/handlers/oauth.rs:3199`、`services/agent_key_introspection.rs:40` | 原key配service_id及受信confidential client，可在线核验key／child、owner、当前精确连接范围 | 这是已支持的服务级契约，但适用条件不能省略 |
| `backend/src/services/agent_key_introspection.rs:93`、`:144`、`:185` | 拒绝operation／owner／group限制；要求service-wide全部verb可授权，逐请求审批或操作策略会拒绝 | 不能通过关闭审批或改AutoAllow，把R031已逐次审批的key队列冒充该模式 |
| `backend/src/services/resource_request_proof.rs:88`、`:239`、`:304`及`descriptor.rs:44` | 已准入读取可带签名key／child／connection来源并在线require_current；仅GET／HEAD、60秒、independent_commands=false，且签发范围受assistant场景约束 | 可研究用于受限读取，不能保存为独立queued写命令授权 |

最小缺口是：**现有逐请求审批proxy写入，没有交给resource server一份可持续在线核验原key／子凭据、当前精确服务／操作与原批准关联的命令授权证据。** 新proxy会查原key，但Worker只有派生delegation；两者的信息和撤权语义不同。缩短token TTL、只查active user、读取allowlist快照或猜测key ID均不解决执行前撤权。

## 方案与可安全执行范围

1. **上游补来源链／命令授权契约（完整修复方向，尚未提供）**：由Nyx已认证、已准入且按原策略批准的proxy建立签名来源链或不可伪造的命令authority引用，关联原key与child incarnation、subject、精确UserService/catalog、操作及请求digest和批准引用；resource server以受信client向官方在线核验。删key、child撤销／轮换、scope收窄、连接或operation策略／批准漂移必须拒绝，查询错误fail closed；延时任务仍遵守delegation expiry，不能延长60秒identity或偷换新来源。更强的单次命令消费应由官方提供redeem／fence，博客不自造上游批准。
2. **现有原key service-bound introspection（有限范围，不覆盖原复现）**：只对本来就被明确授予service-wide、无逐请求／operation审批gates的普通resource-server key适用。需要原Bearer、显式注册introspection trust、匹配subject／service和每次实时核验；不能为测试改掉原有审批，不能用这个有限正控关闭R031。当前博客未实现该模式，尚无新增实际证据。

CMS及拥有真实可在线重验OAuth lineage的service路径，仍按各自原有有效期、当前client／组织／Publisher与精确外部批准约束工作；这不是把所有必需service写改回CMS。新proxy请求仍受官方当前key准入。**无法证明来源当前有效的API-key派生queued外发没有安全可执行依据，R031保持必需阻塞；现有业务源码尚未加入临时fail-closed保护，不能声称Worker已经阻断这些任务。** 本轮只使用安全adapter的既有证据，不启动真实Worker派发。

ReleaseWorker与DeliveryWorker共用保存Actor→Policy→NyxAuthority.validate路径，因此两者都需要来源重验；DeliveryWorker目前是同源风险的源码结论，不能冒充新增实际分发复现。具备官方契约后，应在两个Worker的执行和最后beforeWrite／发送前核验同一来源，保留现有owner、Publisher、连接和精确批准守卫。

## 后续验收条件

保留未撤权正控；分别覆盖key服务列表移除、key删除、child撤销／轮换、operation限制、批准／连接漂移及服务范围恢复。两个Worker都需用真实官方来源证据建立queued，保存后重开一致DB，再验证撤权后blocked且adapterCalls=0／authorizedWrites=0；正控应允许合法延时而不延长credential expiry。伪header、替换为另一个有权key、只读proof用于写、静默回CMS或N/A均不得计为通过。

当前没有R031业务修复SHA或新测试通过结论。原始需求／source、既有正式验收条件保持；Live及D1–D9未签收，外部平台账号／订阅／具体内容动作授权与目标运维输入仍缺。
