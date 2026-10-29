# 74978bc 独立 Local 恢复验收记录

固定源码：`74978bc118b1ae91fb3390a1ea39b0756b3c425a`。原任务独立报告为`PASS_BOUNDED_LOCAL_RECOVERY`，证据位于原任务工作树`.runtime/acceptance-review/integration-review/recovery-749-r1/review.json`及其列出的子证据。本记录只同步已核对的独立结果，没有修改业务代码或重复操作环境。

## 数据与实际恢复行为

真实Ghost接受POST并返回201后由故障代理丢弃响应，应用保留uncertain；另一任务queued后，在源应用停机期间撤销Publisher凭证。随后完成平台与四Ghost完整加密capture，恢复到r2全新卷和四Ghost实例。身份使用真实AuthManager/OIDC/JWT/introspection链路及明确的本地identity fixture；authority状态未随应用快照回滚，不代表真实NyxID Live。

独立AES解密、13个payload认证与checksum、72文件source fingerprint及33表全部字段／BLOB核对通过；21个revision、9个asset保留。预期差异仅为移除3个session、增加1条recovery.isolated审计。源Ghost停止时，恢复实例20项页面／图片读回通过；私有原稿和素材授权读取byte exact，越权访问拒绝。

未过期旧cookie返回401。当前Admin在出站暂停期间完成原uncertain记录的GET-only对账：2次读取、0次写入，原remoteId及确认actor密文保持。resume后，撤权queued记录为`blocked:IDENTITY_UNAVAILABLE`且0次写入。新Admin新稿与全新PNG恰好1次POST成功，公开图片byte exact，私有图片仍不公开；projection全部完成。

## 失败、耗时与交付边界

首次r1因Docker默认地址池耗尽失败，Trace `627ca99e-b78b-42fa-8968-e165441249bd`，现场保留。r2使用预创建的不冲突显式网段及全新project／卷成功，没有删除旧网络或卷。45.005秒仅为成功CLI执行耗时，完整演练还包含首次失败和人工处理，不能作为约定的生产RPO/RTO验收。

Local连接registry为空，未宣称恢复真实外部账号；外部provider delivery恢复、真实NyxID／组织批准、目标部署、运行责任、保留策略及数值RPO/RTO仍需外部输入和验收。R001–R024已登记问题均有界关闭（R021非门禁），正式D1–D9／A01–A52仍未签收，逐分支核算由原任务继续进行。

## 资源窗口结束

原任务已暂停／停止自身source与restore App／Ghost，保留全部原卷和恢复卷；此前暂停的dev-personal／dev-organization八容器已由原任务启动并确认healthy，baseline四容器同样healthy。本任务未启动或停止这些环境。先前文档中的dev暂停是历史窗口状态，以本条资源恢复通知为准。
