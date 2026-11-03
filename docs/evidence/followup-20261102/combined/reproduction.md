# 联合补验复跑约定

此包为可移交脱敏结果，不包含能登录任何环境的凭据，也不把被省略的私有数据库冒充可公开原始数据。`manifest.json` 的路径均相对此目录；先核对每个文件的 SHA-256，再读 `run-index.json` 中原始失败、主通过、补充恢复与诊断的分别结论。`fixed-source-lock.json` 固定实际运行的 133 个 Git 文件，最终交付若仅追加文档，仍应核对业务树与该版本相同。

本地复跑需要原生 NyxID backend `049ee1c2ca811a002590dc8330ce646078bb1158`（独立本地补丁，不是官方上游原版）、Blog `386b9652dc431bb83e4864d5b046b378110ee88d`、Node 24.18、Docker/Chromium、具备已配置作者及私有 staging 的本地 Ghost。配置文件的 secret 字段由实际环境注入。不要把已有测试 key 重新启用。

1. 通过正式 Nyx HTTP API 创建专属 Admin/Publisher 用户、新组织、新 client/catalog/精确 UserServices。catalog 采用 `auth_method=none`、JWT identity、delegation、精确 confidential introspection trust；所有 proxy 选择 `_nyxid_via=<当前自己的UserService>`。使用逐请求正式审批，先用原请求凭据验证 `/approvals/requests/{id}/status` 再决定。
2. 创建全新隔离 API/SQLite volume，先 inspect 新卷名称/创建时间和空目录，seed 前确认 owners/sites/articles/jobs 均为空。无 Worker daemon，先暂停出站。保持现有用户运行系统可用。每个 Worker 前核对 source-lock SHA；重浏览器阶段使用独占锁并 finally 释放。
3. 以 Publisher 正式 service 调用新建一篇组织 EN 样本，上传两张自己生成的私有 PNG，确认精确 revision、owner、署名及图片权利。真实 Ghost publish 成功后，仅在测试 adapter 的首轮 materialize 返回 false，构造已存在原文、图片尚未公开的 verifying 状态；不能伪造 Ghost remote ID 或直接捏造已发布状态。
4. 分别创建旧 active/revoked media 命令，以当前 Admin 正式 reconcile。真实 Worker 必须只读，Ghost POST/PUT/DELETE 与 materialize 计数均为零；old Actor 密文哈希、confirmation digest、public_files 不变。读取真实旧 command-authority introspection 的 active/inactive，当前 Actor 可读认回。补充检查原 release Actor/revision、projection count 不变。
5. 使用实际 `snapshotPlatform` + `encryptArchive`/`decryptArchive` + `isolateRestoredPlatform`。将隔离 API 的 DATABASE_PATH 指向恢复出的新库并重启该隔离 API，读回 source-lock、暂停状态。旧 queued media 进入 blocked；所有后续正式 Admin role API 与 Worker 必须指向同一个恢复库。
6. 在恢复后的库上发起 fresh `materialize-media`，分别撤销真实来源 key、真实组织 Publisher 角色：一组在 Worker 执行前，另一组在 `GhostAdapter.materialize` 第二次 `beforeMaterialize`（私有写已完成、最终 atomic rename 前）。必须零 Ghost 写、零公开图片，分别得到 IDENTITY_UNAVAILABLE/FORBIDDEN。不得用替换 Authority 代替真实 Nyx 来源检查。
7. 另一 fresh 请求让第一张 PNG 真正 atomic rename 并记录 public_files=1，在下一张图片最终 guard 前，用 SQLite backup 捕获 request/job 仍 running 的一致快照，再实际加密/解密/isolate。此处是受控 crash cut，不宣称真实 OS 进程被断电，也不重复 W2 全四站恢复。旧请求恢复为 partial，Actor/digest/public_files 保留；当前 Admin 只读认回不写新图片。
8. 当前 Admin 另发 fresh 授权补齐剩余图片，真正 Ghost 公网路径读回原 PNG bytes/hash，release published，新请求 complete/public_files=1，旧请求 partial/public_files=1 不变。以同一 Publisher 身份的新 active key 重放旧幂等 confirmation，必须返回同一 terminal request、历史不变；出站开启时 ReleaseWorker.once 返回 false。
9. 用正式新授权下线每篇本任务样本并读回精确 URL404。撤销自己的 keys、停用自己的用户/registrations/connections，停止自己的 API、保留独立 volume 和私有证据；原用户 CMS、Nyx、四 Ghost/baseline保持可用。

仓库侧可先执行 `node --test test/recovery-media.test.ts test/media-authority.test.ts` 检查本次边界，但这不能替代以上真实 Nyx+Ghost 复跑。原本机驱动是父工作区 `.runtime/acceptance-review/parallel-local-20261102/followup/combined/` 的 setup.py、suite.py、supplement.py、reconcile-supplement.py 和 worker.mjs；驱动含本机 fixture 配置位置，迁移时需按以上隔离配置重新生成，不要直接复制旧 env 或复活旧对象。

补充单图首次 post-materialization verify=false 的内部原因未定位。已确认：系统保守保留 partial；独立当前 Admin 只读认回在原生产 renderer 下以同 remote ID/URL/revision/image hash 成功，且没有重发/补图。一次加日志 renderer 副本诊断未复现，该诊断仅解释边界，不能替代原版主 13 项的 PASS，也不能据此宣称原因已解决。
