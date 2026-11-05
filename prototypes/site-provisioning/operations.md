# 同域双语博客：首发运维流程 / Same-domain bilingual blog operations

这是获批地址方案的运维流程设计。本轮仅更新独立原型与说明，以下真实配置、核验 API 和部署适配尚未实施；没有修改 CMS、Ghost、代理或发布 Worker。

This describes the approved address design. This iteration changes only the standalone prototype and documentation. Live configuration, verification APIs and deployment adaptation below are not implemented by this change. CMS, Ghost, proxy and publishing Worker configuration is untouched.

## 地址与归属 / Addresses and ownership

| 入口 / Entry | 示例 / Example | 路由目标 / Target |
|---|---|---|
| 博客根入口 / Blog root | https://richard.chronoai.example/ | 重定向 / Redirect to /en/ |
| English | https://richard.chronoai.example/en/ | 英文 Ghost / English Ghost |
| 简体中文 | https://richard.chronoai.example/zh/ | 中文 Ghost / Chinese Ghost |

chronoai.example 是保留示例，实际根域名来自运维配置。Richard 是展示名称；运维分配合法且未占用的子域名，确认后登记。改展示名称不自动改地址。一个博客使用一个域名、两套独立 Ghost；根入口不是第三套 Ghost。CMS 界面语言与公开博客默认语言无关。

chronoai.example is a reserved example; the real base domain comes from operator configuration. Richard is a display name. Operations assigns an available valid subdomain and records it. Renaming the display title does not change the URL. One domain fronts two independent Ghost instances; the root is not a third instance. CMS interface language does not determine the public blog default language.

## 人工流程 / Manual workflow

1. 领取申请，确认个人或组织归属、博客名称；资料不足时在同一申请中请求补充。
2. 分配一个平台子域名，准备 DNS、HTTPS 和两套 Ghost、数据库及存储。内部服务地址与凭证放受控配置，不让申请人填写。
3. 分别配置 Ghost 的完整公开 URL，包含 /en/ 或 /zh/。代理把两个路径分别转发到对应实例；代理规则必须与 Ghost 子路径配置一致，保留正确 Host 和 HTTPS 信息。
4. 配置精确根路径 / 的固定重定向到 /en/，建议使用 308。语言路径缺少尾斜杠时规范化。不得把所有未知路径或中文故障流量重定向英文，也不应仅按浏览器语言改变同一 URL 的内容。
5. 在 CMS 运维界面登记一次博客根地址，派生两语言 URL，分别核验；再检查根路径重定向及英文目标。全部通过后标记开通完成。

1. Claim the request and confirm ownership and name. Request missing information within the same request.
2. Allocate one platform subdomain; prepare DNS, HTTPS, two Ghost instances, databases and storage. Keep internal endpoints and credentials in controlled operator configuration.
3. Configure each Ghost public URL with its full /en/ or /zh/ prefix. Route each prefix to its corresponding instance; align proxy rules with Ghost subpath configuration and preserve the correct host and HTTPS scheme.
4. Redirect the exact root / to /en/, preferably with 308. Normalize trailing slashes on language roots. Do not redirect all unknown paths or Chinese failures to English, or vary the same page URL solely by browser language.
5. Register one blog root in the CMS operator UI, derive and verify both language URLs, then verify the root redirect and English target. Mark setup complete only after all checks pass.

## 核验与完成标准 / Verification and acceptance

- 每语言：归属与语言绑定、完整 URL 与 HTTPS、正确 Ghost 实例及只读管理连接、署名映射；检查文章链接、图片与主题资源的路径前缀，canonical、sitemap/RSS 和翻译链接。
- 根入口：只检查已登记根地址，确认 / 重定向同域 /en/，英文目标可用且无循环。中文先就绪而英文未就绪时，根入口仍待处理，不能擅自改为中文。
- 存储：配置完整与实际连通/读写验证分别记录；仅查配置不能宣称真实上传通过。此流程不执行文章发布，发布权限和暂停状态独立处理。
- 真实核验由受控 CMS 后端接口执行并记录时间、操作者、目标 URL 和 Trace ID。前端展示结果；原型所有检查、根入口跳转都只是本地模拟。

- Per language: ownership and language binding, full URL and HTTPS, the intended Ghost and authenticated read-only connection, author mapping; validate article, image and theme resource prefixes plus canonical URLs, sitemap/RSS and translation links.
- Root: check only the registered root, verify a same-origin redirect to /en/, an available English destination and no loop. If Chinese becomes ready first, keep the root pending; do not change its default to Chinese.
- Storage: distinguish configuration checks from actual connectivity/read-write verification. Configuration alone does not prove an upload works. Do not publish an article; publishing permissions and paused state are separate.
- Real verification belongs in a controlled CMS backend API with timestamps, operator, target URL and Trace ID. The frontend displays results. All prototype verification and root-entry behavior are local simulations.

## 失败与变更 / Failures and changes

同址下中文失败，只重试中文，保留英文及已通过根入口结果。根入口失败也独立重试。修改共同根地址会影响两种语言，必须确认并重新核验两语言及根入口；不得把旧成功记录应用到新地址。真实已发布站点改址需要另行迁移、旧链接重定向与回滚方案，不包含在首发申请流程中。

At an unchanged root, retry only a failed Chinese site and preserve English and root results. Retry root failures independently. A shared-root change affects both languages and requires confirmation plus full re-verification; never reuse evidence from the old address. Changing a live published blog URL requires a separate migration, old-link redirect and rollback plan, outside initial setup.

## 后续真实接入待办 / Future integration

- 保留站点 URL 的路径；现有登记脚本使用 origin 会丢弃路径，需要后续修改。
- 适配 Ghost API URL 拼接、公开 URL 校验和语言路径归属检查，避免只比较 origin。
- 准备双路径代理、完整 Ghost URL、主题/媒体/翻译链接回归及后端核验接口。
- 原型通过不代表以上配置已落地；发布 Worker 继续暂停。

- Preserve URL paths; the current registration script uses origin and needs later adaptation.
- Adapt Ghost API URL construction, public URL checks and language-path ownership rather than comparing only origin.
- Prepare path routing, full Ghost URLs, theme/media/translation link regression and a backend verification API.
- Prototype acceptance is not deployment acceptance. Publishing Workers remain paused.

参考 / Reference: [Ghost 官方 URL 配置 / Official URL configuration](https://docs.ghost.org/config#url).
