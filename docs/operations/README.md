# 运维须知：双 Ghost 部署、CMS 绑定与核验

**简体中文** | [English](README.en.md)

本手册面向执行运维。按顺序完成一份工作区的英文、中文两个独立 Ghost；复用已有站点时跳过新建步骤。只使用已有 CLI、配置和官方 Ghost 后台，不依赖“开通站点”功能、通知服务或尚未实现的自动部署脚本。

**终点：站点配置完成、只读核验通过、交接给 CMS 使用者；外发保持暂停，Worker 保持停止。** 实际发布、更新或删除文章均不在本手册执行范围内。DEV、Hashnode 等外部渠道不启用。

核对日期：2026-11-05。以下命令对应仓库现有实现；执行时使用目标环境正在运行的、已验收的同一 release，不从其他分支直接运行 CLI 修改数据库。

## 0. 先判断这张工单能否执行

| 工单情况 | 操作 |
|---|---|
| 已有工作区、已有两个独立根 URL 的 Ghost | 盘点并复用；不要初始化账号、重建卷或换密码。 |
| 已批准使用两个独立根 URL，新增两个 Ghost | 可以依照本手册部署；每工作区独立 project、端口、数据库和内容卷。 |
| 采用已确认的新方案：同一子域名 `/en/`、`/zh/`，根路径跳英文 | **停在准备阶段。当前 `scripts/provision.ts` 会用 `.origin` 丢掉路径，发布适配也需要同步支持。不能先登记根域名，也不能擅自改成两个域名。待路径支持交付并验收后更新本手册。** |
| CMS 本身、工作区、域名或运维权限尚未准备 | 先由平台负责人补齐。这里不创建重复工作区，也不安装新 CMS。 |

本手册命令采用仓库的**单 Linux 主机、宿主机 Node、systemd、同机 Docker**布局。已经运行的 macOS/LAN 或容器化 CMS 应复用原启动方式、UID、目录和 Docker context，不直接执行这里的 systemd/目录命令；先让环境维护者提供对应参数。不能用 `localhost` 指代另一台机器。

不要运行 `infra/ghost/experiment.py --initialize` 或 `--resume`：它们会发布测试文章。`--verify` 也只适用于原实验记录，不是新站点的通用验收命令。

## 1. 领工单并准备参数

先确认平台负责人已提供：可用 CMS 与现有数据库、Node 24.18.x、已安装依赖和构建 Studio 的 release、Docker Compose、Python 3.9+、nginx、证书和受控 Ghost Admin 入口。公网部署还需要可用 SMTP、容量与备份责任人。只配置站点时不要顺手升级镜像、CMS 或 NyxID。

工单记录：环境与 release commit、**真实 owner/workspace ID**（不是展示名称）、个人/组织归属、博客名称、两个 site ID、已批准的 URL、Docker context/project/空闲端口、CMS env 路径、署名作者及两站 Ghost author ID、执行人、备份记录、交接人。密钥只记录保管位置，不填值。个人工作区首次登录已生成时必须复用；NyxID issuer/subject/client 配置保持原样。

进入运维专用 Bash 会话，逐项替换 `REPLACE_…`。以下都不是密钥。`OPS_RELEASE` 必须是当前部署版本；CMS env 必须包含绝对 `DATABASE_PATH`。

```bash
OPS_RELEASE='/opt/chronoai/current'
OPS_CMS_ENV='/etc/chronoai/platform.env'
OPS_OWNER_ID='REPLACE_OWNER_ID'
OPS_EN_SITE_ID='REPLACE_EN_SITE_ID'
OPS_ZH_SITE_ID='REPLACE_ZH_SITE_ID'
OPS_EN_URL='https://REPLACE_EN_ROOT_URL'
OPS_ZH_URL='https://REPLACE_ZH_ROOT_URL'
OPS_EN_ADMIN='http://127.0.0.1:REPLACE_EN_PORT'
OPS_ZH_ADMIN='http://127.0.0.1:REPLACE_ZH_PORT'
OPS_EN_KEY_REF='REPLACE_UNIQUE_EN_ENV_NAME'
OPS_ZH_KEY_REF='REPLACE_UNIQUE_ZH_ENV_NAME'
OPS_AUTHOR='REPLACE_EXACT_CMS_CREDITED_AUTHOR'
OPS_EN_AUTHOR_ID='REPLACE_EN_GHOST_AUTHOR_ID'
OPS_ZH_AUTHOR_ID='REPLACE_ZH_GHOST_AUTHOR_ID'

cd "$OPS_RELEASE"
ops_node() { sudo -u chronoai /opt/node24/bin/node --env-file="$OPS_CMS_ENV" "$@"; }
/opt/node24/bin/node --version
git rev-parse HEAD
```

作者 ID 在步骤 5 获取后再填写；其他参数在写配置前填写完整。两个 keyRef 是**环境变量名**，必须唯一并符合大写字母、数字、下划线格式；不是 Admin API key。site ID 仅使用字母、数字、`-`、`_`，不得包含路径。Admin 地址是 CMS 进程可达的私有根 URL，不含 `/ghost`；本手册同机模式才使用 loopback HTTP。

**成功标准：**确认正在操作正确 release、数据库和工作区，两个公开 URL 均为获批的 HTTPS 根 URL。缺任何一项先补齐，不猜测。

## 2. 只读盘点，暂停出站，备份

先只读检查数据库存在、工作区身份和已有绑定。此命令不会创建数据库、迁移 schema 或输出密钥；如果报错，停止处理。

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" \
  "$OPS_EN_SITE_ID" "$OPS_EN_KEY_REF" "$OPS_ZH_SITE_ID" "$OPS_ZH_KEY_REF" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
const [ownerId, enId, enKey, zhId, zhKey] = process.argv.slice(2), path = process.env.DATABASE_PATH;
if (!ownerId || ownerId.includes('REPLACE_') || !path || !isAbsolute(path) || !existsSync(path)) {
  throw new Error('STOP: confirm owner ID and existing absolute DATABASE_PATH');
}
const db = new DatabaseSync(path, { readOnly: true });
try {
  const owner = db.prepare('SELECT id,kind,issuer FROM owners WHERE id=?').get(ownerId);
  if (!owner || owner.issuer !== process.env.NYXID_ISSUER) throw new Error('STOP: workspace/issuer mismatch');
  for (const [id, keyRef] of [[enId, enKey], [zhId, zhKey]]) {
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !keyRef || !/^[A-Z][A-Z0-9_]*$/.test(keyRef) || [id, keyRef].some(x => x.includes('REPLACE_'))) throw new Error('STOP: confirm site IDs and keyRefs');
    const used = db.prepare('SELECT id,owner_id FROM sites WHERE id=? OR key_ref=?').all(id, keyRef);
    if (used.some(s => s.id !== id || s.owner_id !== ownerId)) throw new Error('STOP: site ID/keyRef belongs to another site');
  }
  if (enId === zhId || enKey === zhKey) throw new Error('STOP: use independent site IDs and keyRefs');
  console.log({ owner, paused: db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get() });
  console.log(db.prepare('SELECT s.id,s.language,s.url,s.key_ref,a.base_url FROM sites s LEFT JOIN site_admin_routes a ON a.site_id=s.id WHERE s.owner_id=?').all(ownerId));
  console.log(db.prepare('SELECT a.* FROM author_mappings a JOIN sites s ON s.id=a.site_id WHERE s.owner_id=?').all(ownerId));
  console.log({ runningJobs: db.prepare("SELECT count(*) AS count FROM jobs WHERE state='running'").get().count });
} finally { db.close(); }
NODE
```

先确认两个 keyRef 未被其他 site 使用，再向私有 env 写入密钥；不能覆盖其他站点凭据。相同绑定记录：保留并在步骤 7 跳过对应命令；不同绑定：停止，交平台负责人确认迁移，不覆盖。不要运行 `provision.ts --help` 来盘点，它也会打开可写 Store。

预约共享 CMS 的维护窗口。先用已有控制方式暂停外发；对本手册 systemd 布局执行下面命令，再重跑上面的只读检查。`pause` 是全局开关，会影响所有工作区，不是本工作区专属。

```bash
ops_node scripts/provision.ts pause --confirmed
sudo systemctl stop chronoai-worker.service
systemctl is-active chronoai-worker.service
```

**预期：**Worker 为 `inactive`（该查询非零退出码正常）、`paused.value` 为 `true`、`runningJobs` 为 0。确认没有其他主机、进程管理器或容器在运行同库 Worker，也没有定时的单次发布任务。若有 running/uncertain 任务，按工单对账，不改状态假装完成；停止进程不能撤回已经发送的请求。新库默认并非暂停，不能靠默认值。

修改前按[备份与隔离恢复](../operations.md#备份与隔离恢复)完成加密一致性备份，记录包校验值、配置备份位置和恢复负责人；捕获期间冻结 API 写入及 Ghost 后台写入。已有站点包含 MySQL、content、CMS SQLite、env 与连接配置；不能只复制活动的 `.sqlite` 文件而丢掉 WAL。新站还不存在时，先备份原 CMS/现有站点，完成本手册后再补入新站备份。这里**不执行该参考章节的恢复或 resume 命令**。

## 3. 新建双 Ghost 的私有配置（已有站点跳过）

只对工单中确认的全新 project 执行。先选两个未占用端口、独立私有目录和经过平台验证的官方 Ghost/MySQL 镜像版本。不要直接选择 `latest`。`prepare.py` 只解析已经拉取的官方镜像为 digest，不会自动拉取。

下列目录属于运维账号，位于 Git 仓库之外。`OPS_MEDIA_ROOT` 必须等于现有 CMS 的 `PUBLIC_MEDIA_DIRECTORY`，私有 staging 根必须和它在同盘同 mount，但不在任何公开目录内。

```bash
OPS_DOCKER_CONTEXT='REPLACE_DOCKER_CONTEXT'
OPS_PROJECT='REPLACE_UNIQUE_COMPOSE_PROJECT'
OPS_PRIVATE_DIR='/REPLACE_PRIVATE_OPERATOR_DIRECTORY'
OPS_EN_PORT='REPLACE_FREE_EN_PORT'
OPS_ZH_PORT='REPLACE_FREE_ZH_PORT'
OPS_GHOST_IMAGE='ghost:REPLACE_APPROVED_VERSION'
OPS_MYSQL_IMAGE='mysql:REPLACE_APPROVED_VERSION'
OPS_MEDIA_ROOT='/var/lib/chronoai/public-media'
OPS_STAGING_ROOT='/var/lib/chronoai/private-media'
OPS_GHOST_ENV="$OPS_PRIVATE_DIR/ghost.env"
OPS_GHOST_OVERRIDE="$OPS_PRIVATE_DIR/mail.override.yaml"

docker --context "$OPS_DOCKER_CONTEXT" compose ls
docker --context "$OPS_DOCKER_CONTEXT" ps --format '{{.Names}} {{.Ports}}'
sudo ss -ltn
# STOP if the project, volumes, env file, or ports already belong to another deployment.
docker --context "$OPS_DOCKER_CONTEXT" volume ls --filter "label=com.docker.compose.project=$OPS_PROJECT"
umask 077
mkdir -m 700 "$OPS_PRIVATE_DIR"
docker --context "$OPS_DOCKER_CONTEXT" pull "$OPS_GHOST_IMAGE"
docker --context "$OPS_DOCKER_CONTEXT" pull "$OPS_MYSQL_IMAGE"
DOCKER_CONTEXT="$OPS_DOCKER_CONTEXT" python3 infra/ghost/prepare.py \
  --ghost-image "$OPS_GHOST_IMAGE" --mysql-image "$OPS_MYSQL_IMAGE" \
  --en-port "$OPS_EN_PORT" --zh-port "$OPS_ZH_PORT" --output "$OPS_GHOST_ENV"
```

用本机受控编辑器编辑 `ghost.env`，不要 `cat` 到聊天/日志，也不要把密钥作为 shell 参数。保留自动生成的 digest 和独立数据库密码，将以下非秘密项改为工单实际值；现有项目绝不重新生成 env。

```dotenv
GHOST_EN_URL=https://REPLACE_EN_ROOT_URL
GHOST_ZH_URL=https://REPLACE_ZH_ROOT_URL
GHOST_STAFF_DEVICE_VERIFICATION=true
GHOST_EN_ADMIN_URL=https://REPLACE_PRIVATE_EN_ADMIN_URL
GHOST_ZH_ADMIN_URL=https://REPLACE_PRIVATE_ZH_ADMIN_URL
PLATFORM_MEDIA_ROOT=/var/lib/chronoai/public-media
PLATFORM_EN_SITE_ID=REPLACE_EN_SITE_ID
PLATFORM_ZH_SITE_ID=REPLACE_ZH_SITE_ID
```

公网部署需要配置 SMTP，并保留设备验证；不能沿用实验默认的 `false`。在同一私有 env 填写 SMTP_FROM、SMTP_HOST、SMTP_PORT、SMTP_SECURE、SMTP_USER、SMTP_PASSWORD；账号密码从秘密管理渠道填写，正确转义 Compose env 中的特殊字符。`SMTP_SECURE` 通常按邮件服务要求填写 `true` 或 `false`。在 `mail.override.yaml` 写入以下模板，并将该文件也设为 0600。下方 `admin__url` 必须填写已核验的私有 HTTPS 根 URL（不含 `/ghost`），避免浏览器被重定向到已封闭的公开 `/ghost/`。它与步骤 1 的 `OPS_*_ADMIN` 不同：前者供运维浏览器访问，后者是 CMS 的同机 Admin API 路由。不能开放公网后台来绕过访问问题。配置语法参见 [Ghost configuration](https://docs.ghost.org/config)。

```yaml
x-mail: &mail
  mail__transport: SMTP
  mail__from: ${SMTP_FROM:?Set SMTP_FROM}
  mail__options__host: ${SMTP_HOST:?Set SMTP_HOST}
  mail__options__port: ${SMTP_PORT:?Set SMTP_PORT}
  mail__options__secure: ${SMTP_SECURE:?Set SMTP_SECURE}
  mail__options__auth__user: ${SMTP_USER:?Set SMTP_USER}
  mail__options__auth__pass: ${SMTP_PASSWORD:?Set SMTP_PASSWORD}
services:
  ghost-en:
    environment:
      <<: *mail
      admin__url: ${GHOST_EN_ADMIN_URL:?Set private HTTPS Admin URL}
  ghost-zh:
    environment:
      <<: *mail
      admin__url: ${GHOST_ZH_ADMIN_URL:?Set private HTTPS Admin URL}
```

为新增站点预建公开图片目录和私有 staging。下面命令**仅用于全新、无数据的目录**；若目录已经存在，先检查 owner/mode/用途，不递归改权限。

```bash
sudo install -d -o chronoai -g chronoai -m 0755 \
  "$OPS_MEDIA_ROOT/$OPS_EN_SITE_ID" "$OPS_MEDIA_ROOT/$OPS_ZH_SITE_ID"
sudo install -d -o chronoai -g chronoai -m 0700 \
  "$OPS_STAGING_ROOT/$OPS_EN_SITE_ID" "$OPS_STAGING_ROOT/$OPS_ZH_SITE_ID"
chmod 600 "$OPS_GHOST_ENV" "$OPS_GHOST_OVERRIDE"
ops_compose() {
  docker --context "$OPS_DOCKER_CONTEXT" compose --env-file "$OPS_GHOST_ENV" \
    -p "$OPS_PROJECT" -f "$OPS_RELEASE/infra/ghost/compose.yaml" \
    -f "$OPS_RELEASE/infra/platform/ghost-media.override.yaml" \
    -f "$OPS_GHOST_OVERRIDE" "$@"
}
ops_compose config --quiet
```

**成功标准：**校验命令退出 0、未输出配置内容；两个实例只监听 `127.0.0.1`，MySQL 不发布宿主端口，公开图片只读挂载到 Ghost。当前终端与 `prepare.py`/Compose 必须使用同一 Docker context。不要使用完整 `config` 或 `inspect` 输出排障，它们可能暴露密钥。

## 4. 启动新站，配置 HTTPS 与受控后台

新站配置检查通过后启动；已有站点使用原配置检查状态，不拿这份模板重新创建。

```bash
ops_compose up -d --wait --wait-timeout 240
ops_compose ps
curl --fail --silent --show-error --max-time 10 -o /dev/null "$OPS_EN_ADMIN/ghost/api/admin/site/"
curl --fail --silent --show-error --max-time 10 -o /dev/null "$OPS_ZH_ADMIN/ghost/api/admin/site/"
```

**预期：**两个 Ghost、两个 MySQL 均 healthy。上面的 site 读取只证明服务可达，不证明 Integration key 正确。

接着由 DNS/证书负责人解析已批准地址并安装有效证书。将 [nginx 模板](../../infra/platform/nginx.conf.example) 的 Ghost server 块各复制一份到目标环境的受管配置，填写实际 host、证书和 loopback 端口；保留 CMS 原有 server，不替换整份配置。公开 `/ghost`、`/ghost/` 必须返回 404；运维只走已核验的 VPN/隧道/私有 Admin 入口。私有 Admin 代理另外配置到对应的 loopback 端口，使用私有 HTTPS 域名/证书、受限监听和 VPN/防火墙白名单，禁止公网进入；与 `GHOST_*_ADMIN_URL` 一致，私有代理允许后台及其资源访问；转发 `Host` 必须匹配该 URL（非默认端口也要带上），并固定 `X-Forwarded-Proto: https`，否则可能发生重定向循环。核对代理覆盖 `X-Forwarded-Proto`、`X-Forwarded-For`，不信任客户端伪造值。

同域 `/en/`、`/zh/` 仍适用步骤 0 的停止条件，当前 nginx 模板不能充当该方案已支持的证据。

```bash
sudo nginx -t
# Run only after nginx -t succeeds; use the existing service manager for this host.
sudo systemctl reload nginx
for site in "$OPS_EN_URL" "$OPS_ZH_URL"; do
  curl --fail --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/"
  curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/ghost"
  curl --silent --show-error --max-time 15 -o /dev/null -w '%{http_code}\n' "$site/ghost/"
done
```

**预期：**每组依次为 `200 / 404 / 404`，证书可信，无跳转至 localhost 或另一站。故障先修复，不用 `curl -k` 掩盖 TLS 问题。LAN 私有 CA 使用已获授权且核对指纹的 CA；curl/Node 分别配置可信 CA，Node 使用 `NODE_EXTRA_CA_CERTS`，不关闭证书校验。

## 5. 初始化两站，准备主题、密钥和署名

对英文、中文站分别执行：

1. 浏览器打开私有根 URL 的 `/ghost/`，确认不回跳公开域名、localhost 或循环重定向，再继续。新站建立受信任运维账号；已有站使用原账号。普通 CMS 用户不分配 Ghost 后台密码。
2. 设置工单中的博客名称与对应语言（EN/中文各自设置），核对实际公开 URL。博客名称不等于工作区 ID 或作者名。
3. 使用已批准的 B 方案主题包上传并激活；若没有包，在已备依赖的 release 执行下列打包命令。邮箱必须是实际维护者联系邮箱，不能用 `--fixture` 或虚构地址。新路径输出，避免覆盖旧包。
4. 在每站 Settings → Integrations 创建或复用 CMS 的 Custom Integration。把 **Admin API key** 放进 CMS 私有 env 中步骤 1 指定的两个 keyRef；不要拿 Content API key 替代，不抄到 README、命令或工单。
5. 为 CMS 署名准备对应 Ghost author，记录每站各自的 author ID。已有作者复用；不同站的 ID 不可互换。可由运维在已登录的 Ghost Admin 用户响应中核对 ID/姓名；不要导出 Cookie 或完整用户响应。用户数据结构见 [Ghost Users API](https://docs.ghost.org/admin-api/users/overview)。将确认后的 ID 填回 `OPS_EN_AUTHOR_ID`、`OPS_ZH_AUTHOR_ID`。

主题打包示例：

```bash
OPS_THEME_EMAIL='REPLACE_REAL_MAINTAINER_EMAIL'
OPS_THEME_ZIP='/REPLACE_PRIVATE_OPERATOR_DIRECTORY/chronoai-b-approved.zip'
/opt/node24/bin/node themes/chronoai-b/pack.mjs \
  --author-email "$OPS_THEME_EMAIL" --output "$OPS_THEME_ZIP"
```

同时更新现有 CMS env：保留其他所有 keyRef 与原有 `GHOST_MEDIA_STAGING_JSON` 条目，仅加入两站新条目；不要覆盖其他工作区。公开根继续使用 `PUBLIC_MEDIA_DIRECTORY`，staging 不得被 nginx 或 Ghost 公开。env 由 root:chronoai 持有、0640；秘密管理器注入也可，但 CLI、API 与未来 Worker 必须读到一致配置。

示例仅展示字段形状，需用真实 site ID 和路径替换，并与原 JSON **合并**：

```dotenv
GHOST_MEDIA_STAGING_JSON={"REPLACE_EN_SITE_ID":"/var/lib/chronoai/private-media/REPLACE_EN_SITE_ID","REPLACE_ZH_SITE_ID":"/var/lib/chronoai/private-media/REPLACE_ZH_SITE_ID"}
```

**成功标准：**两站名称/语言/主题、Admin key 与作者 ID 均已记录；密钥只留私有配置。配置 Ghost 邮件后，通过受控运维登录完成设备验证，确认邮件可收取；不会为此发博客文章。

## 6. 写入前校验参数

这一步只读检查身份、URL、ID 和 keyRef。它会拒绝路径站点、未替换的参数、冲突绑定及缺失密钥。脚本通过不代表密钥已能登录 Ghost，远端读取在步骤 8 进行。

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" \
  "$OPS_EN_SITE_ID" "$OPS_EN_URL" "$OPS_EN_ADMIN" "$OPS_EN_KEY_REF" "$OPS_EN_AUTHOR_ID" \
  "$OPS_ZH_SITE_ID" "$OPS_ZH_URL" "$OPS_ZH_ADMIN" "$OPS_ZH_KEY_REF" "$OPS_ZH_AUTHOR_ID" "$OPS_AUTHOR" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { safeUrl } from './src/config.ts';
const args = process.argv.slice(2), [ownerId] = args, author = args[11];
const stop = () => { throw new Error('STOP: check ticket, identity, URL, bindings, pause, or private configuration'); };
if (args.length !== 12 || args.some(x => !x || x.includes('REPLACE_'))) stop();
const path = process.env.DATABASE_PATH;
if (!path || !isAbsolute(path) || !existsSync(path)) stop();
const db = new DatabaseSync(path, { readOnly: true });
try {
  const owner = db.prepare('SELECT issuer FROM owners WHERE id=?').get(ownerId);
  if (owner?.issuer !== process.env.NYXID_ISSUER || db.prepare("SELECT value FROM settings WHERE key='outbound_paused'").get()?.value !== 'true') stop();
  if (db.prepare("SELECT count(*) AS n FROM jobs WHERE state='running'").get().n) stop();
  if (args[1] === args[6] || new URL(args[2]).origin === new URL(args[7]).origin || args[4] === args[9] || new URL(args[3]).origin === new URL(args[8]).origin) stop();
  for (const [offset, language] of [[1, 'en'], [6, 'zh']]) {
    const [id, url, admin, keyRef, ghostId] = args.slice(offset, offset + 5);
    if (!/^[A-Za-z0-9_-]+$/.test(id) || !/^[A-Z][A-Z0-9_]*$/.test(keyRef)) stop();
    for (const [address, isAdmin] of [[url, false], [admin, true]]) {
      const parsed = safeUrl(address, isAdmin);
      if (parsed.pathname !== '/' || parsed.search || parsed.hash) stop();
    }
    if (!/^[a-f0-9]+:[a-f0-9]{64}$/.test(process.env[keyRef] ?? '')) stop();
    const existing = db.prepare('SELECT * FROM sites WHERE id=? OR (owner_id=? AND language=?)').all(id, ownerId, language);
    if (existing.some(s => s.id !== id || s.owner_id !== ownerId || s.language !== language || s.url !== new URL(url).origin || s.key_ref !== keyRef)) stop();
    if (db.prepare('SELECT 1 FROM sites WHERE id<>? AND (key_ref=? OR url=?)').get(id, keyRef, new URL(url).origin)) stop();
    if (db.prepare('SELECT 1 FROM site_admin_routes WHERE site_id<>? AND base_url=?').get(id, new URL(admin).origin)) stop();
    const route = db.prepare('SELECT base_url FROM site_admin_routes WHERE site_id=?').get(id);
    if (route && route.base_url !== new URL(admin).origin) stop();
    const mapping = db.prepare('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?').get(id, author);
    if (mapping && mapping.ghost_author_id !== ghostId) stop();
    console.log({ id, language, site: existing.length ? 'KEEP' : 'ADD', admin: route ? 'KEEP' : 'ADD', author: mapping ? 'KEEP' : 'ADD' });
  }
} finally { db.close(); }
NODE
```

## 7. 登记到 CMS，只重启 API

按照上一步每项 `ADD/KEEP` **逐行选择**：只执行 `ADD` 对应命令，`KEEP` 跳过。`site`、`author` 是 INSERT，重跑会冲突；`admin-site` 会覆盖旧值，不能绕过核验。执行期间不要并发修改同一工作区。任意一步失败，停止并从步骤 2 重新盘点，不能整段盲重跑。

```bash
# Execute only the lines marked ADD by step 6.
ops_node scripts/provision.ts site "$OPS_EN_SITE_ID" "$OPS_OWNER_ID" en "$OPS_EN_URL" "$OPS_EN_KEY_REF"
ops_node scripts/provision.ts site "$OPS_ZH_SITE_ID" "$OPS_OWNER_ID" zh "$OPS_ZH_URL" "$OPS_ZH_KEY_REF"
ops_node scripts/provision.ts admin-site "$OPS_EN_SITE_ID" "$OPS_EN_ADMIN"
ops_node scripts/provision.ts admin-site "$OPS_ZH_SITE_ID" "$OPS_ZH_ADMIN"
ops_node scripts/provision.ts author "$OPS_EN_SITE_ID" "$OPS_AUTHOR" "$OPS_EN_AUTHOR_ID"
ops_node scripts/provision.ts author "$OPS_ZH_SITE_ID" "$OPS_AUTHOR" "$OPS_ZH_AUTHOR_ID"
```

重跑步骤 6：两站均应全部 `KEEP`。新 CLI 进程读到新 env 不代表 API 已加载；在维护窗口重启 **API**，不启动或 enable Worker。不改 NyxID client、issuer、角色、连接或审批策略。

```bash
sudo systemctl restart chronoai-api.service
systemctl is-active chronoai-api.service
systemctl is-active chronoai-worker.service
```

**预期：**API 为 `active`、Worker 为 `inactive`；步骤 2 的暂停值仍为 `true`。如果正在准备的 release 没有构建 Studio，先由发布负责人完成该 release 的 `npm ci`、`npm run build:studio` 和原有验收流程，不切入半成品；systemd 不会自动构建前端。

## 8. 只读核验，不发文章

先执行两站 Integration 的认证读取和媒体目录校验。此命令以 CMS Unix 用户运行，只发 Ghost GET；不创建文章，不读出正文，不启动 Worker。内部使用只读 SQLite；输出只含 site ID 与检查结果，失败只输出安全错误代码。

```bash
ops_node --input-type=module - "$OPS_OWNER_ID" "$OPS_EN_SITE_ID" "$OPS_ZH_SITE_ID" "$OPS_AUTHOR" <<'NODE'
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { GhostAdapter } from './src/ghost.ts';
import { MediaStaging } from './src/media-staging.ts';
const [ownerId, en, zh, author] = process.argv.slice(2);
let db;
try {
  const path = process.env.DATABASE_PATH, mediaRoot = process.env.PUBLIC_MEDIA_DIRECTORY;
  if (!path || !isAbsolute(path) || !existsSync(path) || !mediaRoot || !isAbsolute(mediaRoot)) throw new Error('Configuration');
  db = new DatabaseSync(path, { readOnly: true });
  const readStore = { get: (sql, ...p) => db.prepare(sql).get(...p), all: (sql, ...p) => db.prepare(sql).all(...p) };
  const ghost = new GhostAdapter(readStore, mediaRoot, false, process.env);
  const media = new MediaStaging(readStore, mediaRoot, process.env);
  for (const id of [en, zh]) {
    const site = readStore.get('SELECT * FROM sites WHERE id=? AND owner_id=?', id, ownerId);
    const mapping = readStore.get('SELECT ghost_author_id FROM author_mappings WHERE site_id=? AND credited_author=?', id, author);
    if (!site || !mapping) throw new Error('Binding');
    const response = await ghost.call({ site }, 'posts/?limit=1&fields=id', 'GET');
    if (!Array.isArray(response.posts)) throw new Error('GhostContract');
    await media.resolve(id);
    console.log({ siteId: id, integrationRead: 'PASS', mediaLayout: 'PASS' });
  }
} catch (error) {
  console.error({ result: 'FAIL', code: typeof error.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'OPS_READ_CHECK_FAILED' });
  process.exitCode = 1;
} finally { db?.close(); }
NODE
```

媒体 PASS 只证明目录隔离、0700/UID、同 filesystem/mount 等静态配置符合当前规则；它不证明实际发布、图片写入或公开图片核验已经通过。宿主机检查也不代替容器 Worker 内的挂载验证。失败参考[图片私有 staging](../operations.md#图片私有-staging-配置)，修复后重跑，不能把临时图片复制到公开目录绕过校验。

然后逐项人工检查并记录结果：

| 检查 | 通过条件 |
|---|---|
| CMS `GET /health` | 200；只代表 API/SQLite，不代表 NyxID/Ghost。 |
| CMS 真实登录 | 从 CMS 入口重新发起 NyxID 登录，选择工单中的工作区；不能复用旧 callback URL。 |
| 站点与工作区页面 | 两种语言都有正确 URL；编辑器对应语言的“未配置”提示消失。 |
| 站点接口 | 已登录浏览器读取 `GET /api/cms/owners/{ownerId}/sites`，两站 `configured=true`。当前 `verification.status` 固定为 `unknown`，这不是失败，也不能手改为 verified。 |
| 作者 | 两站 Admin 中 author ID 与姓名对应准确，CMS 署名与映射逐字一致。认证 GET 成功不等于作者映射正确。 |
| 主页/语言/主题 | EN、ZH 名称与语言正确，B 主题已激活，TLS 正常，公网后台 404。 |
| 发布前渲染环境 | 已配置 `RENDER_BROWSER_EXECUTABLE`，运行用户可用 Chromium，`RENDER_BROWSER_SANDBOX` 保持开启；按[渲染说明](../operations.md#公开正文渲染证明)记录目标环境验证。没有真实文章时不得宣称正文证明已通过。 |
| 停止边界 | Worker 停止、`outbound_paused=true`，无新增发布执行或外部同步。 |

不要通过“点一次发布试试”验收。若需文章或图片的完整验收，把文章、修订、署名、工作区、语言、目标 URL、操作类型列入单独确认清单。

## 9. 交接、故障处理与后续维护

在工单逐项勾选，缺项保持“待处理”，不要写“全部可发布”：

- [ ] 工作区 ID/归属、博客名称、两站 site ID、URL、语言和作者映射正确。
- [ ] release commit、Ghost/MySQL digest、Docker context/project/端口、部署时间已记录。
- [ ] Secret 只记录保管位置；原 NyxID 身份与其他工作区配置保持不变。
- [ ] HTTPS、私有 Admin、SMTP、认证 GET、媒体布局、CMS 登录与 configured 检查结果已附。
- [ ] 新 Ghost env、私有 override、SMTP 配置、MySQL/content、CMS env/SQLite 已纳入加密备份；恢复负责人和离机保存位置明确。
- [ ] 监控负责人已接入主页/TLS 续期、磁盘、MySQL 健康和备份新鲜度；本项目不会自动替运维发送通知。隐私保留周期、容量与恢复目标尚未确认时，不算生产交付完成。
- [ ] 外发仍暂停、Worker 仍停止；DEV 等外部渠道未启用。
- [ ] 向申请人交接 CMS 入口、两站浏览入口、检查日期和待确认发布事项。**只有实际通知后才勾选“已交接”**；不要写成系统已自动通知。

| 故障 | 下一步 |
|---|---|
| UI 仍显示未配置 | 确认登录的 owner ID/语言与数据库绑定一致，刷新页面；不要用展示名称另建 owner。 |
| `GHOST_CREDENTIAL_REQUIRED` / 401 | 核对 Admin key 类型、keyRef、目标站点和运行进程的 env；修正后只重启 API，再只读验证。 |
| 连接失败 / TLS 错误 | 核对同机端口、私有 route、服务健康与可信 CA，不关闭 TLS 校验。 |
| `AUTHOR_MAPPING_REQUIRED` | 核对精确署名和该站 author ID，不复用另一站 ID。 |
| `MEDIA_STAGING_*` | 按媒体规则检查 UID/mode/路径/挂载；不公开 staging、不跳过检查。 |
| 半途失败或发现已有记录冲突 | 保留现场，从步骤 2 只读盘点；修复/迁移需单独工单，不重复 INSERT 或直接改数据库。 |

回退时保持暂停。新建 project 可用原 `ops_compose stop` 停止，**不删除卷、不执行 `down -v`**；仅回退本工单的代理配置并先 `nginx -t`。CMS env/绑定如已被使用，不直接删记录或整库还原；由平台负责人核对并发变更、schema 兼容性和备份，在隔离位置恢复后决定切换。已有站点保持原数据与原入口，不重置账号。

后续首次发文另行确认；同域路径支持、自动开通、NyxID 连接迁移和外部平台发布不由本手册顺带完成。

相关文档：[部署/备份/恢复参考](../operations.md) · [NyxID 配置](../nyxid-registration.md) · [开发指南](../development.md) · [历史双 Ghost 实验](../../infra/ghost/README.md)（包含发文步骤，不作为本手册执行顺序）。
