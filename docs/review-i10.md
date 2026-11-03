# I10 Ghost consent导航修复（开发记录）

R024修复源码：`74978bc118b1ae91fb3390a1ea39b0756b3c425a`；固定缺陷基线为792a7bb，关联D8、A41/A46。独立实际Ghost专项已关闭；完整D1–D9/A01–A52及Live未整体通过。

## R024：consent面板不能嵌入相关内容链接

独立实际Ghost 6.73.0默认主题发现页面内第一个`footer`是related-post card中、可点击`a`里的`footer.gh-card-meta`。tracker.js用`document.querySelector('footer')`挂载面板，Allow／Decline都会触发该链接并离开当前文章。采集请求本身不是导航根因。

修复移除footer查询，面板固定挂到非交互的`document.body`，documentElement作为无body时的安全回退；两个button增加`preventDefault`和`stopPropagation`。collector、referrer origin脱敏、campaign校验、GPC/DNT、撤回与required consent逻辑保持不变。

## 验证与边界

新增tracker单元fixture覆盖：默认主题related footer和无footer页面均将面板挂在BODY，按钮选择不改变当前文章URL，原有yes/no采集与撤回断言继续通过。真实Chromium DOM fixture进一步加载实际tracker.js：模拟默认主题footer嵌套链接与无footer页面，Allow保持当前URL并仅发送一次collection，Decline保持当前URL；输出`status:passed`。`node --check web/tracker.js`通过，`npm run check` strict与81项测试全部通过。

这次仅改静态tracker与对应测试，无Ghost主题源码、服务端路由、权限、采集协议或外部写入变化。固定74978bc的独立真实Ghost 6.73.0默认主题EN/ZH复验确认：面板parent为BODY且无ancestor anchor，Allow／Decline均保持原文URL；EN实际PV 2→3后拒绝重载仍3，ZH 0→1后拒绝重载仍1。独立strict＋81/81通过。总证据为原任务工作树`.runtime/acceptance-review/reviews/74978bc/review.json`及`r024-actual-ghost-review.json`，R024已关闭。root3398／3399、review Ghost、dev源站均未由本任务启动或操作。
