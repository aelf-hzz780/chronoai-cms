# I5 正常文章发布与固定源码验证（开发记录）

分支：`codex/003-blogsystem-delivery`；业务源码：`8828d6c654ff435a35d775d249c5342a00341e8d`。本记录区分开发自测、原任务独立复验和未完成的生产验收；完整D1–D9/A01–A52、Live及生产部署仍未通过。

## R018 修复与支持边界

独立复验发现纯图片原稿被空文字集检查拒绝，129个普通短段落又因逐节点截图上限在实际公开后持续verifying。8828d6c允许纯图片正文继续接受图片可见性、几何、hit-test及物化后的MIME／摘要核验；同视口且包围框互不重叠的文字节点分组截图，逐grapheme像素贡献检查保持执行。透明、裁剪和重叠文字不会借用其他节点的绘制结果。

私有原稿继续按2MB限制无损保存；公开发布支持1024个非空文字节点、50000个Unicode code point。在任何Ghost访问、POST或PUT前同步检查容量；超出时PUBLICATION_RENDER_LIMIT使release进入blocked，保留原稿，更新不覆盖已有公开版本。最多128组视口、60秒的渲染预算仍存在，因此符合静态容量边界不代表任意主题均能完成证明。生产容量与主题升级需另行验证。

开发重绑原probe：纯图片和有caption图片均通过并物化一个素材；129段实际Worker＋GhostAdapter只POST一次，40张截图、约5秒完成published；正常26行、跨屏长文通过，透明／裁剪反例仍拒绝。50001字符原稿保留，worker blocked，Ghost.current调用为0。算法、部署依赖与取舍见operations.md。

固定8828d6c运行`npm run check`通过：strict TypeScript与76项测试全部成功，0失败／跳过；日志`.runtime/i5-final-check.log`。本记录提交仅更新文档，不改变运行源码指纹。

## 固定源码运行证据

三类运行证据及restore-report的sourceFingerprint、恢复引用的sourceIntegrationFingerprint与当前70个源码／配置／测试文件逐文件相同。SHA256 manifest：`aaa6c309f5f1d3b5927ab3fe7dc145fbf5bd0aaccea7b46be80f0582bfbcbeaa`。

| 验证 | 结果 | 本机证据 |
|---|---|---|
| 四Ghost，owner×语言×入口 | 八组合通过，API关闭后公开页与图片保持可用 | `.runtime/blogsystem-integration-7df6dcf4/evidence.json` |
| 四dev Ghost逐站实际重启 | 四站通过，marker／图片SHA／下线404／sitemap符合预期 | 同目录`resilience-evidence.json` |
| 加密capture与全新卷四站恢复 | 八组合通过，48秒；原文与图片一致、outbound paused、旧session失效、原卷保留 | `.runtime/recovery-exercise-A62XU1/evidence.json`及`restored/restore-report.json` |
| 指纹汇总 | 70文件一致 | `.runtime/i3-local-retests/final-validation-manifest.json` |

恢复harness在test/recovery.integration.ts硬编码worktree_dirty=true，证据原样保留；此字段不能证明工作树状态，源码一致性以上述逐文件比对为依据。四Ghostharness使用官方Ghost所带Node22.23.4；主机支持运行时仍为Node24.18.0。以上均为本机合成身份验证，不代表真实NyxID、外部平台或生产RPO/RTO通过。

新恢复project为blogsystem-restore-77b017f2-personal／org，仅loopback端口3068、3069、3078、3079。上轮自己的c1ae5635恢复容器已停止以释放内存，卷全部保留。原实验、源dev站及源卷保留；没有修改官方Ghost源码。

## 独立复验与剩余门禁

原任务已在910591d真实Chromium复验中关闭R002／R011，包含透明文字、26行裁剪、长文滚动、中英混排、辅助full／excerpt及动态页面干扰；其余R001–R017的关闭记录沿用各自固定SHA和具体分支，不扩大为完整场景矩阵通过。R018在8828d6c等待独立复验，本记录不提前判定关闭。

真实NyxID、DEV／Hashnode／Medium／HackerNoon账号与外部写入、生产HTTPS／容量／付款责任／隐私及RPO/RTO继续BLOCKED。目标remote只读访问仍Repository not found，未push；不推送main／master。运行目录含私有配置、凭证与加密备份，全部保持Git忽略，仅提交可审查源码和文档。
