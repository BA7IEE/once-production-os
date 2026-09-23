# A1 后续补强：拒绝不产生业务写入、独立数据库 CI

输入：PR #2 的 `7c327b4e5bbd587f12c72ccafd20f39e4cb1a072`。只修改验收、CI 和交接说明；生产领域代码、数据库迁移、依赖与锁文件不变。PR 仍保持 Draft，不自动合并。

## 当前状态优先级

本文件补充原 `TEST_REPORT.md`、`REVIEW.md` 和 `IMPLEMENTATION_STATUS.md`。旧 A1/R1 成功日志仍保留，但只对应旧版本。本次新浏览器断言、独立 PG CI 与一键本地脚本必须重新执行，不能继承之前的绿色状态。

| 项目 | 本次状态 | 证据范围 |
|---|---|---|
| 原核心/传输回归 | 135/135 PASS | Node 22.16.0；MemoryStore；31 份核心及测试输入摘要与已核验 PR2 清单一致 |
| 新检查点辅助断言 | 17/17 PASS | 合成对象正反例；不是浏览器或 PostgreSQL |
| 本地验收脚本编排 | 9/9 PASS | 假 Docker/pnpm/git 的进程编排：成功、构建/迁移/PG/浏览器失败、脏工作树、远端或歧义 Docker 目标、清理归属不匹配 |
| JS/Shell 语法和显式开关拒绝 | PASS | `node --check`、`bash -n`；无授权开关时退出 2、未创建容器 |
| 修改后的真实浏览器验收 | NOT_RUN | 当前执行容器没有 pnpm/PG/Docker，npm DNS 不可用 |
| 修改后的完整构建及 PG 联调 | NOT_RUN | 未安装依赖，未连接用户电脑或任何真实数据库 |
| 新双任务 GitHub CI | PENDING_RUNNER | 只能以最终提交对应的实际运行结果更新；旧账单阻挡不等于已确认新运行失败 |

本次简要检查结果见 `artifacts/acceptance-followup-checks.json`；原始独立复跑日志随本次交接压缩包提供。`artifacts/verification.json` 等旧文件不重写、不当作本次构建证据。

## 代码修改

### 拒绝后的业务状态比较

新增仅供测试的 `captureImportCheckpoint`。在该测试的 Worker 已停止时，读取并复制目标任务、完整批次行、同来源人才与该任务的继续回执。暂停/版本变化前取得快照，拒绝后逐项比较；额外检查第一行恰有一条、第二行为零。

断言失败只输出场景和字段组说明，不将资料全文、检查点原文或凭证放进日志。会话和审计不在“不变”集合里：安全拒绝可以正常留下审计，不能为追求测试通过而删掉安全记录。

### 权限下降后的新会话

旧会话 401 的原用例保留。之后重新登录，确认 `/me` 返回 VIEWER、没有 `records.write`、界面没有批量导入入口；使用新会话和新 CSRF 请求继续操作，预期 403/FORBIDDEN，并再次验证任务、批次、人才和回执均不变。只有真实浏览器脚本执行后才可标 BROWSER_TESTED。

### 独立 PostgreSQL CI

保留 `browser-resume`，新增独立 `postgres-contract` job，各自使用新的 Runner、PostgreSQL 服务与不同数据库名。PG job 先应用迁移，再运行原 `pnpm verify:postgres`；浏览器 job 不预先迁移，由原浏览器入口在确认空库后自行迁移。两者不得共用已经被写入数据的库。

新增 concurrency，新的同 PR 运行取消旧的同 PR 运行，避免重复占用预算。两个检查都要针对最终提交完成，不能只看旧运行或只看 browser-resume。

## 需要本地执行时：一条命令

仓库工作树干净，Node/pnpm 与本机 Docker 已可用时：

```bash
ALLOW_LOCAL_ACCEPTANCE=yes bash scripts/verify-a1-followup-local.sh
```

该脚本由本轮直接编写，不要求本地 Agent 重新开发测试：

1. 只接受本机 Unix-socket Docker；拒绝远端/歧义目标和未保存的工作树。
2. 创建带唯一归属标记的新测试容器、随机回环端口、两份独立空库及临时凭证。
3. 执行冻结安装/完整构建/核心回归，检查点辅助测试，PG 契约及真实浏览器测试。
4. 任何失败都保持非零退出；结果放在 `artifacts/local-a1-followup-*`，不自动提交。
5. 退出时仅删除该脚本创建且标记匹配的测试容器及其匿名卷，删除它自己的临时凭证；不读写现有 `.env`、`.secrets`、开发库卷，不清空用户旧库。

脚本中的真实 Docker/浏览器路径仍需执行验证；编排模拟不能代替它。运行测试本身会更新部分原有 artifacts；这是测试产物，不能无审查提交、也不自动刷新旧 MANIFEST 来掩盖来源变化。

## Review 与未解决事项

- 保留原本的正向续跑和响应丢失测试，未削弱状态码或同键要求。
- 未把数据库故障注入放进生产入口；未更改运行权限和全局锁。
- 不新增官网、客户分享、财务等模块，不改变一期 AI 的范围。
- 这次不是完整恢复、真实资料试用或生产放行。
- 本地脚本不等于 GitHub Runner。即使本地执行成功，账单恢复后仍须跑最终提交的远端检查。
- 下一业务切片仍是受控资料交接；不混进本次验收 PR。

## 实现依据

GitHub 官方 PostgreSQL service container 指南说明了运行在 Runner 上的 job 使用映射端口访问本机服务；每个 job 在本设计中独立声明服务。Playwright Browser API 用于现有独立页面和会话验收。参考：

- https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers
- https://playwright.dev/docs/api/class-browser

这些文档是接口依据，不是本次 CI 已通过的证据。
