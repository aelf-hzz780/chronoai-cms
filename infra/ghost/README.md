# 本地双 Ghost 实验

用途：阶段 0 验证每个双语 publication 的两个独立 Ghost 实例。此配置只监听本机，不是生产部署模板，不包含 CMS、NyxID、外部分发或指标实现。

Ghost 镜像不增加源码补丁或自定义构建层。两个实例分别使用数据库、数据库凭证、网络和 content volume。镜像在准备时解析为 digest，避免重现实验时漂移。镜像版本与验证结果写入 [阶段 0 记录](../../docs/phase-0.md)。

## 启动

需要 Docker Engine（可通过 Docker Desktop 或 Colima 运行）、Docker Compose、Python 3.9+。两个 Python 脚本仅使用标准库，无需安装 pip 依赖。命令在当前目录执行。首先拉取准备验证的官方 Ghost 和其支持的 MySQL 镜像，然后生成配置；示例标签必须结合当时官方兼容矩阵复核。

```bash
docker pull ghost:6-alpine
docker pull mysql:8.0.44@sha256:f37951fc3753a6a22d6c7bf6978c5e5fefcf6f31814d98c582524f98eae52b21
python3 prepare.py --ghost-image ghost:6-alpine --mysql-image mysql:8.0.44@sha256:f37951fc3753a6a22d6c7bf6978c5e5fefcf6f31814d98c582524f98eae52b21
docker compose -p blogsystem-phase0 config --quiet
docker compose -p blogsystem-phase0 up -d --wait --wait-timeout 180
```

默认英文站为 `http://localhost:2468`，中文站为 `http://localhost:2469`。需要其他端口时，在准备阶段使用 `--en-port`／`--zh-port`。同一 publication 的语言站为两个独立安装；使用两个端口不代表已经设置站点语言。

`.env` 使用随机独立凭证、权限 0600，已被 `.gitignore` 排除。prepare.py 不覆盖既有配置，避免重置已初始化数据库的连接密码。不要打印完整 `docker compose config`、容器环境或 `.env`，使用 `config --quiet` 验证。

## 初始化与验证

可以选择下面的自动本地实验，或后面的手工初始化，两者择一。自动初始化仅用于尚未设置 owner 的本机测试站点。

```bash
python3 experiment.py --initialize
python3 experiment.py --verify
docker compose -p blogsystem-phase0 restart
docker compose -p blogsystem-phase0 up -d --wait --wait-timeout 180
python3 experiment.py --verify
```

实验会创建两个本地测试运维账号和两篇合成文章；凭证保存在项目 `.runtime/ghost-experiment.json`（0600、忽略提交），输出仅包含脱敏验证结果。脚本限制为 loopback HTTP 地址并拒绝重定向。它通过该版本的 Ghost Admin 初始化／设置接口完成一次运维准备，再通过 Integration Admin API 发布；初始化接口不是生产业务 Adapter 的契约。

`--verify` 只读，可在重启后执行。中断后的 `--resume` 使用已有状态；若帖子请求结果不确定，先查远端，无法证明结果时停止而不盲重试。实验未配置 SMTP；首次初始化后的再次运维登录可能需要邮件设备验证，应配置邮件后处理，不关闭认证校验。正常的 Integration API 验证不依赖重新登录。

本实验验证 HTML card 的代码／表格呈现、署名、站点 locale、sitemap 可达及两站文章分离；它不证明平台 Markdown 保真、图片保护、翻译互链、业务权限或 NyxID 已完成。

校验逻辑的离线回归测试从仓库根目录执行，覆盖正常与 Python 优化模式：

```bash
python3 -B -m unittest discover -s infra/ghost -p 'test_*.py' -v
python3 -B -O -m unittest discover -s infra/ghost -p 'test_*.py' -v
```

换机器复验时，应使用独立 Compose project、新配置和新 `--state` 文件；迁移过来的 state 不能与新建的空数据库混用。旧 `.env`、运行状态和历史证据保留不覆盖。需要复现已有实验时，使用证据记录中的镜像 digest，避免 `ghost:6-alpine` 等移动标签改变测试版本。

手工方式：

1. 分别打开两站的 `/ghost/`，由测试运维完成初始化；设置各自站点语言、标题与署名。原版 Ghost Admin 仅用于运维实验，不能作为最终用户的 NyxID CMS。
2. 在 Ghost Admin 建立 Custom Integration，将 Admin API key 保存在私有配置／secret manager，不写进证据或浏览器业务响应。
3. 使用官方 Admin API 向两站各发布一篇获准的本地测试文章，检查代码、表格、图片、作者、语言和公开 URL。保留原始 Markdown 校验值，不能由 Ghost 反向转换生成源文。
4. 重启实例，检查内容和配置是否保留；检查一个站的内容不会出现在另一站。
5. 双 owner 验收需另一个 Compose project 及不同端口、单独配置，共四个 Ghost。该实验不自动证明平台权限隔离。

## 停止与恢复

```bash
docker compose -p blogsystem-phase0 stop
docker compose -p blogsystem-phase0 up -d --wait --wait-timeout 180
```

停止保留数据库、内容卷和配置。不执行带 `--volumes` 的清理；实验数据清理需单独明确范围。恢复能力必须通过备份到新环境的演练证明，仅重启并不等于完成恢复验收。

## 生产前补齐

HTTPS 与真实域名、受控 Ghost Admin 入口、SMTP、监控和日志、镜像更新策略、数据库及素材备份、恢复演练、资源容量、费用责任、隐私与采集配置均需另行验证。Ghost 官方 Docker 工具目前标为 preview，应记录采用版本和已知限制。

参考：[官方 Docker 自托管](https://docs.ghost.org/install/docker/)、[官方 Docker 仓库](https://github.com/TryGhost/ghost-docker)、[官方 Admin API](https://docs.ghost.org/admin-api/)。
