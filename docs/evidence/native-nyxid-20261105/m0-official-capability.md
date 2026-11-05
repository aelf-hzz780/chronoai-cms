# M0：官方 NyxID 原生代理与审批实测

结论：**BLOCKED_NATIVE_ORGANIZATION_EGRESS_AND_FULL_CONTENT_APPROVAL**。这是官方能力探针的缺口判定，不是 CMS 最终验收。正式本地 NyxID、NyxBot、NyxAgent 和既有数据库均未更改；没有第三方发文。

## 固定版本与隔离

- 官方源码：`38bae2f7825bfa70d8a9e4e837118d7d9658e6a5`。
- Backend：`ghcr.io/chronoaiproject/nyxid/backend@sha256:989c2af8e68d843ca2f1e65ab99323d44190f87d16285db49778de37aa59e5f2`，运行 `/health` 返回 `0.75.0`、`38bae2f7825b`。
- Frontend：`ghcr.io/chronoaiproject/nyxid/frontend@sha256:d211a8ca3db156966ea6a2ed2542322ee99c28673a315f19ad1e21d5b20f97c4`。两镜像 OCI revision 均等于固定源码；本探针未运行前端 UI。
- 每次正式复跑创建独立 `--internal` Docker network、独立 Mongo replica set、官方 backend 和本地 HTTP capture provider。无宿主发布端口、无共享 Mongo；脚本结束只停止本次新建的容器，保留可审查状态。
- `issuer=http://localhost:3001` 保留。隔离实例 `BASE_URL` 和对应 audience 为 `http://localhost:33013`，测试只访问其 own network，不变更正式实例或客户端登记。issuer 一致不意味着这些测试签名可用于正式实例：测试生成独立 4096-bit RSA keys。
- 邮箱、人员、组织、Agent Key、OAuth introspection client 都在隔离实例创建。仅注册邀请开关和审批 timeout 使用明确记录的 fixture 数据配置。成员删除、连接停用/换绑、审批决定及源 Key 删除通过官方 API 完成。

## 真实调用链与屏障

`测试 Member 的 Agent Key → 官方 proxy /m0-cms/mint → 官方签发 identity + service-origin delegation → retained delegation → 官方 proxy /m0-provider/articles → 原生组织 Admin PerRequest 审批 → 本地 provider`。

凭据由官方运行实例签发，未在测试端自行签造。服务配置的原生 scope 为 `account:read proxy:*`；尝试 `openid profile proxy` 会被官方配置校验拒绝。签名 claims 明确为 `delegation_origin=service`、`act.sub=m0-cms`，没有 OAuth receiving client。`/delegation/operation-catalog` 不适用于这一凭据类别；增加 scope 配置不能改变来源类别。

每个屏障场景先等待官方 approval record 成为 `pending`，并检查 provider capture 数未变，再执行变更并由原 Admin 批准。并未把 CMS 调用代理前的检查当成真正出站前检查。

| 场景 | 接收数：调用前 → pending 屏障 → 处理后 | 观察 |
|---|---:|---|
| 原生 Admin 批准 | 0 → 0 → 1 | HTTP 200，原缓冲正文发送一次 |
| pending 期间通过官方 API 退组，再批准 | 1 → 1 → 2 | **仍发送，HTTP 200** |
| pending 期间通过官方 API 停用连接，再批准 | 2 → 2 → 3 | **仍发送，HTTP 200** |
| pending 期间通过官方 API 更改 endpoint URL，再批准 | 3 → 3 → 4 | **仍向已解析旧路径发送，HTTP 200** |
| 原生拒绝 | 4 → 4 → 4 | HTTP 403，未发送 |
| 原生 8 秒 timeout | 4 → 4 → 4 | HTTP 403，未发送；未直接修改审批状态 |
| 尝试 DELETE pending request，再批准 | 4 → 4 → 5 | DELETE 返回 405；原请求仍可被批准发送 |
| pending 期间客户端真实断开，再批准 | 5 → 5 → 5 | 此次观察未发送；没有服务端取消 receipt |
| provider 已收到后客户端丢响应 | 5 → 5 → 6 | 客户端 timeout；只读 capture 对账确认一次，无重发 |

原生拒绝、超时和一个先行断开场景有效，并不能修复退组、停用和换绑反例。断开与批准可能竞争，普通 API 没有让 CMS 在审批完成后重新取得执行权、确认取消已生效或提交最终出站许可的接口。不能将尽力轮询加 AbortController 描述为满足出站前业务复查。

## 审批内容缺口

本地 provider 收到完整 `body_markdown` sentinel，但普通 approval record 和公开 approval API 均未包含完整正文；`tool_arguments=null`、`exact_service=null`。公开描述为 `POST /articles`，只有 method/resource/verb/短描述。

这证明批准动作未证明 Admin 看见并批准该全文。自定义服务的 `service_id` 恰与 connection id 相同；本次没有把这一点误报为 catalog 连接绑定实测。源码中的普通审批结构没有独立的连接 fingerprint、body hash、operation generation；endpoint 换绑仍发送的反例进一步证明缺少这项当前状态复查。CMS 展示完整冻结预览是必要条件，但单靠预览无法与这次原生批准及最终请求建立可审查的完整绑定。

## 原生凭据生命周期

- 删除原 Agent Key 后，新 proxy 请求为 HTTP 401；已签发 service delegation 的原生 introspection 在删除前后均为 `active=true`。
- 对普通 service delegation 调用 `/oauth/revoke` 返回 HTTP 200，随后 introspection 仍 active。RFC 7009 的 200 不能当成这类 token 已撤销。
- 自然经过原生 300 秒 token TTL 及 verifier 的宽限后，introspection 为 `active=false`。探针未更改服务器时间或 token claims。
- 辅助观察：超过 token `exp` 35 秒时官方 introspection 仍可能 active（默认 JWT 宽限）。CMS 仍必须按签名 `exp` 严格拒绝到期凭据，不能根据 introspection 延长凭据。

## 源码定位

以下均是固定官方 commit 上的源码，不是本地补丁：

- [普通审批写入字段](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/services/approval_service.rs#L647)：`tool_arguments=None`，普通 descriptor 不建立 exact-service binding。
- [proxy 等待后续发](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/handlers/proxy.rs#L4687)：批准后继续，`revalidate_after_approval` 只适用 `assistant_chat`。
- [service-origin 不自动获得 assistant context](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/mw/auth.rs#L1397)。
- [无 assistant context 时 admission=None](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/services/assistant_service_execution/http.rs#L280)。
- [非 assistant、非 machine 的 proxy 不取得专用 egress guard](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/services/assistant_service_execution/egress.rs#L297)。不能把 assistant 专用保护代入 CMS retained delegation 路径。
- [普通审批 routes](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/routes.rs#L1572)：list/get/decide，删除接口只适用于 grants。
- [断开连接控制](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/downstream_disconnect.rs#L49)；[普通出站调用](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/handlers/proxy.rs#L6731)。这不是 CMS 可确认的审批事务取消 API。
- [service delegation 的官方签发](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/crypto/jwt.rs#L1041)；[stateless access-token revoke 语义](https://github.com/ChronoAIProject/NyxID/blob/38bae2f7825bfa70d8a9e4e837118d7d9658e6a5/backend/src/handlers/oauth.rs#L3713)。

## 复跑

本机需已有上述两个官方镜像、`mongo:8.0`、Node 24 runtime image、Docker、Python 3 和 OpenSSL。无需 npm，也不运行会清理共享数据库的 test helper。

```bash
python3 scripts/native-nyxid-m0.py \
  --output /absolute/new/evidence/directory \
  --docker-context colima-blogsystem \
  --wait-expiry
```

`--output` 必须是新目录。`--wait-expiry` 会自然等待约 6 分钟，不执行外部写或重发。省略它只跳过凭据自然到期观察，审批 timeout 仍会实测。结果是该目录的 `result.json`；`private/` 是独立 fixture secrets，不得提交或公开。脚本使用独立 network/subnet，无宿主端口映射，避免现有 3000/3001/3457/3458/37018/27019。

提交的 `m0-result.json` 是一次从新建实例得到的脱敏证据。`m0-expiry-observation.json` 保存另一次前序探针对 JWT 宽限后自然到期的观察。没有以历史 R031 或本地模拟结果代替本次官方能力证明。

## 未执行与交付边界

没有执行真实 CMS Publisher 撤销、CMS 取消或 CMS 原文更新的待审批屏障；没有执行真实 NyxBot 对话、官方门户审批 UI、真实 DEV/组织发文。它们在结果 `notExercised` 中明确列出。没有宣布这些场景通过。

M0 的退组、停用/换绑和全文审批缺口已足以阻止现有 service-origin 普通 proxy 作为组织自动外部分发最终交付路径。需要官方已支持、能准确绑定全文和连接且允许 CMS 在最终出站前重新验证业务状态的机制；本轮未发现满足这两项的受支持路径。不得关闭原生审批、套用管理员凭据、修改 NyxID/NyxBot 或悄悄切成人工流程来宣称完成。CMS 其他独立修改可以交付，正式切换继续阻塞并保持出站暂停。
