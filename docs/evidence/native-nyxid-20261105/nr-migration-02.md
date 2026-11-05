# NR-MIGRATION-02 / Interrupted staging recovery

独立审查对象：`c7e9376f2110a6085d0c318c3bbabc526de52087`。级别 P1。复现是 official candidate 已由 Docker 创建，但 `candidateContainers` 仍为空的持久 `STAGING` 状态。旧 CLI rollback 返回 `CANDIDATE_CONTAINER_CHANGED`，没有调用 stop，不能恢复旧实例。原独立审查记录保留在协调方 runtime 的 `independent-review/NR-MIGRATION-02/result.json`，本修复没有覆盖它。

Independent review targeted `c7e9376f2110a6085d0c318c3bbabc526de52087` and classified this P1. Docker candidates existed while durable STAGING still had an empty candidate list. The previous rollback CLI returned CANDIDATE_CONTAINER_CHANGED without stopping candidates or restoring the prior runtime. The coordinator's original independent-review/NR-MIGRATION-02/result.json remains unchanged.

修复在启动前保存不可缺省的 attempt UUID、manifest fingerprint 和实际 image IDs，并将部署标记带入 compose。重启后的 `STAGING` rollback 验证这些标记及 project/service/镜像引用/config路径，恢复缺失的候选 ID 后只按完整 ID 停止。完整停机检查仍先于恢复旧 backend。缺少身份或命中其他部署时明确要求人工恢复，执行零 stop、零旧 backend 恢复；旧无标记状态不自动升级。

The fix persists attempt UUID, manifest fingerprint and actual image IDs before startup and includes deployment labels in compose. Restarted STAGING rollback checks those anchors plus project, service, image reference and config path, recovers missing IDs and stops only complete IDs. Stopped-state inspection remains before restarting the old backend. Unproven or foreign identities require manual recovery with zero stops and zero previous-backend restarts. Unlabelled legacy state is not auto-upgraded.

可复跑：`node --test scripts/native-nyxid-migration.test.ts`。本轮 TDD 首次结果为旧 11 项通过、新 2 项失败，正向新 CLI 用例复现 `CANDIDATE_CONTAINER_CHANGED`；修复并增加更多身份反例后为 **14 PASS**。`npm run typecheck` 和 `git diff --check` 同时通过。新增三个测试含多个独立 CLI 子场景，具体是：

Reproduce with `node --test scripts/native-nyxid-migration.test.ts`. The first TDD run passed the existing 11 tests and failed 2 new tests; the positive restarted-CLI case reproduced CANDIDATE_CONTAINER_CHANGED. After fixing and extending identity negatives, **14 tests pass**. Type checking and diff whitespace validation also pass. The three new tests contain multiple isolated CLI scenarios:

| 场景 / Scenario | 预期与实际 / Expected and observed |
| --- | --- |
| `STAGING` IDs 为 `[]`、缺失、仅 backend / Empty, missing, backend-only IDs | 新 Node CLI 发现两个 owned candidate，精确 ID stop，逐个 inspect 已停止，随后恢复旧 backend；最终 `ROLLED_BACK_PAUSED` / Discover owned candidates, stop exact IDs, inspect stopped, then restore previous; final ROLLED_BACK_PAUSED |
| 同 project、同镜像但不同 run label / Same project/images, foreign run label | 人工恢复错误；零 stop、零旧 backend 恢复 / Manual recovery error, zero stops, zero previous restart |
| 错误 manifest、actual image ID、compose 路径、重复 service / Wrong manifest/image ID/compose path or duplicate service | 同上，不能仅靠项目名或镜像名认领容器 / Same refusal; project/image names alone cannot claim a container |
| 缺失旧 attempt 元数据 / Missing legacy attempt metadata | 不补造身份；保留 `STAGING` 并明确人工恢复 / Do not fabricate identity; retain STAGING and require manual recovery |

边界：这里是真实 CLI 进程与合成数据库/fake Docker 的 Local 编排行为验证，未执行正式容器启停、Mongo 写入、数据库恢复、服务注册变更或发文。它不代替官方镜像、真实切流 hook 和独立验收。根代理将为本修复提交新的固定 SHA，协调方须按该 SHA 复验；此记录不是自行签收。

Boundary: these Local tests exercise real CLI processes with synthetic databases and fake Docker. They do not start/stop production containers, write Mongo, restore databases, change registration or publish content. They do not replace official-image, real-hook or independent acceptance checks. The root agent will publish a new fixed commit for independent revalidation; this record does not self-approve it.
