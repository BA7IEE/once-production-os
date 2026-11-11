# ONCE 停止栅栏：备份、恢复与版本兼容专项

本轮基线是 Draft PR #41 的 `89744a2ca4a49dde6f5202c65f82ba209fc0fabe`。此记录和随附结果绑定本次提交的源码及各自文件摘要；基线 CI 不能算本次提交通过。所有数据为合成数据，未连接真实认证、通知或 COS。没有合并、部署、生产迁移或启用停止开关。

## 已发现并处理

1. 基线的安全 journal 对同账号、同请求键的停止尝试复用标记。隔离合成测试中，停止先因限额返回 429，备份锚点之后同键重试已提交但完成标记丢失；数据库已有一条停止回执，锚点后的 journal 条目和待处理增量却均为零。保留[首轮失败](evidence/once-stop-restore-20261111/anchor-retry-before.tap)、[当时的测试源码](evidence/once-stop-restore-20261111/anchor-retry-before.test.ts)及[源码摘要](evidence/once-stop-restore-20261111/anchor-retry-before.sha256)。这是 MemoryStore 和真实文件 journal 的反例，不能冒称物理数据库备份。
2. 新停止请求每次写独立 journal 意图，业务命令键和回执的幂等语义不变。正式恢复 CLI 在同一 journal 锁内检查锚点之前未闭合的旧停止意图；不能证明闭合时，无论 CHECK 或 APPLY 都增加阻断。旧日志不改写，不以 404、重试或 abort 推断原操作未发生。
3. 逐次记录意图引入的日志增长风险已在认证后、写日志前增加账号级尝试限速，含重放；原每小时 10 个新栅栏限制仍在。保留[限速前的合成负控](evidence/once-stop-restore-20261111/rate-before.tap)及[摘要](evidence/once-stop-restore-20261111/rate-before.sha256)。
4. 基线恢复检查摘要未包含停止回执；检查后回执增删或改变不一定使批准失效。同账号同键停止回执与原业务回执同时存在时也未报冲突。[原始合成失败](evidence/once-stop-restore-20261111/receipt-before.tap)保留。补丁将完整停止回执纳入有栅栏时的检查摘要，并对同账号同键冲突保守阻断；无停止回执时保持旧摘要合同。
5. JSON 业务重建原本可能接受已有有效人才账号、身份和会话的目标；[原始合成失败](evidence/once-stop-restore-20261111/rebuild-before.tap)保留。现有 CHECK 和 APPLY 共用检查会拒绝六类人才认证表任一非空的目标，不删除记录；管理员自身字典准备回执仍允许。业务 JSON 不包含源认证、命令回执或停止栅栏，不能当物理灾难恢复使用。

## 已知阻断与信任条件

- 未闭合的历史停止意图可能让后续所有包含该历史的备份持续无法批准恢复；当前没有已审定的自动核对/解除机制。不得手改 journal、伪造 abort、换空日志或删除阻断以获得可用性。
- 即使停止请求仅重放已有回执，没有新增业务副作用，新记录的锚点后完成标记也仍会按停止操作阻断恢复。可验证的重放证明与受控解除机制尚未设计，不能仅凭调用方声称重放而放行。
- journal 哈希链与备份锚点能校验手头文件的一致性，却不能证明交给恢复程序的是最新完整日志：一个恰好截在备份锚点的旧完整副本可能与清单匹配。清单摘要本身是普通 SHA-256，不是独立签名。安全恢复需要经产品和运营审定、独立可信的最新日志/备份完整性见证及源写入停止证据；当前未完成，不能声称完整恢复闭环。
- 校验传入的 dump 符合清单，不等于证明当前恢复目标完整装载了 dump。新摘要绑定检查与批准之间的变化；若停止回执在首次检查前已遗漏，它无法自己发现。需要与实际 PG 一致性快照和备份清单绑定的独立栅栏数量/摘要见证，再与恢复目标比对；旧清单缺少见证时结论仍未知。
- 没有自动检测所有写入实例版本的机制。旧版本 `2e327e0` 的 portal 写入不检查停止栅栏；关闭开关也不能让旧写入者识别已有栅栏。启用或回滚前须停止并排空旧实例和在途请求、核对存量栅栏并满足待审定的恢复条件。不要因本地专项通过就启用功能。
- 新恢复冲突检查针对每批最多 500 个停止键查询同工作区回执；大规模回执下的时延与事务上限尚未测，不从小样本外推。
- 源码没有任何迁移修改。真实供应商、真实 COS、真实通知、生产恢复/部署、混合版本线上切换、物理手机和真实业务试点均未执行。

## 本轮专项和资源

- `node --experimental-strip-types --test --test-concurrency=1 tests/core/portal-command-stop-server.test.ts tests/core/portal-stop-anchor-retry-20261111.test.ts tests/core/portal-stop-recovery-boundary.test.ts`：本地 **36/36**；业务存储为 MemoryStore，安全 journal 为真实文件。包含默认关闭的响应、已有栅栏在关闭后仍由新写入者执行、120 次总请求/10 次新栅栏限额、历史标记异常和 post-anchor 重试。[TAP](evidence/once-stop-restore-20261111/stop-focused.tap)及[运行时源码摘要](evidence/once-stop-restore-20261111/stop-focused.sha256)。默认关闭时停止接口仍返回 503，但其被拒请求不再提交会话 idleUntil 刷新，不应理解为数据库副作用逐字节不变。
- `node --experimental-strip-types --test --test-concurrency=1 tests/core/rebuild-active-auth-isolation.test.ts tests/core/rebuild.test.ts`：本地 **20/20**，[TAP](evidence/once-stop-restore-20261111/rebuild-focused.tap)。[源码摘要](evidence/once-stop-restore-20261111/rebuild-focused.sha256)是根据测试后的工具输出整理，并与当前文件重算一致；当时未另存摘要文件。各认证表单独非空测试在 MemoryStore 构造，不能声称违反 PostgreSQL 外键的行可真实存在。
- 停止回执格式/摘要/同键冲突合成专项：本地 **31/31**，[TAP](evidence/once-stop-restore-20261111/receipt-focused.tap)、[源码摘要](evidence/once-stop-restore-20261111/receipt-focused.sha256)、[资源记录](evidence/once-stop-restore-20261111/receipt-focused-resources.json)。恢复结构校验初次复验 21/25：四个失败是旧测试仍期待 `RECOVERY_CHECK_STALE`，实际更早被 `RECOVERY_BLOCKERS_PRESENT` 拒绝；[首轮记录](evidence/once-stop-restore-20261111/receipt-structure-first-retest.tap)、[生产源码](evidence/once-stop-restore-20261111/receipt-structure-first-retest.recovery.ts)及[对应测试源码](evidence/once-stop-restore-20261111/receipt-structure-before.test.ts)保留。
- `pnpm typecheck` 经仓库 heavy-task 资源护栏执行通过；`pnpm contract:check` 验证 381 条路由通过；`pnpm review:static` 12/12 通过。它们分别是类型、合同和静态检查，不替代 PG、浏览器或远端 CI。
- `git diff --check` 对保留原样的失败 TAP 中空白行报告尾随空格；排除原始 TAP 后源码及其他交付文件检查通过。未为消除提示改写原始测试输出。
- 真实 PostgreSQL 专项首轮在备份前的故障注入断言处中止，并未执行物理恢复；[原始结果](evidence/once-stop-restore-20261111/pg-first-failure.json)、[运行脚本快照](evidence/once-stop-restore-20261111/pg-first-script.mjs)、[资源记录](evidence/once-stop-restore-20261111/pg-first-resources.json)保留，资源为 FAIL / ZERO_RESIDUE。后续结论按实际复验另记，不改写首轮。
- 修正夹具预期后，以 `source /workspace/.once-cloud/env.sh`、`ONCE_RUNNER=managed-linux`、独立证据目录和 `/usr/local/bin/docker-init -s -- node scripts/test-stop-recovery-pg-20261111.mjs` 运行：[复验记录](evidence/once-stop-restore-20261111/pg-recovery.json)有 11 条观察，资源 `efe1ffe354cd73a0d7a49527` 为 [PASS / ZERO_RESIDUE](evidence/once-stop-restore-20261111/pg-recovery-resources.json)。故障注入实际返回 `503 STORE_UNAVAILABLE`，回执和审计均回滚，确认首轮错误是夹具错误预期 500。真实 PG16 `pg_dump`/`pg_restore` 至两个预先登记的隔离库，备份前已建立的停止回执随物理恢复保留；恢复始终处于 MAINTENANCE，旧会话被撤销。备份后停止在旧快照中缺失，但真实 journal 的对应增量和锚前未闭合意图使正式恢复 CLI 的 CHECK 退出 3 并阻断。另验证锚点后同键重试已真实提交、完成标记丢失时特定未闭合增量阻断。恢复目标业务重放和 CLI APPROVE APPLY 未执行；这是 Core Application/PrismaStore 加真实 PostgreSQL，未启动 Nest、浏览器或真实供应商。
- 独立 mixed 负控以同样的受监督方式运行 `node scripts/test-stop-mixed-pg-20261111.mjs`，使用真实 `2e327e0` 归档核心代码及当前核心，各自建立进程内 Application 并共用当前 PrismaStore 和隔离 PG。新写入者单独建立栅栏后，同键迟到请求被新代码拒绝 409；故意重新引入旧写入者，同键请求返回 200，实际数据库业务状态改为 `WITHDRAWN`、版本递增，留下两条同账号同键回执，之后新状态读取返回 `PENDING_STATUS_AMBIGUOUS`。这是[预期危险被证实的负控 PASS](evidence/once-stop-restore-20261111/pg-mixed.json)，不表示混跑安全；[资源](evidence/once-stop-restore-20261111/pg-mixed-resources.json) `8864dc539d19e86998a36001` 为 PASS / ZERO_RESIDUE。未运行两个独立 OS 进程、Nest 或历史完整部署切换。

远端 CI 须按实际推送的提交 SHA 单独核对；未执行项不能计为通过。此前 `4f4443c6f4de72446fdb94f7`、`80a96f46009486b9ced0dd9f` 的 CLEANUP_FAILED 原始记录和后续人工核对保留于 [原台账](evidence/once-media-ux-20261111/)。
