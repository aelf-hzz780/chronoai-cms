# 开发运行与验证

需要 Node.js 24.18.x、npm，Ghost 本地联调另外需要专用 Docker context。先执行 `npm ci`，然后 `npm run check`。测试不连接真实账号、不发布外部文章，不需要秘密配置；测试中的注入身份只存在测试构造器，生产入口没有测试登录开关。

## 运行平台

复制根目录 `.env.example` 为 `.env` 并设置 0600，填写目标 NyxID 环境与随机密钥后：

```bash
npm run dev
npm run worker
```

API 默认监听 127.0.0.1:3100。生产使用 HTTPS，关闭 `ALLOW_LOOPBACK_HTTP`，配置受控反向代理。CMS `/` 与 `/api/cms/*` 使用 NyxID 会话和 CSRF；NyxID 服务 `/api/service/*` 使用签名 `at+jwt` 和独立 audience。所有受保护用例重新验证当前授权，不信任裸身份头。

真实 issuer/token 类型、scope 和 Authority bridge 尚待目标环境确认；如果目标 NyxID 提供不同正式机制，应在 Adapter 中按已验证契约接入，不能关闭验签或绕过批准。没有这些配置时不能宣称完成 NyxID Live 登录／服务验收。

## 运维协助开通

个人账号首次 OIDC 登录自动建立相同 issuer+subject 的个人 owner。组织由运维按权威组织标识配置，业务角色仍实时由 NyxID 查询。CLI 从环境读取数据库路径；示例全为占位值：

```bash
node --env-file=.env scripts/provision.ts owner org-demo organization https://issuer.example org-subject
node --env-file=.env scripts/provision.ts site org-en org-demo en http://localhost:2568 GHOST_ORG_EN_KEY
node --env-file=.env scripts/provision.ts author org-en 'Example Author' ghost-staff-id
```

每个 owner×language 都必须独立配置 Ghost。`keyRef` 只保存环境变量名；真实 integration key 留在私有环境／secret manager。署名需要映射到该 Ghost 的实际 staff author，缺映射明确阻止发布，不冒用运维作者。

私有图片保存在平台数据库。公开图片目录 `${PUBLIC_MEDIA_DIRECTORY}/<siteId>` 必须另行挂载到对应 Ghost 的 `/var/lib/ghost/content/images/chrono`；正文确认实际上线之后才物化公开图片。Ghost 直接提供公开素材，不依赖业务 API 存活。未配置挂载时图片核验失败，发布不能被标为完整成功。

## 当前测试边界

`test/content.test.ts`：个人／组织权限、角色管理、退组、scope、原文字节、不可变 revision、冲突和冻结提交。

`test/auth.test.ts`：真实本地签名验证反例、加密会话、CSRF、删除会话重放；未替代目标 NyxID OIDC 流程。

`test/http.test.ts`：CMS／service 内容路由参数化，下载、越权、冲突、分页和预览净化。

`test/publishing.test.ts`：确认版本、幂等、执行前撤权、核验失败和 uncertain 不盲重发。Ghost Adapter 实机证据尚未执行；现有阶段 0 证据只覆盖旧实验脚本。

完整状态见 delivery-status.md；独立验收由原任务负责。
