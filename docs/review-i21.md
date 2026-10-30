# I21 实际 Native 恢复与生命周期收尾 / Actual native recovery and lifecycle closeout

本报告同步固定业务源码 `041865217bb876b4d885a88a1e1344cb11af4345` 的第二轮实际 NyxID＋四原版 Ghost 恢复窗口。只修改文档，不修改业务、不重跑测试、不启动容器或 Worker；原正式需求与验收矩阵保持不变。动态状态仍以[root独立台账](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/integration-review/case-ledger-current.json)为准。

This report records the second actual NyxID and four unmodified Ghost recovery window for business source `041865217bb876b4d885a88a1e1344cb11af4345`. This update changes documentation only: it does not modify business code, rerun tests, or start containers or Workers. The formal requirements and acceptance matrix remain unchanged. Dynamic status remains governed by the linked root ledger.

## 只读认回与撤权边界 / Read-only recovery and revocation boundaries

[recovery-critical-review.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/recovery-critical-review.json)记录原始 NyxID token 在退组时仍 active、剩余约503秒，个人 workspace仍保留、组织 membership已移除。当前 Admin 通过正式 API 对同一 Ghost `remoteId=6ae46cf62dd59000016df5a1`执行只读认回，结果 `published`、0新写；原Actor密文、原Trace及queued结构保持，outbound paused。随后保留的组织 queued release 在原token active但当前身份已失去组织权限时变为`blocked/FORBIDDEN`，无Ghost出站。该证据覆盖“原凭据未过期但当前授权失效”的执行前重验边界。

The critical review records that the original NyxID token was still active for about 503 seconds when organization membership was withdrawn. The personal workspace remained and organization membership was removed. The current Admin used the formal API to reconcile the same Ghost `remoteId=6ae46cf62dd59000016df5a1`; the result was `published` with zero new writes. The original Actor cipher, original trace, and queued structure were preserved while outbound remained paused. A preserved queued release then became `blocked/FORBIDDEN` while the old token was still active but the current identity lacked organization authority, with zero Ghost attempts. This covers the execution-time recheck boundary where the old credential has not expired but current authorization has been revoked.

[recovery-old-session-proof.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/recovery-old-session-proof.json)确认恢复前仍未过期的旧 CMS cookie 在实际恢复清空 sessions 后返回401 `UNAUTHENTICATED`；没有先重新OAuth登录。该结果只证明恢复会话失效，不替代当前 Admin 只读认回。

The old CMS cookie was still within its validity window before recovery, but returned 401 `UNAUTHENTICATED` after restored sessions were explicitly cleared, without first performing a new OAuth login. This proves restored-session invalidation; it does not replace current-Admin read-only reconciliation.

## 加密归档、新卷与恢复后写入 / Encrypted archive, fresh volumes, and post-restore write

[recovery-independent-audit.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/recovery-independent-audit.json)以只读方式审计22个业务payload文件、77个Git指纹文件、38个source/lock文件、24个AppleDouble元数据项；原加密归档未变，33张源表捕获完整，12个私有素材、24个revision及权限／publication映射的字节保留。新隔离卷使用同官方 Ghost/MySQL 镜像，原始公开读回、媒体SHA和映射已复核。平台数据库仅记录有界恢复差异：一条operator recovery audit、23个sessions按显式失效移除，以及原组织中文verifying行从`verifying`转为`uncertain`；这些差异均有报告理由。

The independent audit read 22 business payload files, 77 Git fingerprint files, 38 source/lock files, and 24 AppleDouble metadata items. The original encrypted archive remained unchanged; all 33 source tables were captured, and 12 private assets, 24 revisions, and permission/publication mappings retained their bytes. Fresh isolated volumes used the same official Ghost/MySQL images, with public readbacks, media hashes, and mappings rechecked. Database deltas were bounded and classified: one operator recovery audit, 23 sessions explicitly invalidated, and the existing organization Chinese verifying row changed from `verifying` to `uncertain`; each delta has an allowed reason.

审计明确保留主题 symlink uid/gid `1000→0` ownership drift、目标与mode及普通非日志字节；不声称整卷元数据byte-identical。恢复后新的 Admin 文章／PNG 只各一次实际Ghost POST201，公开revision和PNG SHA通过，原异常首次尝试未重发。该新写入证明恢复后可用，不证明生产RPO/RTO。

The audit explicitly preserves the theme symlink uid/gid `1000→0` ownership drift, targets, modes, and ordinary non-log bytes; it does not claim byte-identical whole-volume metadata. After restore, a new Admin article and PNG each used one actual Ghost POST201, with public revision and PNG SHA verified. The original failed attempt was not resent. This proves bounded post-restore usability, not production RPO/RTO.

## 组织中文认回与 projection / Organization Chinese reconciliation and projection

[recovery-prior-verifying-review.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/recovery-prior-verifying-review.json)对原组织中文 release `b33c08c4-c878-4aff-9e10-1735dde147a6`执行只读认回：保持同一 `remoteId=6ae45221fc7df300019c14f3`、原Trace `20cc6b46-3373-490a-8f56-bc5b29cd5a81`、无Ghost写入；显式 resume 后 projection complete，英文与中文公开页均显示双向译文链接。该步骤没有把未知的首次 `INTERNAL` 原因解释成超时或产品bug，也没有重发原Ghost写。

The prior-verifying review reconciled the organization Chinese release `b33c08c4-c878-4aff-9e10-1735dde147a6` read-only: the same `remoteId=6ae45221fc7df300019c14f3`, original trace `20cc6b46-3373-490a-8f56-bc5b29cd5a81`, and zero Ghost writes were preserved. An explicit resume completed the projection, and both public English and Chinese pages exposed reciprocal translation links. The first `INTERNAL` cause remains unknown; this does not classify it as a timeout or product bug, and the original Ghost write was not resent.

## 收尾、失败尝试与边界 / Closeout, failed attempts, and limits

[recovery-closeout-review.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/recovery-closeout-review.json)确认恢复应用暂停且无pending jobs，停止源／恢复九容器后公开读回与素材边界保留，当前 Admin 正式取消残留 queued。第一次 closeout harness 因 `from review import *` 覆盖模块别名失败；确认 membership 已恢复后继续，未重放mutation。全部失败尝试、日志及主题 symlink 元数据差异均保留在报告引用的private evidence中。

The closeout review confirms the restored application was paused with no pending jobs, the source and restored nine-container sets were stopped after public readback with media boundaries retained, and the remaining queued item was formally cancelled by the current Admin. The first closeout harness failed because `from review import *` shadowed a module alias; after membership was confirmed restored, the run continued without replaying the mutation. All failed attempts, logs, and theme symlink metadata differences remain in the referenced private evidence.

[dev-resource-window-restored-r2.json](/Users/richardhuang/workspace/ChronoAI/BlogSystem/.runtime/acceptance-review/native-four-0418652/dev-resource-window-restored-r2.json)确认 dev 八容器原ID、image、volume均恢复且healthy；四个dev站、两个baseline站、Nyx 3000/3001、CMS3117九端点200。源／恢复两套各九容器已停止、卷保留。这个窗口收尾不等于备份解密、新卷数据恢复或正式A49–A51／RPO/RTO验收。

The resource closeout confirms the eight dev containers resumed with their original IDs, images, and volumes and are healthy; four dev sites, two baseline sites, Nyx 3000/3001, and CMS3117 returned 200. Both source/restored nine-container sets were stopped with volumes retained. This window closeout is not backup decryption, fresh-volume data recovery, formal A49–A51 acceptance, or RPO/RTO validation.

仍未完成：组织译文后续 stale/unpublish、普通成员个人路径、新素材 cancel，以及完整组织生命周期和实际外部平台；R031完整key/child、普通门户Launch、正式运维／RPO/RTO输入仍BLOCKED。Native整体不判完，原组织中文首次 `INTERNAL` 原因不定性。现有四站核心与真实指标仍引用 [I20](review-i20.md) 的具名报告。

Remaining work includes organization translation stale/unpublish, ordinary-member personal paths, new-asset cancellation, the complete organization lifecycle, and real external platforms. Full R031 key/child authority, ordinary portal Launch, and formal operations/RPO/RTO inputs remain BLOCKED. Native acceptance is not complete, and the original organization Chinese `INTERNAL` cause remains unclassified. Four-Ghost core and real metrics evidence remain linked from I20.
