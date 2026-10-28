# 开发运行与验证

范围以 `docs/source/` v0.7 原文为准。Node.js 24.18.x、npm；先 `npm ci`，再 `npm run check`。生产没有测试登录开关，合成身份仅通过测试构造器注入。当前项目没有 Spec Kitty。

## 本地运行

复制 `.env.example` 为私有 `.env`（0600），填写实际 NyxID 注册参数、独立随机 ENCRYPTION_KEY / TRACKING_SECRET。启动：

```bash
npm run dev
npm run worker
```

API 默认 127.0.0.1:3100，CMS `/`，机器可读契约 `/openapi.json`。CMS `/api/cms/*` 使用 NyxID OIDC 会话与 CSRF；服务 `/api/service/*` 接受人类 access token，或同时验证签名 identity assertion + delegated access token。原生 NyxID access JWT 使用 payload `token_type:access`；不要求虚构的 `at+jwt` header。ID token、裸身份头、service-account、relay token 不能替代调用人。当前成员、原 scope、连接来源与精确批准都在线检查，失败即拒绝。

NyxID 已按官方 revision `38bae2f7825bfa70d8a9e4e837118d7d9658e6a5` 实现 native API 契约，详见 `nyxid-registration.md`。尚无目标实例 Live 注册／登录／批准证据，本地签名与契约回归不能替代 Live。

## 站点与素材

个人首次 OIDC 登录建立相同 issuer+subject 的个人 owner；组织 owner 由运维绑定权威组织 ID。以下占位值不包含秘密：

```bash
node --env-file=.env scripts/provision.ts owner org-demo organization nyxid actual-org-id
node --env-file=.env scripts/provision.ts owner-name org-demo 'Example Organization'
node --env-file=.env scripts/provision.ts site org-en org-demo en https://en.example GHOST_ORG_EN_KEY
node --env-file=.env scripts/provision.ts admin-site org-en http://127.0.0.1:2578
node --env-file=.env scripts/provision.ts author org-en 'Example Author' actual-ghost-staff-id
```

每个 owner×language 独立 Ghost 安装。署名必须映射真实 Ghost staff author；密钥仅从 keyRef 对应环境变量读取。公开 HTTPS 与私有 loopback Admin route 分开；普通业务用户不获得 Ghost Admin。详见 `operations.md`。

私有图片在 SQLite BLOB 中。`${PUBLIC_MEDIA_DIRECTORY}/<siteId>` 通过 `infra/platform/ghost-media.override.yaml` 挂入对应 Ghost `content/images/chrono`。正文经 Admin 与公开页完整核验后才物化图片，随后校验公开 MIME 和 SHA-256。业务进程关闭后，公开正文与图片仍由 Ghost 提供。

## 验证分层

```bash
npm run check
node --check web/app.js
node scripts/test-local-four-ghost.mjs
node scripts/source-fingerprint.ts
```

前两项不连接真实账号。四站 harness 仅用于本任务已准备的 `colima-blogsystem`，不自动启动 Docker、不拉镜像、不改默认 context；临时 helper 使用缓存官方 Ghost 内置 Node22.23.4，真实应用支持运行时仍是主机 Node24.18。默认 Ghost Adapter 和共享文件系统未替换，覆盖 personal/organization × en/zh × CMS/service 八组合及素材、指标、译文互链、下线。证据生成于 `.runtime/blogsystem-integration-*/evidence.json`，含源码逐文件指纹，不含账号秘密。

恢复 CLI 与隔离演练见 `operations.md`。`test/*.integration.ts` 不是默认单测的一部分。已完成局部不等于 A01–A52 所有参数组合完成；独立验收由原任务执行，状态见 `delivery-status.md`。
