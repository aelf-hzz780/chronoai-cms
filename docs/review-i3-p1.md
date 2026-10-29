# I3 P1 修复批次（待独立复验）

基于 bf0a4f9 的 CHANGES_REQUESTED，修复 R002/R007/R008/R009/R010。本文件不宣布独立验收关闭。

| 项 | 变更 | 回归 |
|---|---|---|
| R002 | 正文证明保留inline分隔空格，拒绝inert/hidden祖先与image选择属性变化；不再忽略srcset/sizes | review-i1.test.ts：可见正文正例；template/hidden/srcset/词间空格反例；实际GhostAdapter失败时不物化图片 |
| R007 | 冻结connection fingerprint包含账号/组织/publication/route/id/generation；native execute解析与approval后重验，发送前调用dispatch guard | nyxid.test.ts：native最终解析账号不同，proxy写入0 |
| R008 | Worker最后同步检查原文published、digest、URL，native内部异步检查后再次执行同一guard | distribution.test.ts：最后connection和execute await内下线，出站0 |
| R009 | provider已接受写入后任何解析/核验异常保持uncertain，不能新key重复create | distribution.test.ts：缺id的HTTP201保持uncertain，第二create拒绝 |
| R010 | 完整恢复plan先校验project、派生卷、端口唯一且不与源project冲突 | recovery.test.ts：真实CLI+假Docker记录器，重复project失败且无Docker调用/无destination |

验证：`npm run check` strict + 50/50；`git diff --check`。正文回归先在旧实现复现失败，再修改。当前未重新生成四Ghost/恢复证据，不能以旧指纹代表本批源码。R006及其余P2在下一批继续；Live外部依赖与最终D/A验收保持未通过。
