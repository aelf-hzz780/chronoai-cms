# 本机环境重建与复验

日期：2026-10-28，Asia/Shanghai。历史项目目录与实验记录来自另一台机器；本次只恢复阶段 0 的本地验证环境，不代表 CMS、NyxID、外部分发或指标功能已经实现。

## 1. 仓库与提交身份

- 后续仓库：[aelf-hzz780/chronoai-cms](https://github.com/aelf-hzz780/chronoai-cms)。`origin` 使用 `git@github.com:aelf-hzz780/chronoai-cms.git`。
- 当前仓库的 Git 身份为 `hzz780 <7567714+hzz780@users.noreply.github.com>`；邮箱使用已核对账号 ID 的 GitHub noreply 格式。
- 原提交 `f3804fa` 的作者与内容保持不变，本次修改使用 `codex/002-macos-revalidation` 功能分支。
- 本机 SSH 已认证为 `hzz780`，但访问目标仓库返回 `Repository not found`。当前无法读取远端分支或推送，尚不能区分仓库地址问题与账号访问权限不足；未创建 PR。
- 项目没有 `.kittify`、`kitty-specs` 或 mission，未采用 Spec Kitty 工作流。

## 2. 新机器与工具

本机为 macOS 26.5.2、arm64，Python 3.9.6。最初没有 Docker、Docker Desktop、Colima 或 GitHub CLI；Git SSH 可用。

容器工具安装在用户目录，不使用 sudo，不修改 shell profile，也不覆盖已有工具：

| 组件 | 版本 | 安装与校验 |
| --- | --- | --- |
| Colima | 0.10.3 | 官方 release，SHA-256 校验通过 |
| Lima | 2.2.1 | 官方 release，SHA-256 校验通过，保留 bin/share 目录关系 |
| Docker CLI | 29.9.2 | Docker 官方 HTTPS 下载；下载源未提供该文件的校验文件，不宣称完成官方 checksum 校验 |
| Docker Engine | 29.5.2 | Colima VM 中实际运行的 Docker Engine - Community |
| Docker Compose | 5.6.1 | 官方 release，SHA-256 校验通过 |

工具位于 `~/.local/share/blogsystem-container-tools/`，可执行入口位于 `~/.local/bin/`。专用 Colima profile 为 `blogsystem`，使用 VZ、4 CPU、6 GiB 内存、30 GiB 容器数据盘，不挂载用户目录、不修改 SSH 配置、不自动切换默认 Docker context。实验显式选择 `colima-blogsystem`。

Ubuntu 24.04 VM 镜像已通过官方 SHA-256 和 SHA-512 校验；`docker --context colima-blogsystem info` 已成功，默认 context 仍为 `default`。首次下载曾中断，续传完成后才启动，不使用不完整镜像。

## 3. 数据保护与复现方式

从旧机器复制的 `infra/ghost/.env` 和 `.runtime/ghost-experiment.json` 保留原样。新实验使用独立 Compose project `blogsystem-current-machine`、新数据库密码与运维账号，以及以下被 Git 忽略的文件：

- `.runtime/ghost-current-machine.env`
- `.runtime/ghost-current-machine.json`

全部数据库与 content 使用新 project 的 named volumes，不复用旧实验状态。固定使用历史记录里的官方镜像 digest，以区分环境迁移与 Ghost 升级：

```bash
docker --context colima-blogsystem pull ghost@sha256:4195f6c405e40230cd10c0770425cf500c1f542a96e9f6584c11649c150e5a89
docker --context colima-blogsystem pull mysql@sha256:f37951fc3753a6a22d6c7bf6978c5e5fefcf6f31814d98c582524f98eae52b21
DOCKER_CONTEXT=colima-blogsystem python3 -B infra/ghost/prepare.py --ghost-image ghost@sha256:4195f6c405e40230cd10c0770425cf500c1f542a96e9f6584c11649c150e5a89 --mysql-image mysql@sha256:f37951fc3753a6a22d6c7bf6978c5e5fefcf6f31814d98c582524f98eae52b21 --output .runtime/ghost-current-machine.env
docker --context colima-blogsystem compose --env-file .runtime/ghost-current-machine.env -f infra/ghost/compose.yaml -p blogsystem-current-machine config --quiet
docker --context colima-blogsystem compose --env-file .runtime/ghost-current-machine.env -f infra/ghost/compose.yaml -p blogsystem-current-machine up -d --wait --wait-timeout 180
python3 -B infra/ghost/experiment.py --initialize --state .runtime/ghost-current-machine.json
docker --context colima-blogsystem compose --env-file .runtime/ghost-current-machine.env -f infra/ghost/compose.yaml -p blogsystem-current-machine restart
docker --context colima-blogsystem compose --env-file .runtime/ghost-current-machine.env -f infra/ghost/compose.yaml -p blogsystem-current-machine up -d --wait --wait-timeout 180
python3 -B -O infra/ghost/experiment.py --verify --state .runtime/ghost-current-machine.json
```

以上命令从仓库根执行。`prepare` 与 `--initialize` 仅用于新配置／空站点，会拒绝覆盖已有文件；日常复验使用 `--verify`。默认端口 2468／2469 在首次启动前已确认空闲。凭证和完整容器环境不进入证据或 Git。

停止虚拟机使用 `colima stop blogsystem`，保留其数据；恢复使用 `colima start blogsystem --activate=false --ssh-config=false`。不要为常规复验删除虚拟机或数据卷。

## 4. 验证状态

- 两份需求快照的 SHA-256／字节数、52 个验收场景编号、九项交付映射与本地文档链接已重新核对。通过 GitHub Gist API 再次读取线上来源，revision 仍为 `79e69842f5bacba7f8204f62d151018bacf98d91`，两份文件与保存的基线完全一致。
- 私有配置与运行状态未被 Git 跟踪，原有两份私有文件权限为 `0600`。
- 实际执行确认：重复准备拒绝覆盖旧配置，迁移来的配置／state 字节校验值未变；非 loopback 目标在创建状态或网络调用前被拒绝。
- 修复实验脚本在 Python 优化模式下跳过关键验证的问题：发布状态、作者、页面标识和跨站 HTTP 状态使用显式检查。
- 回归测试先确认 `python -O` 下九个错误子场景被放行，再修复并确认普通／优化模式各五项测试全部通过。测试仅使用标准库和 mock，不访问网络。
- 本机从空站点完成初始化及 Admin API 发布；Ghost 6.73.0、MySQL 8.0.44 的实际版本和历史镜像 digest 一致。两站的作者、页面语言、代码／表格、sitemap 和跨站文章 404 均通过。
- 四个容器重启并恢复 healthy 后，使用 `python -O` 对相同 `run_id` 和文章再次只读验证通过。确认四个独立持久卷；Ghost 只绑定 `127.0.0.1:2468/2469`，数据库不映射主机端口。
- 新配置和 state 权限均为 `0600`，迁移来的两份私有文件仍与首次校验完全一致。

本机完整脱敏结果见 [机器可读证据](evidence/ghost-local-macos-arm64-2026-10-28.json)，对应 `run_id=9921ed963681`。旧证据保留原样，不能与新机器运行记录混用。

镜像下载曾遇到长连接 EOF。主机与 VM 的公共端点对照检查均通过；没有修改透明代理、MTU 或全局网络。两个大 layer 复用已下载前缀，通过官方 registry 的 Range 请求补齐，在核对 Content-Range、长度及完整 SHA-256 后导入缓存；最后由 Docker 完成固定 digest 的正常 pull。没有改镜像内容或使用第三方替代镜像。

运行离线回归测试：

```bash
python3 -B -m unittest discover -s infra/ghost -p 'test_*.py' -v
python3 -B -O -m unittest discover -s infra/ghost -p 'test_*.py' -v
```

本轮验证继续限定为合成 HTML fixture 的本地发布、渲染、站点分离和重启可读性。Markdown 保真、图片隐私、翻译互链、SMTP、NyxID、业务权限、真实外部分发、指标和全平台备份恢复仍未验证；D1–D9 无最终验收通过项。
