# I2 开发证据与边界

日期：2026-10-28。分支 `codex/003-blogsystem-delivery`。这是开发交付记录，不是 D1–D9/A01–A52 独立验收。

- `npm run check`：TypeScript strict + **44/44** 本地测试通过；`node --check web/app.js` 通过；`git diff --check` 通过。
- CMS synthetic browser：保存文章、上传带 BOM/CRLF Markdown、私有预览、指标查询、未保存编辑阻止确认均已实测。浏览器 textarea 显示会归一化换行，编辑器用 source/display 双值保留未改动文件原串；服务原始下载测试验证 bytes。
- 四 Ghost harness：`.runtime/blogsystem-integration-6740dab1/evidence.json`，8 组合 personal/organization × en/zh × CMS/service，使用缓存官方 Ghost digest、共享 content volume、公开图片 MIME+SHA-256、owner/author footer、译文互链与下线清链。证据含 `sourceFingerprint`，不含秘密。
- 恢复：既有成功 local evidence `.runtime/recovery-exercise-QiUXTr/evidence.json`（c6de8b5 之前的实现）；本轮新代码已成功完成加密捕获，但在当前 4CPU/约6GB colima 资源压力下 Ghost 恢复健康检查超过180秒，目录 `.runtime/recovery-exercise-b0dWow` 保留供诊断，未把半成品列为新成功证据。生产 RPO/RTO 仍 BLOCKED。
- 本轮没有真实 NyxID 注册、DEV/Hashnode/Medium/HackerNoon 账号写入、公开生产部署或 push。Live 证据必须由原任务独立取得。

关键边界：NyxID native exact redeem、provider contract、组织角色实时检查、queue lease fencing、DOM正文证明、私有图片延迟公开、外部指标不可用态、恢复暂停出站均有本地测试；这些不能替代真实 provider / account / deployment 验证。
