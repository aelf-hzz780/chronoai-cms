# I9 CMS 文件选择器重复选择（开发记录）

R023修复源码：`586ff1a6b9462f05228610249adb404fbabda6cf`；关联D4、A17/A19，固定业务基线为792a7bb。独立实际浏览器专项已关闭；完整D1–D9/A01–A52及Live未整体通过。

## R023：同一路径文件可重复选择

独立验收在同一CMS标签页切换个人EN／ZH文章后发现，`web/app.js`的图片和Markdown input只监听`change`且保留旧value。浏览器再次选择同一路径图片时不会触发change，导致没有请求、没有asset引用和成功提示；改名后才触发。文件字节和权限逻辑本身没有缺陷。

修复新增`clearFileSelection`。两个change handler在读取File后立即清空input，因此成功、大小校验失败和后续重试都能再次选择同一路径。新建、打开文章及owner／编辑上下文reset也清空控件。图片上传记录原articleId，异步完成后若当前文章已切换，只提示素材已保存到原文章，不把asset markdown写入另一篇编辑器；原有私有asset API、owner/article约束与原始字节处理保持不变。

## 验证与边界

临时真实Chromium＋Fastify App fixture浏览器探针（独立临时端口，无真实OIDC／外部服务、未操作3398／3399、Ghost或dev源站）通过：

- 同一PNG路径从EN文章切换到ZH文章后再次选择成功，生成每篇独立asset并追加各自编辑器；
- 超过5 MB的图片校验失败后，同一路径重试成功；
- 同一Markdown路径连续两次导入均触发，第二次恢复带BOM的原始内容；
- 成功／失败后两个input的value均已清空。

`node --check web/app.js`通过；`npm run check` strict与80项测试全部通过。探针脚本和输出在Git忽略的`.runtime/r023-file-picker-probe.mjs`及命令输出中，不能替代独立验收。没有新增后端路由、权限或外部写入；Markdown导入仍保留原始BOM／CRLF语义，图片仍只通过当前文章私有asset服务上传。

固定586ff1a的独立报告确认真实Chrome四个分支通过：同路径PNG跨文章、实际401后同路径重试、BOM/CRLF同`.md`二次导入并下载、延迟真实上传响应期间切换文章；7个trusted选择事件与input清空断言通过。证据为原任务工作树`.runtime/acceptance-review/reviews/586ff1a/file-picker/file-picker-review.json`，R023已关闭。dev源站、review Ghost和root3398／3399按资源窗口保持现状，不启动或重启。
