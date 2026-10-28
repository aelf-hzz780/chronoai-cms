# 交付状态（开发台账，不是独立验收结论）

分支：`codex/003-blogsystem-delivery`；工作树：`/Users/richardhuang/.codex/worktrees/6898/BlogSystem`。
基点：019222c。增量 I1：5eb51a7。原任务独立结论 CHANGES_REQUESTED；R001–R005 修复见 review-i1-fixes.md，待独立复验。

状态含义：not_started / implemented / verified / blocked。implemented 表示已有部分实现，不代表整个场景完成；verified 必须注明证据范围。Document / local / live 分层互不替代。**D1–D9 独立验收仍全部未通过。**

## 增量 I1

权限、不可变源文、投稿、双入口内容 API／CMS、OIDC 客户端和签名服务鉴权、原文确认／outbox／Worker／Ghost Adapter。
验证命令：`npm run check`（strict TypeScript + 11 项本地测试）；历史 Python 实验尚未重跑。未执行目标 NyxID、四 Ghost 集成或外部平台 Live 验证。

## D1–D9

| 交付 | 开发状态 | 证据层级 | 缺口 |
|---|---|---|---|
| D1 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D2 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D3 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D4 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D5 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D6 | not_started | document | 完整场景与Live/运维证据待补；非验收通过 |
| D7 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |
| D8 | not_started | document | 完整场景与Live/运维证据待补；非验收通过 |
| D9 | implemented | local（局部） | 完整场景与Live/运维证据待补；非验收通过 |

## A01–A52

以下映射为增量局部覆盖，不表示已跑完角色×owner×语言×双入口×时序组合。命令统一 `npm run check`；对应代码批次 I1。后续真实运行证据必须另附时间、环境、revision、Trace ID 和结果。

| 场景 | 开发状态 | 自动测试映射 | 层级／未通过部分 |
|---|---|---|---|
| A01 | not_started | — | 尚未执行 |
| A02 | implemented | auth.test.ts | local 局部；完整组合未验证 |
| A03 | implemented | auth.test.ts | local 局部；完整组合未验证 |
| A04 | not_started | — | 尚未执行 |
| A05 | not_started | — | 尚未执行 |
| A06 | implemented | http.test.ts | local 局部；完整组合未验证 |
| A07 | implemented | http.test.ts | local 局部；完整组合未验证 |
| A08 | implemented | http.test.ts | local 局部；完整组合未验证 |
| A09 | implemented | auth.test.ts / http.test.ts | local 局部；完整组合未验证 |
| A10 | implemented | content.test.ts | local 局部；完整组合未验证 |
| A11 | implemented | content.test.ts | local 局部；完整组合未验证 |
| A12 | implemented | content.test.ts | local 局部；完整组合未验证 |
| A13 | implemented | content.test.ts / http.test.ts | local 局部；完整组合未验证 |
| A14 | implemented | content.test.ts | local 局部；完整组合未验证 |
| A15 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A16 | implemented | content.test.ts | local 局部；完整组合未验证 |
| A17 | implemented | content.test.ts / http.test.ts | local 局部；完整组合未验证 |
| A18 | implemented | content.test.ts / http.test.ts | local 局部；完整组合未验证 |
| A19 | implemented | http.test.ts | local 局部；完整组合未验证 |
| A20 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A21 | not_started | — | 尚未执行 |
| A22 | not_started | — | 尚未执行 |
| A23 | not_started | — | 尚未执行 |
| A24 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A25 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A26 | not_started | — | 尚未执行 |
| A27 | not_started | — | 尚未执行 |
| A28 | not_started | — | 尚未执行 |
| A29 | not_started | — | 尚未执行 |
| A30 | not_started | — | 尚未执行 |
| A31 | not_started | — | 尚未执行 |
| A32 | not_started | — | 尚未执行 |
| A33 | not_started | — | 尚未执行 |
| A34 | not_started | — | 尚未执行 |
| A35 | not_started | — | 尚未执行 |
| A36 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A37 | not_started | — | 尚未执行 |
| A38 | implemented | publishing.test.ts | local 局部；完整组合未验证 |
| A39 | not_started | — | 尚未执行 |
| A40 | not_started | — | 尚未执行 |
| A41 | not_started | — | 尚未执行 |
| A42 | not_started | — | 尚未执行 |
| A43 | not_started | — | 尚未执行 |
| A44 | not_started | — | 尚未执行 |
| A45 | not_started | — | 尚未执行 |
| A46 | not_started | — | 尚未执行 |
| A47 | implemented | auth.test.ts / http.test.ts | local 局部；完整组合未验证 |
| A48 | not_started | — | 尚未执行 |
| A49 | not_started | — | 尚未执行 |
| A50 | not_started | — | 尚未执行 |
| A51 | not_started | — | 尚未执行 |
| A52 | not_started | — | 尚未执行 |

## 外部 BLOCKED

- B1：真实 NyxID issuer、应用／service 注册、授权与组织／委托／精确批准实际契约和测试角色；关联 D1/D2/D3/D6。
- B2：DEV 个人／组织、Hashnode 组织 Pro 和有权账号、NyxID exact connections；关联 D6。无真实账号写入。
- B3：Medium／HackerNoon 账号、人工提交负责人、明确获准内容和外部写入授权；关联 D6/D7。
- B4：生产 HTTPS 域名、部署容量、付款责任、隐私保留策略及 RPO/RTO；关联 D1/D8/D9。
- B5：目标 remote `git@github.com:aelf-hzz780/chronoai-cms.git` 先前 Repository not found，本轮尚未重测；不阻止本地开发和增量 commit。

以上保留未通过，不以 Mock／文档降级必需交付。不得把本地自测 verified 解释为原任务独立验收通过。
