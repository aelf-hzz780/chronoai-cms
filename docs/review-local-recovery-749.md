# 74978bc 独立 Local 恢复验收记录

固定源码：`74978bc118b1ae91fb3390a1ea39b0756b3c425a`。原任务独立报告为`PASS_BOUNDED_LOCAL_RECOVERY`，证据位于原任务工作树`.runtime/acceptance-review/integration-review/recovery-749-r1/review.json`及其列出的子证据。本记录只同步已核对的独立结果，没有修改业务代码或重复操作环境。

## 数据与实际恢复行为

真实Ghost接受POST并返回201后由故障代理丢弃响应，应用保留uncertain；另一任务queued后，在源应用停机期间撤销Publisher凭证。随后完成平台与四Ghost完整加密capture，恢复到r2全新卷和四Ghost实例。身份使用真实AuthManager/OIDC/JWT/introspection链路及明确的本地identity fixture；authority状态未随应用快照回滚，不代表真实NyxID Live。

独立AES解密、13个payload认证与checksum、72文件source fingerprint及33表全部字段／BLOB核对通过；21个revision、9个asset保留。预期差异仅为移除3个session、增加1条recovery.isolated审计。源Ghost停止时，恢复实例20项页面／图片读回通过；私有原稿和素材授权读取byte exact，越权访问拒绝。

未过期旧cookie返回401。当前Admin在出站暂停期间完成原uncertain记录的GET-only对账：2次读取、0次写入，原remoteId及确认actor密文保持。resume后，撤权queued记录为`blocked:IDENTITY_UNAVAILABLE`且0次写入。新Admin新稿与全新PNG恰好1次POST成功，公开图片byte exact，私有图片仍不公开；projection全部完成。

## 失败、耗时与交付边界

首次r1因Docker默认地址池耗尽失败，Trace `627ca99e-b78b-42fa-8968-e165441249bd`，现场保留。r2使用预创建的不冲突显式网段及全新project／卷成功，没有删除旧网络或卷。45.005秒仅为成功CLI执行耗时，完整演练还包含首次失败和人工处理，不能作为约定的生产RPO/RTO验收。

Local连接registry为空，未宣称恢复真实外部账号；外部provider delivery恢复、真实NyxID／组织批准、目标部署、运行责任、保留策略及数值RPO/RTO仍需外部输入和验收。R001–R024已登记问题均有界关闭（R021非门禁），正式D1–D9／A01–A52仍未签收，逐分支核算由原任务继续进行。

## A50非空delivery平台恢复补证

固定74978bc独立报告`.runtime/acceptance-review/reviews/74978bc/delivery-recovery/review.json`为PASS_BOUNDED_LOCAL_DELIVERY_RECOVERY。通过实际业务流程生成6条delivery、6份payload、6条native approval及15条初始delivery event，再进行平台加密快照、全字段／BLOB核对和全新Store关闭／重开；没有直接seed这些业务表。恢复保持paused；显式当前Admin对uncertain副本2次GET、0次新增provider写入／redeem，原actor密文、payload和已知映射保持。resume后撤权queued为blocked、过期与漂移批准为approval_needed，均零新增出站，未批准记录同样零写入，最后再次暂停。

该补证使用实际SQLite／NyxAuthority与随机loopback HTTP，OriginalAdapter、authority和provider明确为fixture，287次请求均为本地；没有真实NyxID Admin／DEV账号或外部效果，没有重新做四Ghost恢复，也没有声称整个OS进程重启。不能替代真实外部delivery恢复或生产RPO/RTO。

## 资源窗口记录

完整恢复窗口结束时，原任务暂停／停止自身source与restore App／Ghost，保留全部原卷和恢复卷；此前暂停的dev-personal／dev-organization八容器由原任务启动并确认healthy，baseline四容器同样healthy。随后原任务为A04／A07／A19差量安排新的短窗口：暂时停止dev八容器、使用其已保留的restored-r2四站及helper固定2b，结束后负责恢复dev并验证healthy。本任务不操作Docker或相关端口，不独立启停这些环境。实际启停状态以原任务窗口回报为准，全部卷继续保留。
