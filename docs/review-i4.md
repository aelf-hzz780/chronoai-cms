# I4 残留故障修复（开发记录）

源码批次：f1b8b41、94d76ce、f3dfd76、68cae4e；当前像素证明源码910591d。分支codex/003-blogsystem-delivery。本记录与原任务独立验收分开；Live外部写入、生产部署及完整D1–D9/A01–A52仍未通过。

## 剩余四项修复

| 项 | 具体行为 | 开发验证 |
|---|---|---|
| R002 | 受控DOM保持NBSP与代码空白；共享Chromium实际载入主题，检查正文未被JS替换、computed style/几何/hit-test，拒绝CSS祖先隐藏及零尺寸／裁剪／屏外图片；opacity0.9正例通过 | review-i1.test.ts；原affected-regressions本地重绑11分支符合预期，反例不物化图片 |
| R011 | report在语义与资源核验后使用同一渲染证明；visibility:collapse、关闭dialog/details和CSS隐藏保持manual跟进 | distribution.test.ts；正确full/excerpt可通过，原独立probe重绑11分支符合预期 |
| R013 | metadata实际beforeWrite后任何异常均保留纠正任务，读回503不掩盖迟到写入可能性 | alternates.test.ts；after-dispatch-readback-failure重绑：晚到链接短时出现、纠正1次后消失、无pending job |
| R016 | published查询前先写持久attempt，观察写入与清attempt同事务；首条DB写不可用则fsynced sidecar；重启重读、snapshot并入 | metrics.test.ts；查询错误、两张采集表写失败、全部DB写失败在磁盘重开后均Unavailable；snapshot保留缺口；其他语言不受影响 |

`npm run check`在910591d对应源码通过75项，包含strict TypeScript。Chromium不可用／主题CSS脚本不可取时保留未验证；部署依赖和渲染边界见operations.md。开发probe结果在工作树`.runtime/i3-local-retests/`，不提交运行数据、密钥或备份。

## 独立复验已收到的进展

原任务已反馈R006、R007、R008、R009、R010、R012、R014、R015及native metrics连接证明相关分支通过。它们是对应固定SHA与具体分支的结论，不提升为全D/A通过。原任务进一步确认R013在f3dfd76的11个退避／升级分支通过，R016关闭；R017在68cae4e真实磁盘重开、并发snapshot及提交后清理失败分支关闭。当前仅R002/R011的910591d像素证明待独立复验。

## 运行验证与外部边界

910591d当前源码运行结果：

- 四Ghost八组合：`.runtime/blogsystem-integration-4cdf5099/evidence.json`，包含业务API关闭后公开页／素材继续可用。
- 四dev Ghost逐一实际重启：同目录`resilience-evidence.json`，每站7秒恢复；marker、图片SHA、下线404及sitemap匹配。
- 完整加密capture与新卷四站恢复：`.runtime/recovery-exercise-G3jpkU/evidence.json`，48秒，八组合恢复校验通过；恢复平台保持出站暂停、旧session失效，原卷保留。
- 三类证据和恢复所引源integration指纹逐文件一致：`7ff71165922666b3ea08db1b68c114f4e425350f32f602d58e48ba2c7c8ce452`；汇总`.runtime/i3-local-retests/final-validation-manifest.json`。

以上是本机合成运行证据，原任务独立认定与生产RPO/RTO分开。历史版本证据不提升为当前源码通过；runtime文件不提交，目录包含私有配置／加密备份，按运维敏感材料保留。

2026-10-29只读重试origin HEAD仍为Repository not found；未push。NyxID与外部发布账号、生产HTTPS／付款责任／隐私与RPO/RTO依赖继续保持BLOCKED。原实验与源卷保持保留，恢复只使用新隔离project和loopback端口。


## 追加闭环

R013改为持久projection_retries，纠正任务前置读失败保留同一job；5/10/20/40/80秒退避，第6次失败或终止错误进入manual_action_needed。link-status公开尝试数与下次时间，当前授权可在排障后sync-links，暂停仍阻断写入。R017以attempt id作为成功observation receipt，事务内清checkpointed DB attempt，提交后清sidecar；查询与checkpoint均识别已提交receipt，清理中断不会永久污染源库覆盖。

R002/R011在几何证明后增加实际字形像素差异：逐节点／视口原图、无视觉变化的包裹图、隐藏文字图、恢复图，对每个非空白grapheme检查绘制贡献。正常26行与跨屏长段落通过，透明／白底白字／仅首行裁剪／line-clamp均拒绝；正文外spinner不参与字形区域比较。原probe本地重绑结果符合预期，尚以原任务固定SHA复验为准。
