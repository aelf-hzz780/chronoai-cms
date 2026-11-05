# 博客开通高保真交互原型 / Blog setup prototype

本原型延续已确认的 B 方案，演示首版「用户申请、运维人工部署、逐语言核验」流程。自动部署留到后续迭代。

This prototype follows the approved B direction and demonstrates the first-release manual operations workflow. Automated provisioning is deferred.

## 预览 / Preview

在本目录启动静态服务，然后打开交互入口或页面总览。

Start a static server from this directory, then open the interactive experience or the review gallery.

```sh
python3 -m http.server 4182 --bind 127.0.0.1
```

- 中文 / Chinese: http://127.0.0.1:4182/?lang=zh#sites
- English: http://127.0.0.1:4182/?lang=en#sites
- 页面总览 / Review gallery: http://127.0.0.1:4182/review.html

页面包括站点概览、申请弹窗、申请进度、运维列表与运维详情。附带最小写作草稿和博客效果页，让相关入口可体验。

Core views: site overview, application dialog, request progress, operations queue and operations detail. Small local writing and blog samples support the related links.

## 推荐路径 / Suggested walkthrough

1. 申请开通博客，填写名称，提交申请。 / Apply for a blog and submit its name.
2. 底部切换运维视角，打开申请并领取。 / Switch to operations, open and claim the request.
3. 可先请求补充资料；回到用户侧以 Admin 身份补充。 / Optionally request information and answer as Admin.
4. 分别登记中英文 HTTPS .example 地址，核验当前语言。 / Register an HTTPS .example URL for each language and verify it.
5. 演示核验结果可选择失败；再次核验仅处理当前语言。 / Simulate a failure and retry only the affected language.
6. 返回站点页查看独立语言进度与本地博客效果。 / Return to view per-language readiness and the local blog sample.

底部工具栏可直接切换首次申请、待处理、补充资料、处理中、部分开通、完成和状态不可读。组织角色可切换 Admin、Member、Publisher；个人与组织数据相互独立。

The demo toolbar exposes new, queued, information-requested, in-progress, partial, complete and unavailable states. Organization roles include Admin, Member and Publisher. Personal and organization state is isolated.

## 边界 / Boundaries

所有数据保存在本浏览器 localStorage，可通过原型工具栏重置。原型身份仅用于演示，不是服务端权限实现。所有核验结果均为模拟；没有接入 CMS、NyxID、Ghost 或 DEV，没有部署资源、提交文章或启动发布 Worker。

Data is stored in localStorage and can be reset with the demo toolbar. Role selection is a demonstration, not server-side authorization. Verification is simulated. No CMS, NyxID, Ghost or DEV integration, resource deployment, article submission or publishing Worker is involved.

公开地址仅接受 HTTPS .example 样例，访问博客进入本地效果页。页面使用本地资源，并以 CSP connect-src 'none' 禁止脚本联网。站点已就绪与发布可执行始终分开表达。

Addresses accept only HTTPS .example samples; blog links lead to local previews. Assets are local and CSP connect-src 'none' blocks script connections. Site readiness and publishing availability are always distinct.

## 验证 / Validation

```sh
node --test prototypes/site-provisioning/model.test.mjs
```

以上命令从仓库根目录运行。实际验收见 evidence/acceptance.md，截图见 review.html。

Run from the repository root. See evidence/acceptance.md for verification and review.html for screenshots.
