# W1 本地授权与 NyxID service 验收

## 版本与范围

本记录针对 Gist v0.7（revision `79e69842f5bacba7f8204f62d151018bacf98d91`）的 D2、D3、D5 及缺陷 R031。业务版本固定为 BlogSystem `0b0e9d11dacd0c4c069bc0ee9ce8706142036922`、本地 NyxID backend `049ee1c2ca811a002590dc8330ce646078bb1158`；backend binary SHA-256 为 `37bbb047eef49e460bde3b8acb669bcecafe1439aec1d05565a0813e1e41a7e1`。本次没有修改业务源码。

R1–R10、D1–D9 和适用 A01–A52 保持原范围。本次不增加所有 NyxID 凭证/transport 支持、定时发布、自助开站、个人 Hashnode 或额外语言/平台。显式补图、单独 sync-links 是实现选择；原文没有给定数字 RPO/RTO SLA。

## 已验证的 service 路径

选定路径为个人所有、精确选择的 NyxID UserService，经 HTTP proxy 携带签名 identity、delegation 和 command-authority。调用结构为：

```text
/api/v1/proxy/s/<registered-slug>/api/service/<operation>?_nyxid_via=<UserService-id>
```

W1 专用 catalog 使用 `auth_method=none`、JWT identity propagation、delegation 注入、注册 confidential introspection client。每个实验 key 仅允许该具体 UserService，不启用所有服务或自动连接服务。所有操作保留 NyxID 逐请求执行审批；审批列表没有 `requester_id`，必须由原始请求凭据调用正式 `/approvals/requests/<id>/status` 绑定后才决策。需要审批的 GET 同样遵循此流程。此审批不构成额外 Editor 或强制第二人编辑审核。

CMS 通过真实 web 登录及 OIDC Authorization Code + S256 PKCE、精确资源 consent、callback 创建 session。service 操作直接完成内容管理、Markdown 获取、状态查询和发布生命周期，无需回 CMS 完成授权操作。

服务保存原命令 proof/descriptor，并将 `jti` 绑定业务命令。ReleaseWorker、DeliveryWorker 在执行及最终 `beforeWrite` 边界重查实际来源和当前业务权限。组织 Member、Publisher、Admin 的权限来自当前 membership 与平台发布角色；个人所有权独立。外部组织写入的 NyxID exact Admin authorization 仍是独立要求，本次 `local_test` 目标不证明该外部流程。

## 隔离与证据解释

W1 使用独立 checkout、分支、`3558` API/SQLite volume、新四个用户、新组织、新 client/catalog/UserServices；没有普通 Worker daemon。每次只执行明确选中的新命令并恢复出站暂停。DeliveryWorker 使用独立 `3559` API/volume，原 `3457` SQLite 仅在线只读备份到独占临时文件。共享 NyxID 原用户、角色、服务、key 和运行 Worker 不作暂停或撤销。

真实 Ghost 测试仅使用既有本地四站 `3468/3469/3478/3479` 的明确新样本。新路径的无图 Ghost 正控与 `0b0e9d1` 已有 CMS 四站图片证据衔接，不能声称本次重新验证了完整图片链。安全 adapter 和 `local_test` 目标的计数只证明来源/权限拦截，不代表 Ghost 或 DEV/Hashnode Live。

原始详细证据位于主工作区 `.runtime/acceptance-review/parallel-local-20261102/w1/`。凭据及原始运行文件保留在权限受限的 private 子目录，不进入 Git。最终可移交结果与文件摘要见本目录对应的脱敏 JSON 证据。

## 验收状态

**通过，限固定版本的本地 W1 范围。** 独立审查结论为 `PASS_BOUNDED_R031_SELECTED_LOCAL_SERVICE_PATH`，本范围无剩余业务阻塞。R031 在选定 service 路径闭合；本记录不直接更新父任务管理的总验收状态。

| 检查 | 实际结果 | 证据边界 |
| --- | --- | --- |
| 原 R031 组织来源 scope 移除、key 删除 | Worker 内普通 delegation 仍 active，command proof inactive；blocked、零 adapter/写入 | 新增两个组织反例；复用同版本已有九组 parent/child 来源控制 |
| Member / Publisher / Admin 与撤权 | Member 组织草稿创建、编辑、提交成功；组织 publish/update/unpublish 拒绝；五组 Worker 正反控通过 | Admin 接受提交稿、Member 个人发布、排队/最后发送前撤 Publisher、真实 NyxID 退组；目的地是 safe adapter |
| DeliveryWorker 来源 fence | 有效来源一次 fixture 写入；scope 恢复不能复活旧 proof；最后发送前撤 key 后零写入 | 三组真实 source/Policy/Worker 控制；`local_test` 目标不代表 provider Live |
| CMS/service 对齐 | 十项通过；177 字节含 BOM、CRLF 和中文的 Markdown 原字节一致 | 真实 OIDC/PKCE、文章/search、原 `.md`、文件 envelope、queued/cancelled 状态、代表性 metrics 与 availability |
| 真实本地 Ghost | 四发布、两更新、四下线通过 | solo 个人 EN/ZH、Publisher 自有组织 EN、Admin 自有组织 ZH；EN 更新覆盖个人与组织 |
| 清理与环境保留 | 四篇新公开页均 404；测试 key 撤销、注册停用、测试用户停用；3558/3559 停止 | 新组织、私有草稿、不可变历史、独立 SQLite/volume 保留供审查；原 3457 health 正常、outbound 未暂停、active jobs 为 0 |

所有 Ghost 操作均由新 service 请求、新审批和真实 Worker 执行，同一隔离 API 查询得到实际 published/unpublished 状态；没有用手写 publication 状态替代 Ghost 结果。四站新正控不宣称当前版本所有 actor × 入口 × language 的完整交叉矩阵：Member 个人发布及 Admin 发布 Member 提交稿另由 safe adapter 覆盖。

metrics 仅规范化每次查询生成的 `distribution.updated_at`，并按独立测量的 Docker VM 时钟范围检查；其他 source/readership/external 更新时间仍参与相等比较。本次不重复未受影响的真实流量收集套件。早期 harness 的参数、只读 SQLite 打开、时钟窗口、错误清理 actor 和 OAuth client HTTP method 问题保留原记录，并有后续通过或清理读回；它们不作为当前业务缺陷。

可移交的脱敏结果、Trace ID、命令证明摘要及证据文件 SHA-256 见 [w1-local-authorization-20261102.json](evidence/w1-local-authorization-20261102.json)。详细证据保留于上述本地证据目录；其中 `summary.json`、`final-independent-review.json`、`cleanup.json`、`postflight.json` 与 `retained-data.json` 分别记录结论、独立复核、清理、原环境保留及最终 SQLite 的完整性。

W2 的 `83b4b8e5fa28cb18a6926f3a10d2205e04f49ab1` 修改了 pending media 的恢复行为。该版本不属于本次 W1 固定业务版本；合并后仍须对只读 reconcile 的当前 actor、旧 media history 终止及新 materialize-media 授权做相关复验。两个任务分别通过不等于同一最终版本整体通过。

本地 NyxID 补丁仍是依赖；本任务没有向上游 push/merge。外部平台 Live、目标生产环境及整体 D1–D9 交付不在本次结论内。如需复现实验，应恢复保留的独立实例，重新启用专用测试账号与注册，并重新签发凭据、取得新的逐请求审批；已撤销 key 和旧 command proof 不得复用。不得回退为没有来源证明的排队写入，也无需改变原 3457 环境。
