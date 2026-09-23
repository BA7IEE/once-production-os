# 本地接力运行与验收

版本：0.1.0-dev.1。2026-09-23 已在隔离本地环境执行依赖锁定、完整构建、空库迁移、PostgreSQL 专用测试和一条浏览器主链路；结果见 [测试报告](TEST_REPORT.md)。以下保留可复现步骤与尚未完成的完整浏览器清单。不要把本地 Compose 当作 1Panel 生产部署方案。

## 1. 前置条件

命令以 Bash/Linux 或 macOS 环境为准；Windows 原生运行尚未验证。使用独立文件夹和空数据库，不要进入 SRVF 目录。需要 Node 22、与 package.json 一致的 pnpm、Docker Compose 或独立 PostgreSQL。`.nvmrc` 记录 2026-09-23 实测的 Node 22.22.3；正式运行镜像仍需锁定摘要并审查。

顶层依赖及传递依赖已于 2026-09-23 真实解析并锁定；重装时仍须核对支持周期和新增漏洞，不得手写猜测 `pnpm-lock.yaml`。运行任何脚本前先 `cd` 到本项目根目录。已有 `.env`/`.secrets` 时不要再次运行初始化脚本覆盖本地密钥。

```bash
corepack enable
corepack prepare pnpm@10.14.0 --activate
node scripts/init-local.mjs
```

最后一条会生成本地随机密钥、DB 密码与一次性管理员口令文件，权限 0600，目录 0700。已有 `.env` 或 `.secrets` 时直接拒绝覆盖。它只写本地文件，不连接数据库，不打印密码，不创建真实人才。

## 2. 依赖、契约与完整构建

```bash
pnpm verify:online
```

该脚本的行为：没有锁文件时在线解析候选版本；随后 frozen install、Prisma validate/generate、请求契约校验、完整 TS 检查、传输层检查、核心测试、静态检查、构建及生产依赖审计。任一步失败即停止，不自动换成宽松版本，不跳过类型检查。2026-09-23 的最终锁文件已通过该脚本。

Prisma 会读取根目录 `.env` 中的 DATABASE_URL；validate/generate 不需要连接真实库。如环境没有隐式加载，应使用 `node --env-file=.env` 启动相应 CLI，不能把生产 URL 临时填入。

生成的新锁文件和实际版本结果应由维护人员纳入代码审查。该脚本即使通过，也不包含数据库测试、浏览器测试或生产验收。

## 3. 本地 PostgreSQL 与初始化

本步骤只作用于上一步生成的 `once_local` 本地库。确认 `.env` 中 HOST 为回环地址、数据库端口为 5436。

```bash
docker compose -f ops/compose.local.yaml up -d db
docker compose -f ops/compose.local.yaml ps
pnpm db:deploy
node --env-file=.env dist/apps/api/src/bootstrap.js
```

健康检查通过后再迁移。迁移失败时保留错误证据，不运行 reset、drop、truncate 或 `prisma db push` 试图绕过。

bootstrap 只允许空安装，已有 workspace 或 user 即拒绝。默认登录名来自本地配置中的 `owner`，密码来自 `.secrets/bootstrap.password` 的随机内容，不是示例口令。由操作者本地查看并保存在安全位置，确认登录后删除这一个一次性文件；不要删除 contact.hex、csrf.hex 或 recovery.epoch，也不要把口令贴回聊天/群聊。

初始化不会生成任何模特资料；分类种子只有角色、城市、语言和技能，不冒充生产样本。

2026-09-23 本机的 `once_local` 已完成初始化并留有浏览器联调的合成成员、来源、人才和导入任务。不要在此库再次执行 bootstrap；如需重做空库测试，应另建隔离库。一次性管理员口令仍仅在本机 `.secrets/bootstrap.password`，由实际接力者安全保存后再删除该文件。

## 4. 启动真实前后端和 Worker

终端 A：

```bash
node --env-file=.env dist/apps/api/src/main.js
```

终端 B：

```bash
node --env-file=.env dist/apps/api/src/worker-main.js
```

本地在 `http://127.0.0.1:4318` 查看构建后的 React 页面。同一端口同时提供页面与 API；写请求必须精确匹配 APP_ORIGIN。`/health/live` 只证明进程响应；`/health/ready` 检查工作空间和隔离批次，不等于已验证全部迁移、权限和恢复能力。

不启动 Worker 时，可以建档和预览，但导入只会排队，不能把 `202 ACCEPTED` 当成已完成。关闭 Worker 的终端可发 SIGINT，进程停止领取后结束当前有界批次。

如需 Vite 热更新，将本地 APP_ORIGIN 改为 `http://127.0.0.1:5173` 后重启 API，另开终端运行 `pnpm dev:web`。只用 5173 页面操作，保留精确 Origin，不添加 `*` CORS。Vite 开发服务仅监听回环地址，不对外开放。

## 5. 真实 PostgreSQL 专用测试

源码在 [tests/postgres/integration.test.ts](../../tests/postgres/integration.test.ts)。原基线在独立空库通过 6/6；R1 在另一新空库通过 13/13，详见[测试报告](TEST_REPORT.md)。再次运行必须新建另一空库。

在同一个本地 PostgreSQL 创建新的空库，名字必须为 `once_test_` 加小写字母/数字/下划线，例如 once_test_inc01。使用单独测试凭据；下面环境值由本地维护人员填写，不提供万能口令。

```bash
# 本地安全设置 DATABASE_URL_TEST；不要在共享终端记录真实口令。
# 仅指向回环地址上全新的 once_test_* 空库。
export ALLOW_DB_TESTS=yes
DATABASE_URL="$DATABASE_URL_TEST" pnpm db:deploy
pnpm verify:postgres
```

**迁移前由维护人核对 URL 指向测试库。**测试入口自身仅允许回环地址、明确测试库名、无 query 参数、显式口令；不会回退到 DATABASE_URL，不自动迁移，不清空任何库。测试启动时要求 workspace 数为 0，测试结束保留合成记录。重复跑请新建另一个空测试库，不自动删除已有数据。

覆盖目标：两个独立 Prisma 客户端的同键竞争、真实事务回滚、数据库组合外键拒绝跨空间绑定、并发 CAS、两 Worker 抢占及过期租约；R1 另覆盖写后故障回滚、来源历史约束、部分导入继续和查询次数。MemoryStore 通过不能替代这里。

## 6. 必跑浏览器清单

来源依据截止时点按当前浏览器/设备时区填写，保存为 UTC；这不是“所选日期结束时”。测试时核对界面显示的具体时刻。

用独立浏览器会话验证：管理员登录→创建编辑和审核员→各自激活→建立包含编辑/审核员的限定范围→编辑在该范围创建临时来源+人才→审核员核验→查看联系方式附加权限→预览合成 JSON→提交任务→Worker 执行→停用/到期拒绝下一次访问。

重点检查保存失败保留表单、重复点击、网络未知结果后原样重试、403/404/409/503 展示、一次性凭证未知结果后的显式核对、窗口关闭、键盘焦点、移动宽度、刷新恢复、退出后无旧业务页面、服务端无敏感日志。

编辑默认创建的“本人临时整理”范围只包含本人，管理员也不强制绕过。需要审核流时，**应在创建前配置并选择共同限定范围**。本增量尚未提供私有草稿的成员交接/转交命令，不能声称该协作场景已完整。

[examples/people-import.synthetic.json](../../examples/people-import.synthetic.json) 仅包含虚构资料。导入页面先选择一条可访问来源，粘贴数组；每批最多 100 行，不解析 CSV/Excel，也不自动合并同名人物。

## 7. 部署与恢复限制

Dockerfile 是候选构建文件，缺少真实锁文件时会有意失败。镜像 Node/PostgreSQL major 标签尚未固化 digest，镜像未构建。当前不提供“一键生产 Compose”。

正式上线前还缺：独立 DB 运行/迁移权限、镜像锁定、TLS/代理审查、只读挂载密钥、私有媒体、受控导出/删除、备份保留、恢复演练、依赖审计、浏览器及负载实测。不要将本地 once_dev 超级用户配置带到生产。

MAINTENANCE 或外部 recovery epoch 不匹配会拒绝业务访问和任务领取。这只是恢复隔离入口，不是完成的恢复工具；不能通过把旧 DB epoch 抄回密钥文件来“修好恢复”。没有完成删除/停用记录核对、密钥恢复及演练前，保持隔离。
