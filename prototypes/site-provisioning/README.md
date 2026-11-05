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

页面包括站点概览、申请弹窗、申请进度、运维列表与运维详情。附带博客效果页用于预览站点地址。文章创作继续使用现有 CMS 编辑器，不新增写作入口。

Core views: site overview, application dialog, request progress, operations queue and operations detail. A local blog sample previews the site destination. Article creation remains in the existing CMS editor; this prototype adds no writing entry point.

## 推荐路径 / Suggested walkthrough

1. 申请开通博客，填写名称，提交申请。 / Apply for a blog and submit its name.
2. 底部切换运维视角，打开申请并领取。 / Switch to operations, open and claim the request.
3. 可先请求补充资料；回到用户侧以 Admin 身份补充。 / Optionally request information and answer as Admin.
4. 登记一个博客根地址（示例：https://richard.chronoai.example/），自动生成 /en/、/zh/。 / Register one blog root; /en/ and /zh/ are generated automatically.
5. 分别核验两种语言，再单独核验根路径跳转 /en/；原址重试只影响当前检查。 / Verify each language, then separately verify the root redirect to /en/. Retries at the same address affect only the selected check.
6. 返回站点页查看统一博客入口与两语言进度；预览根入口进入英文，可切换中文。 / Preview the shared root opening English, then switch to Chinese.

底部工具栏可直接切换首次申请、待处理、补充资料、处理中、部分开通、完成和状态不可读。组织角色可切换 Admin、Member、Publisher；个人与组织数据相互独立。

The demo toolbar exposes new, queued, information-requested, in-progress, partial, complete and unavailable states. Organization roles include Admin, Member and Publisher. Personal and organization state is isolated.

## 边界 / Boundaries

所有数据保存在本浏览器 localStorage，可通过原型工具栏重置。原型身份仅用于演示，不是服务端权限实现。所有核验结果均为模拟；没有接入 CMS、NyxID、Ghost 或 DEV，没有部署资源、提交文章或启动发布 Worker。

Data is stored in localStorage and can be reset with the demo toolbar. Role selection is a demonstration, not server-side authorization. Verification is simulated. No CMS, NyxID, Ghost or DEV integration, resource deployment, article submission or publishing Worker is involved.

根地址仅接受 HTTPS 的 chronoai.example 子域名样例，访问博客进入本地效果页。页面使用本地资源，并以 CSP connect-src 'none' 禁止脚本联网。站点已就绪与发布可执行始终分开表达。

Root addresses accept only HTTPS subdomain samples under chronoai.example; blog links lead to local previews. Assets are local and CSP connect-src 'none' blocks script connections. Site readiness and publishing availability are always distinct.

## 验证 / Validation

```sh
node --test prototypes/site-provisioning/model.test.mjs
```

以上命令从仓库根目录运行。实际验收见 evidence/acceptance.md，截图见 review.html。

Run from the repository root. See evidence/acceptance.md for verification and review.html for screenshots.

## 首发地址范围 / Initial address scope

申请人只确认博客归属与名称。运维分配一个平台子域名；英文使用 /en/，中文使用 /zh/，根路径固定跳转 /en/，不随 CMS 界面语言变化。两套 Ghost 及各自的数据仍然独立。首版不提供自定义域名申请。

Applicants confirm ownership and the blog name. Operations assigns one platform subdomain. English uses /en/, Chinese uses /zh/, and the root always redirects to /en/, independently of the CMS interface language. The two Ghost instances and their data remain separate. Custom-domain requests are excluded.

原型中的 chronoai.example 仅用于展示，实际平台根域名由部署配置决定。运维流程与后续实施边界见 [operations.md](operations.md)，也可在 [页面总览](http://127.0.0.1:4182/review.html#operations) 中阅读。

chronoai.example is a sample only. The production base domain is deployment configuration. See [operations.md](operations.md) or the [review gallery](http://127.0.0.1:4182/review.html#operations) for the operator flow and implementation boundary.

旧原型的语言子域名记录会转换为新的路径示例，保留申请编号、草稿、备注及负责人；旧地址的核验结果失效，必须重新核验。该迁移只处理本浏览器原型数据，刷新后不会重复重置。新格式下修改根地址也会同时清空两语言和根入口的证据，界面会先确认；同址单语言重试保留另一语言结果。

Legacy split-domain demo records are converted to path examples. Request IDs, drafts, notes and assignees are retained, but old verification evidence is invalidated. The migration affects only local prototype data and runs once. Changing a shared root requires confirmation and invalidates both languages and the root check; retrying one language at the unchanged root preserves the other language.
