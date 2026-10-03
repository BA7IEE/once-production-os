# 共享 Mac 本地资源规则

2026-10-02 起适用。16GB 机器以稳定性优先；仅管理本项目明确拥有的资源。禁止全局 prune、按名字批量删除、自动删除旧库和数据卷。

## 持久开发服务

当前旧 Compose 项目名为 `ops`，卷为 `ops_once_local_db`。保持此名字，避免改名后意外创建另一个空库。运行 `docker compose -f ops/compose.local.yaml up -d db`；停止用同文件的 `stop db`；移除服务外壳用 `down`，**禁止 `down -v`**。数据库默认不自启动，新增上限 512MiB、1 CPU、128 PID；仅下一次重建生效，本轮没有重建。

密钥在 `.secrets/`，开发库需保留。备份由维护人在库运行时执行 `docker compose -f ops/compose.local.yaml exec -T db pg_dump -U once_dev -d once_local -Fc > .secrets/backups/once-local-日期.dump`，先创建权限 0700 的备份目录并设置 `umask 077`。检查返回码和 `pg_restore --list`；可列出内容不等于恢复演练通过。恢复只能用新隔离库，经评审后实施，不覆盖原库。

外部预览项目在 `~/.local/share/once-preview/compose.json`，`once-preview_database`、media、journal、secrets 都须保留。启动用 `docker compose -f ~/.local/share/once-preview/compose.json up -d db api worker`；停止用 `stop worker api db`。关闭暂停导入和访问，不删除数据。预览版与主目录版本不同，不能用主目录旧程序直接接管该库。

API/Vite/Worker 只在需要时以前台方式运行，结束用 Ctrl-C。API 有 Nest shutdown hooks，Worker 停止领取后完成当前批次并关闭 Store；数据库请求挂住时退出仍可能延迟。不得把共享 Chrome、MCP、Codex 进程认作项目测试进程杀掉。

## 临时测试

新测试默认 `pnpm test:postgres:owned`：共享锁 → 内存检查 → 检查上一轮临时容器 → 一个 `once-os-test-pg-*` 容器 → 空库 migration → 串行 PG 测试 → finally stop → `--rm` 自动移除 → 核验零容器。数据库使用 512MiB tmpfs，不创建 named volume 或自定义 network；禁止恢复正式数据进去。镜像必须已经存在，脚本不自动拉取。每个阶段最多 180 秒，启动等待约 30 秒；SIGINT/SIGTERM、超时、子进程失败均进入回收。只按本轮随机标签和精确名字操作新容器，不动历史容器。

`pnpm verify:postgres` 仍是低层的外部空库测试入口，**不拥有该库，不能清理它**；兼容旧证据复验，调用者必须明确管理生命周期。新自动测试不要直接用它创建历史库。

本机 heavy lock 在系统临时目录 `once-os-heavy.lock/owner.json`，跨本项目 worktree 共用；同时最多一个遵守新入口的重型任务。锁残留时先核对 PID、工作目录、容器标签，不能按时间自动删锁。本工作树的 `pnpm build` 已走保护入口；历史 `verify:online` 仍是低层旧入口，本轮不调用。容器构建内部用 `build:sequential`；GitHub Actions 的独立 Linux runner 使用登记与回收流程，不执行宿主 macOS 检查。直接调用低层 build/迁移命令和旧 worktree 可以绕过保护，这是治理边界，Agent 必须遵守规范。

启动门槛：本地 Unix socket Docker、macOS 正常内存压力、Swap ≤4GiB、运行容器 ≤8；不可判定时拒绝。阈值是保守策略，不是准确预测峰值。需先等待其他任务结束；不得为了跑完擅自降低门槛。单次 PG 上限 512MiB，Node/浏览器仍需独立评估，不能无限叠加。

测试进程由 `resource-lifecycle.mjs` 创建独立进程组，先 TERM，3 秒后 KILL；组长退出也回收其组内后代。另起 session/detach 的进程不受该保证。SIGKILL、Agent 强杀、机器崩溃无法执行 finally/trap；重启后必须核查锁和带标签容器，不能宣称绝对无残留。

新增 shell 创建资源必须注册 EXIT cleanup，INT/TERM 转换为退出；Node 必须 try/finally。Compose 临时测试使用唯一 `once-os-test-*` project 和标签，完整结束必须 down；只有本轮新建、明确临时的数据卷才允许 down -v。Playwright 必须 finally 关闭 page/context/browser；API/Worker 子进程必须由同一监督器启动与回收，不能依赖 Codex 会话自然结束。

## 清理与交付

资源分 A 持久、B 可重建、C 本轮临时、D 确认历史残留、E 无法确认。缺乏数据清单、创建人或恢复证据时属于 E。只清理新入口本轮产生的 C；历史 container/volume/image/network 清理需明确清单与确认。源文件、备份、私密目录不混入普通日志和交付。

交付注明代码完成、进程监督器测试、真实 Docker 清理、真实数据库和浏览器分别是否运行。状态表、Review、测试报告和 MANIFEST 同步；不能拿旧 PASS 支撑新生命周期。

## 第二阶段：本轮登记与零残留（2026-10-02）

`ResourceRun` 在 `data/local-resource-runs/<run-id>/` 保存权限受限的登记；目录保留为证据，不是需销毁的数据库/卷。`run.json` 只含运行编号、PID、资源名字/标签、状态和残留计数，不含口令、URL、请求或业务数据。创建容器前先登记，嵌套监督器经环境继承同一本轮目录，记录每个独立进程组及其上级监督器 PID。

退出、中断、超时均先回收已登记的组内后代与嵌套组，再统一 finally 按精确名称+本轮标签停止临时容器，最后检查本轮进程组没有存活进程。本轮 named volume / custom network 从不创建，因此计数为0；不是扫描全机后得出的0。清理不继承已取消的 signal；清理失败输出 RESOURCE_LEAK、保留锁和日志，绝不标记 PASS。模拟 Docker 测试日志注明 simulation=true。

第二阶段移除 preflight 的全机容器数量统计；仍保留本地 Docker 目标校验、Swap ≤4GiB 和正常内存压力门槛，以及共享锁、上一轮本项目临时标签检查。不因验收需要放宽门槛。`verify:postgres` 只允许受控入口继承的登记环境调用，手动外部空库验证入口已关闭；不要继续按旧 LOCAL_RUN 第5节新建并保留更多库。

业务流修复新增两个受控浏览器入口，由 `test:postgres:owned --business-flow-browser` 串行各自创建一个空的 disposable PG。API/Worker 继承同一 ResourceRun 的受监督进程组；Chromium 在启动前登记 intent，启动后登记 BrowserServer 的进程组，finally 关闭后再核对本轮进程、容器和临时目录零残留。临时目录在创建前登记，退出时统一回收。没有临时 Compose 路径；若今后引入，必须先登记独立 project 与配置，finally down，只清理本轮资源。持久 Compose 禁止 down -v。

重启后的最小真实验收：先确认保护门槛允许，再串行执行：

```bash
pnpm test:lifecycle
pnpm test:postgres:owned
ONCE_TEST_LIFECYCLE_FAULT=FAIL pnpm test:postgres:owned
ONCE_TEST_LIFECYCLE_FAULT=exception pnpm test:postgres:owned
ONCE_TEST_LIFECYCLE_FAULT=timeout pnpm test:postgres:owned
ONCE_TEST_LIFECYCLE_FAULT=SIGINT pnpm test:postgres:owned
ONCE_TEST_LIFECYCLE_FAULT=SIGTERM pnpm test:postgres:owned
```

后五项预期非零退出；每项必须在自己的 journal 中显示 ZERO_RESIDUE，containers/processes/networks/temporaryVolumes 均为0。故障注入只作用于本轮新建临时容器，发生在数据库就绪后、迁移前；正常项才执行迁移/真实业务测试。NOT_RUN 或 CLEANUP_FAILED 不能算故障验收通过。不要并发执行，也不需要重跑全机审计或构建全部业务模块。

创建请求失败/超时且未曾观察到容器时，不能排除Docker守护进程晚于CLI完成创建；这条路径标记UNKNOWN、保留锁，不仅凭一次空查询认证零残留。已观察到本轮容器则按精确归属回收并核验。
