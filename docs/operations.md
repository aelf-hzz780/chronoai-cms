# 单机部署与运维交接

当前支持：单 Linux 主机、Node24.18.x、Fastify API+独立 Worker、本地持久盘 SQLite WAL；每 owner×language 一套官方 Ghost6.73.0+MySQL8.0.44。禁止多个主机共享 SQLite/NFS。以下是部署模板；生产 DNS/HTTPS、容量、付款方、隐私 retention、RPO/RTO 尚未指定，公开部署与生产恢复验收保持 BLOCKED。

## 安装布局与开通

- `/opt/node24/bin/node`：受维护的 Node24.18.x；`/opt/chronoai/releases/<commit>` 是不可变代码及 npm ci 结果；`/opt/chronoai/current` 指向当前 release。
- `chronoai` Unix 用户不加入 Docker group，无 sudo，无 Ghost 运维权限。`/var/lib/chronoai` 0700，数据库0600；`/etc/chronoai/platform.env` 与 connections JSON 由受控运维部署，root:chronoai 0640。ENCRYPTION_KEY、TRACKING_SECRET、Ghost integration keys 各自随机，备份 key 独立保管，不放入 platform.env。
- 配置 DATABASE_PATH=/var/lib/chronoai/platform.sqlite，PUBLIC_MEDIA_DIRECTORY=/var/lib/chronoai/public-media，HOST=127.0.0.1，PUBLIC_URL=https://实际CMS域名，ALLOW_LOOPBACK_HTTP=false。仅本机可信 nginx 使用 TRUST_PROXY_CIDRS=127.0.0.1/32,::1/128；其他客户端 X-Forwarded-For 不可信。
- 安装 `infra/platform/chronoai-{api,worker}.service` 到 systemd，核对路径后 daemon-reload，再 enable --now。先用非生产配置完成 smoke test。Node SQLite 实验性状态计入技术限制；容量提升需压测并评估迁移关系数据库。
- 四 Ghost 使用 `infra/ghost/compose.yaml`，每 owner 独立 project/env/卷/端口，不覆盖原实验。镜像按 digest 固定，维护窗口才升级。公开 url 必须是实际 HTTPS 站点。
- 每组附加 `infra/platform/ghost-media.override.yaml`：设置绝对 PLATFORM_MEDIA_ROOT、PLATFORM_EN_SITE_ID、PLATFORM_ZH_SITE_ID；预创建两个0755子目录，归 chronoai。Ghost nested mount 只读；平台 Worker 可写。父目录如0700，容器必须能够遍历挂载源；绑定子目录直接挂载可避开父路径读取需求，实际验收以公开图片 hash 为准。

```bash
# 示例：在准备好私有 env 后执行，不把真实值写在命令中。
docker compose --env-file /etc/chronoai/org-ghost.env \
  -f infra/ghost/compose.yaml -f infra/platform/ghost-media.override.yaml \
  -p chronoai-org up -d
node --env-file=/etc/chronoai/platform.env scripts/provision.ts pause --confirmed
```

Ghost、MySQL和Docker由独立运维身份管理。开通 owner/site/admin-site/author/owner-name 见 development.md。Ghost Admin Integration key 使用对应 env keyRef；普通用户只使用 CMS/NyxID，不分配 Ghost staff 或后台密码。运维首次安装与定期私有读取要记录工单、actor、owner、时间、Trace ID。

## HTTPS 与网络

`infra/platform/nginx.conf.example` 在 nginx http context 内部署，替换所有占位 host/certificate/port，为四 Ghost 各复制一块。80仅跳转HTTPS，443终止TLS；公开 `/ghost` 和 `/ghost/` 一律404。私有 Admin route 指向相应127.0.0.1端口，loopback HTTP只允许运维配置；public url仍强制HTTPS。运维后台如需访问，用受审计SSH tunnel，不开启公网Admin。MySQL不发布宿主端口。

nginx明确覆盖 X-Forwarded-For=$remote_addr，不透传用户任意链。不要记录tracker完整URI或authorization；模板关闭access log。系统防火墙仅开放SSH受控来源和80/443。证书由既有运维流程签发和续期；本仓库不含自动DNS或付款授权。

上线前执行 nginx -t / systemd-analyze verify（在目标Linux），核验public Ghost /ghost404、私有integration可达、四站语言／作者／owner／sitemap／图片、业务停机后public仍可读、CMS/service同一身份权限与撤销。这里没有声称已部署这些生产模板。

## 监控与隐私

- `/health` 检查API及SQLite连接；不能代表NyxID/四Ghost/外部平台健康。分别监控Ghost主页、integration连接（不记录凭证）、卷空间、备份新鲜度、证书到期和MySQL健康。
- 日志由journal收集；API5xx和collector失败带Trace ID，仅安全分类。查审计和jobs/delivery_events/projections：长期queued、lease过期、uncertain/verifying、blocked、manual_action_needed需告警并由owner跟进。没有后台自动告警发送服务，需接入运维既有监控。
- collector默认关闭，开启时默认要求明确consent；尊重GPC/DNT和撤回。仅记录daily HMAC(IP+UA)、referral hostname、受限campaign，不保存rawIP/完整referrer。可信proxy配置决定估算正确性；UV是UTC每日估算，不跨平台去重。
- retention天数、数据访问负责人、删除依据和备份过期政策必须在生产上线前确定；当前没有自动purge任务，不声称已满足某个保留周期。按政策停采后旧数据仍需受控处理；不得未经授权物理清理内容或证据。日志/工单也不能包含token、cookie、备份key。

## 备份与隔离恢复

备份含平台SQLite（源文/私有素材/远端映射/审计/队列）、platform env、额外connection配置、每组Ghost env、MySQL一致性dump及content tar。AES-256-GCM独立key+AAD、每文件SHA256；key与包分地保管。API写入在捕获期间应进入维护窗口，停止业务写入与Worker，禁止同时直接编辑Ghost；SQLite online backup只保证自身一致性，不提供跨数据库分布式快照。

先暂停出站、等待running清空；capture拒绝仍有running且保持paused。操作plan使用绝对路径：

```json
{"dockerContext":"explicit-production-context","databasePath":"/var/lib/chronoai/platform.sqlite","platformConfig":"/etc/chronoai/platform.env","extraFiles":["/etc/chronoai/nyxid-connections.json"],"sites":[{"project":"chronoai-personal","envFile":"/etc/chronoai/personal-ghost.env","restoreProject":"blogsystem-restore-unique-personal","enPort":3668,"zhPort":3669},{"project":"chronoai-org","envFile":"/etc/chronoai/org-ghost.env","restoreProject":"blogsystem-restore-unique-org","enPort":3678,"zhPort":3679}]}
```

由秘密管理器注入 RECOVERY_BACKUP_KEY，不echo、不进入history。包、plan、恢复目录均按敏感材料处理：

```bash
node scripts/recovery.ts capture /private/plan.json /private/backup.enc
# RECOVERY_ARCHIVE通过环境指向上述包；使用全新目标目录/project/端口。
node scripts/recovery.ts restore /private/plan.json /private/fresh-restore
```

恢复只支持全新 `blogsystem-restore-*` project、新卷与loopback端口，拒绝覆盖existing；官方digest镜像必须已缓存，不拉取。先验证全包，再恢复DB/content/config。恢复平台强制paused、清空旧session/oidc，in-flight变uncertain。恢复Ghost沿用隔离端口URL，**不能直接指向生产**；按报告校验所有revision字节、素材hash、发布页/404、owner映射和远端身份，修正平台site/admin/media/env到隔离环境。

恢复默认使用卷内content而不是生产nested mount。切回生产布局前，把已公开素材恢复到对应平台site子目录，核对hash和最小权限，再挂载Ghost只读；私有素材继续只在DB。恢复后不自动重发，先逐项只读reconcile，重验当前NyxID权限、连接与未过期exact批准。明确审批后才 `scripts/provision.ts resume --confirmed`。不要让隔离恢复实例使用真实provider凭证执行写入。

已有本地四站隔离恢复记录见 review-i2.md；原卷保留。它证明local恢复路径，不代表生产RPO/RTO。上线前由责任人给出数值目标、备份频率、离机存储和保留策略，再在生产等价环境测量恢复耗时与可丢失窗口。

## 升级、回滚与退组

升级：暂停准入与出站，完成加密备份，固定旧commit/Node/npm lock/Ghost/MySQL digest；在新隔离环境运行check、四站和恢复，再切current，启动API和Worker，先只读smoke再恢复。Store启动自动做增量迁移；不能假设旧代码可读新schema。回滚应用前验证schema兼容；不兼容则新目录恢复备份并对账，不能覆盖正在运行的数据库。Ghost/MySQL降级同样使用隔离恢复，保留旧卷；无需删除官方代码。

离组/撤权由NyxID权威源生效；平台每次读取／执行重验，组织内容留组织，个人内容保留。Admin撤Publisher，停用精确连接，检查queued/approval_needed、verifying/uncertain与所有已知副本，按需取消、对账、更新或移除；不更换作者账号补发。密钥疑似泄露先暂停出站，由运维轮换并检查审计；ENCRYPTION_KEY轮换需迁移加密actor/session，不能直接替换导致历史不可解密。

## 责任与容量待定

单机故障是当前共同失效域，没有HA承诺。四MySQL/Ghost、API/Worker、SQLite、媒体与加密备份需要测量真实CPU/RAM/IO/增长量；本地4CPU/约6GB只用于测试，不作为生产容量承诺。费用项包括VPS/磁盘/离机备份/域名/TLS运维/NyxID/Hashnode Pro/投稿账户。付款人、订阅责任人、维护窗口、值班与人工投稿负责人尚未指定，均列上线blocker；不生成虚构预算或SLA。

恢复暂停出站时，仅显式授权请求、处于uncertain/verifying的原文或uncertain的delivery可被Worker认领做只读远端reconcile；新写任务及metadata投影继续暂停。实际写入边界再次检查pause，不能通过恢复身份变相发文。原文核验后可能恢复本地公开素材及账本，但不调用远端发布API。采集故障覆盖缺口记录在collection_gaps；若数据库整体不可写，当前API进程保留每日缺口并记录Trace日志，进程重启前需由运维保存故障窗口。完整数据库故障同时导致审计/health异常，不能宣称持久故障记录必然可写。
