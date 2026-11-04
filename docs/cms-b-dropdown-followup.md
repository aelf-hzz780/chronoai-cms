# Studio 下拉修复 / Studio picker follow-up

2026-11-04：工作区与界面语言下拉改用 B 方案的白色圆角浮层、淡紫选中态及勾选。工作区名称与类型/角色分行，登录页及窄屏菜单保持在视口内。现有原生 select 值及 change 处理器继续管理工作区与语言，服务端、API 和权限规则未变。

2026-11-04: Workspace and interface-language pickers now use the B design's rounded white popovers, lavender selection and checkmarks. Workspace names and type/role are separated; login and narrow-screen menus stay within the viewport. Existing native-select values and change handlers remain authoritative; server, API and permission behavior is unchanged.

## 验收 / Acceptance

- `npm run check`：typecheck、Studio build、421/421 测试通过，无失败或跳过。
- `node --test test/studio-live-api.integration.ts`：7/7 实际 CMS API 浏览器流程通过，无失败或跳过。
- 新增回归覆盖：键盘高亮与提交、Escape/Tab、点外部关闭、单浮层、相同选项不重载、重绘后焦点恢复、界面语言与文章语言独立、拒绝切换后保留工作区和未保存内容、390/820/1440px 菜单边界及 390px 登录页。
- 两项新增测试先在旧实现失败；登录页左溢出也先复现再修正。桌面展开效果已在本地 4174 预览核验。

- `npm run check`: typecheck, Studio build and 421/421 tests pass, with no failures or skips.
- `node --test test/studio-live-api.integration.ts`: 7/7 actual CMS API browser flows pass, with no failures or skips.
- Added regression coverage checks keyboard highlight versus commit, Escape/Tab, outside dismissal, a single open menu, no reload for unchanged selection, focus after redraw, independent interface/article languages, preservation of owner and unsaved content after a rejected switch, 390/820/1440px bounds and the 390px login page.
- Both new tests failed against the previous implementation; the login overflow was also reproduced before fixing. Expanded desktop menus were visually checked in the local port 4174 preview.

日志、源代码与构建产物指纹、展开截图见 [本次证据](evidence/cms-b-dropdown-20261104/)。旧验收证据保持原样。浏览器流程使用实际 CMS 服务、SQLite、session/CSRF，以及隔离的身份和外部平台 fixture；这不代表真实 NyxID 或外部分发联调完成。

See [follow-up evidence](evidence/cms-b-dropdown-20261104/) for logs, source/build fingerprints and expanded screenshots. Earlier acceptance evidence is preserved. Browser flows use actual CMS services, SQLite and session/CSRF with isolated identity/external-provider fixtures; they do not establish real NyxID or destination integration.

## 交付边界与回滚 / Delivery boundary and rollback

这次仅修复前端控件；若需回滚，可撤销本次 UI 修改并重新构建 Studio，不涉及数据迁移。真实 NyxID 联调继续后置，PR 创建按用户要求暂缓，不合并、不部署。

This is a frontend-control fix. Roll back by reverting its UI changes and rebuilding Studio; no data migration is involved. Real NyxID integration and PR creation remain deferred at the user's request; no merge or deployment is performed.
