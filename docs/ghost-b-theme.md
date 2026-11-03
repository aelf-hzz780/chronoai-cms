# Ghost B 主题交付 / Ghost B theme delivery

状态：WP07 主题源码已实现，尚未安装到真实 Ghost。目录为 `themes/chronoai-b/`，保留已确认 B 原型的宽幅期刊版式、紫色视觉、首篇大卡片和移动阅读布局。文章、作者、日期、标签与分页均由 Ghost 渲染，没有 CMS 私有 API、虚构阅读量或登录依赖。

Status: WP07 theme source is implemented; installation on an actual Ghost instance has not been verified. `themes/chronoai-b/` retains the accepted B journal layout, purple accents, lead card and mobile reading design. Ghost supplies posts, authors, dates, tags and pagination. No private CMS API, invented readership metric or CMS login is required.

## 运行与配置 / Runtime and configuration

- 兼容目标为 Ghost `>=6.0.0 <7.0.0`。主题不包含 Node 服务、构建依赖、外部字体、CDN 或自定义浏览器脚本。Ghost 的可选字体设置使用原生变量，未设置时回退到本地系统字体。
- 个人与组织的英文、中文站点分别安装主题；Ghost 站点语言设为 `en`、`zh` 或 `zh-CN`。`locales/` 与 `{{t}}` 控制公开界面语言，`<html lang="{{@site.locale}}">` 保持站点语言。语言文件不翻译文章正文。
- 站点名称、简介、Logo、导航及作者简介使用 Ghost 原生设置。CMS 发布使用其现有 Ghost author mapping，主题显示真实 `{{authors}}` 和发布时间。
- `page.hbs` 遵守原生 `@page.show_title_and_feature_image` 开关。`config.card_assets=true` 保留 Ghost 原生卡片资源，正文使用 `{{content}}`，标题仅由文章头输出一次；作者写入正文的标题不被主题篡改。

- Compatibility target: Ghost `>=6.0.0 <7.0.0`. The theme has no Node service, build dependency, remote font, CDN or custom browser script. Optional native Ghost font variables fall back to local system fonts.
- Install independently on each owner/language site. Set Ghost's publication language to `en`, `zh` or `zh-CN`; translation dictionaries control interface text, not article content.
- Configure site identity, navigation and author profiles in Ghost. Existing CMS author mappings determine the published author; native author/date helpers display those facts.
- Native page title/image visibility and card assets remain supported. The theme renders saved content once and does not rewrite author-supplied headings.

## 元数据与隐私合同 / Metadata and privacy contract

`default.hbs` 在 `</head>` 前保留一次 `{{ghost_head}}`，在 `</body>` 前保留一次 `{{ghost_foot}}`。现有 `src/ghost.ts` 将 publisher 署名与可选 tracker 写入 post-level foot，并由 `alternates()` 写入经核验的语言互链与 hreflang。主题保留这些注入，不再输出第二套 canonical/hreflang、统计脚本或 consent banner；没有可用译文时不伪造链接。已注入的 publisher、语言链接和 tracker 控件仅由 CSS 适配版式。站点级跨语言入口可由运维在 Ghost Navigation 中配置实际 URL。

`default.hbs` retains native head and foot injection hooks. Existing CMS publishing injects publisher attribution, the optional tracker and verified translation metadata through these hooks. The theme adds no duplicate canonical/hreflang tags, analytics script or consent banner and invents no translation URL. CSS only styles the existing injected controls. Operators may add actual language-site URLs through Ghost Navigation.

公开页面内容由 Ghost 服务端输出，图片由现有 Ghost public media 路径提供。CMS 暂停时，已有文章仍可阅读；CMS tracker 请求失败不阻断正文。主题不覆盖 `routes.yaml`、`robots.txt` 或 sitemap，继续沿用 Ghost 原生路由与 SEO。

Ghost renders article HTML and serves existing public media. Previously published articles remain readable while CMS is unavailable; failure to load the injected tracker does not block reading. No routing, robots or sitemap override is shipped.

## 打包、安装与回退 / Packaging, installation and rollback

`pack.mjs` 要求提供真实维护邮箱和新 ZIP 路径，将邮箱仅写入临时打包目录的 `package.json`，不修改源元数据。脚本只打包主题必需文件，不包含打包脚本、`node_modules` 或仓库元数据，且拒绝覆盖已有输出：

`pack.mjs` requires a real maintainer email and a new output path. It injects the supplied address into staged package metadata without altering source files, packages only the required theme files and refuses to overwrite an existing archive:

```sh
node themes/chronoai-b/pack.mjs \
  --author-email "$GHOST_THEME_MAINTAINER_EMAIL" \
  --output /tmp/chronoai-b-theme.zip
```

打包依赖 Node 和系统 `zip` 命令。通过 Ghost Admin 的主题上传入口安装真实配置包，再在预发布站点激活。此文档未授权写入真实站点；激活前先下载当前主题备份，回退时重新激活原主题。回退主题不会撤销已发布内容或语言互链元数据。源目录缺少 `author.email` 是明确保留的待配置项；最终安装包必须使用具名维护方的真实地址。

Packaging requires Node and the system `zip` command. Upload and activate the configured archive through Ghost Admin after staging validation. No live installation has been performed. Retain the previous theme for rollback; changing the theme does not undo content or translation metadata. The source intentionally leaves `author.email` unconfigured; a final installation archive requires a real maintained contact address.

只做结构验证时可使用保留域 `.invalid`，必须同时带 `--fixture` 且输出名以 `.fixture.zip` 结尾。该包禁止作为最终发布产物：

For structural validation only, a reserved `.invalid` address requires both `--fixture` and a `.fixture.zip` filename. Such an archive is not a release artifact:

```sh
node themes/chronoai-b/pack.mjs \
  --author-email theme-validation@example.invalid --fixture \
  --output /tmp/chronoai-b-validation.fixture.zip
```

## 已做验证与剩余门禁 / Verification and remaining gates

- `node --test test/ghost-theme.test.ts`：3/3 通过。验证原生渲染/注入 hook、单次正文、分页路由、真实 author/date helper、无私有 API 或重复统计、全部 EN/简中翻译 key，以及未配置/误标 fixture 的打包拒绝。
- 官方 `gscan@6.7.0 --v6 --verbose` 已实际执行：**源目录**无 fatal、无 warning，仍有 **1 error：缺少 `author.email`**；**仅临时 fixture ZIP** 完整兼容 Ghost 6.x、无 error/warning。fixture 包通过证明模板/包结构，不证明生产邮箱已配置或真实安装成功。临时验证包为 `/tmp/chronoai-b-20261103.fixture.zip`，SHA-256 `fc590f96a8ec2d4630f2050de29aafbcfefe9a1ea707fd4ac7491487f36ef717`。
- 尚未完成：真实 Ghost 上传/激活；真实文章、作者映射、历史 URL、两语言互链、公开媒体、既有 tracker 的 allow/decline/GPC/DNT，以及 Ghost 离线 CMS 阅读的端到端验收。静态模板与 GScan 不能替代这些检查。

- Theme contracts: 3/3 passing tests covering rendering, metadata hooks, pagination, authors/dates, translation coverage and packaging guards.
- Official GScan 6.7.0 reports **one missing-email error on the unconfigured source directory** and **a clean Ghost 6 compatibility pass on the temporary fixture ZIP only**. This establishes template/package structure, not production metadata configuration or installation success.
- Not verified: actual upload/activation, live post/author mappings, stable URLs, translation metadata, public media, existing consent behavior and reading while CMS is offline. Static checks do not establish installation success.

## 官方依据 / Official references

结构、必需 helper 与 package 要求按 [Ghost Theme Structure](https://docs.ghost.org/themes/structure)；语言按 [translate helper](https://docs.ghost.org/themes/helpers/utility/translate)；注入按 [ghost_head & ghost_foot](https://docs.ghost.org/themes/helpers/utility/ghost_head_foot)；分页与导航按 [pagination](https://docs.ghost.org/themes/helpers/utility/pagination) 和 [navigation](https://docs.ghost.org/themes/helpers/data/navigation)。校验方法参照 [GScan 官方文档](https://docs.ghost.org/themes/gscan) 与 [TryGhost/gscan](https://github.com/TryGhost/gscan)。已核对日期为 2026-11-03。

Primary references were checked on 2026-11-03. Runtime compatibility is bounded to Ghost 6 and should be revalidated before expanding the engine range.
