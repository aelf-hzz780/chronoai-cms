# I6 渲染期间版本一致性修复（开发记录）

业务源码：`8aa2a027a8115f1c8c5c55f650d0b761dad2108f`；分支：`codex/003-blogsystem-delivery`。R001–R018保持历史独立关闭；新发现R019单独跟踪。完整D1–D9/A01–A52与Live仍未整体通过。

## R019：滚动后的文字不再属于已确认版本

原任务在8828d6c真实GhostAdapter＋Chrome复现：初始Admin／公开HTML、marker和正文正确；首次滚动触发页面scroll listener把既有Text.data从APPROVED改成等长ALTERED!，核验仍返回true。初始outerHTML比较不能覆盖随后异步scroll／wrap／screenshot过程。

修复在首次几何检查与滚动前绑定唯一正文root、原始节点及outerHTML，并以MutationObserver持续监测到最终一致性检查。正文characterData、属性、结构变更，以及root移除／替换均锁存失败；即使改回原文也不重新通过。校验器自己的span包裹、隐藏和还原操作仅豁免精确target与增删节点／style属性记录，其余变更继续检查，不丢弃整批记录。每组截图恢复后及最终都检查；observer在finally断开。正文外无关主题变化保留兼容。

## 开发验证

- TDD先复现滚动替换误通过，再验证修复；新R019测试包含同Text改字、立即改回、同文Text替换、marker修改、包装时页面MutationObserver改字及改回、正常正文和正文外变更对照。
- strict TypeScript及77项测试通过，0失败／跳过，日志`.runtime/r019-check.log`。正常长文、129段和透明／裁剪反例保持符合预期。
- 原独立scroll-mutation.mjs仅重绑开发root／out后实际运行：正常对照true、最终APPROVED；脚本改字false、最终ALTERED!、mutationCount=1。证据`.runtime/r019-retest/scroll-mutation-results.json`；其commit字段沿用原脚本8828d6c，不用作本次源码身份声明，重绑脚本的root及固定8aa2a02才是运行绑定。

R019已由原任务在固定8aa2a02独立关闭。实际GhostAdapter原scroll probe、scroll改回、同文root／Text替换、marker改回、包装／隐藏阶段页面MutationObserver改字及改回均拒绝，且确认脚本触发；正常正文和wrapper外主题变化通过。纯图片、正常26行、裁剪／透明和R011实际report5分支无回退，strict及77项测试独立通过。原任务证据位于其工作树`.runtime/acceptance-review/reviews/8aa2a02/integrity/results.json`。

四站真实主题八组合补验通过：`.runtime/blogsystem-integration-6aca588f/evidence.json`，build_revision=8aa2a02，71个文件指纹与当前源码逐文件相同，SHA256 manifest为`1af54663752fef7639c65378a52b46e33695148500a4ba719a6b08c44689310e`。汇总`.runtime/r019-retest/validation-manifest.json`。worktree_dirty=true对应当时待提交的交付文档；源码由逐文件指纹绑定。

首轮四站在personal-zh出现verifying／ORIGINAL_NOT_VERIFIED，日志`.runtime/r019-four-ghost.log`保留。该精确源页面在host Chrome复查通过，同一Alpine Chromium helper加只读诊断连续三次visible／integrity／available均true并核验通过；未捕获正文变更或guard误拒绝。未改产品代码，恢复无诊断的固定源码后完整八组合通过；首轮根因尚未确定，不把诊断结果当成固定源码运行证据。无变化的重启／恢复演练不重复运行。

按原任务要求进一步恢复首轮的同一失败记录，而非用新文章代替：release `41b9c11e-52f1-4d02-b0ea-c380c03a3388`、article `def66581-8424-48b4-be8a-8e0dc8881f3c`。原helper数据库four-ghost-dnhNOB/platform.sqlite经正常CMS reconcile路由和实际ReleaseWorker／GhostAdapter／Alpine Chromium恢复为published、error null、job done。31个业务src文件SHA匹配8aa2a02，未修改产品或直接改release状态；当前synthetic actor通过正常recovery_actors重授权，原actor_json密文保留。

初始素材记录0、文件无、HTTP404；实际renderer成功返回时仍记录0／文件无，随后才物化并读回HTTP200、image/png、SHA匹配，最终素材记录1。8次Ghost请求全部GET，POST／PUT为0，远端id／url／revision／updated_at／html不变。原Trace `0c8c64b4-16e5-4d78-8751-1a6ad1e54e4c`，恢复Trace `223fe746-fc5b-4892-a740-41302916e9cb`。证据`.runtime/r019-retest/original-release-recovery-evidence.json`；原失败副本`.runtime/r019-failed.sqlite`与恢复后副本`.runtime/r019-retest/reconciled-original.sqlite`均保留。本段为开发恢复补证，已交独立核对，不覆盖首轮失败或未知原因。

原任务后续已独立比较该原失败release的before／after数据库及真实公开页／图片，确认verifying→published、原revision／remote／actor密文不变、素材记录0→1、PNG MIME／SHA通过。GET-only历史以开发录制为依据；首轮根因继续保持未知，不覆盖首次失败。

## 历史运行证据与未完成门禁

原任务已独立核对8828d6c恢复工件：认证解密、全部archive checksum、9张平台表全部字段／BLOB、16个源／恢复页面和图片MIME／SHA读回通过，恢复出站仍暂停。Local权限矩阵双入口各129记录分支、8个内容上下文、19个指标／隐私分支未发现失败，身份均为synthetic。以上结论限8828d6c固定源码和对应分支，不能替代本次8aa2a02渲染修复的独立复验。

真实NyxID／provider、生产域名／部署／运维及付款责任、隐私策略与RPO/RTO保留既有外部依赖。remote此前只读访问Repository not found，未push；未真实外发、未改官方Ghost源码、未删除数据卷。运行证据和私有配置继续保持Git忽略。
