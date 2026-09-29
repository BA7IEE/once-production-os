# WP9｜DEV-09D Write-ahead Safety Intent 与私有媒体备份包

日期：2026-09-26。应用 `0.1.0-dev.1`。基线：DEV-09C / PR #21。分支：`feat/recovery-writeahead-media`，PR #22。

本工作包继续 FR-30，关闭两个 09C 明确留下的恢复缺口：

1. Safety Journal 不能依赖 5 秒异步补写来捕获备份点后的安全变化；
2. PostgreSQL dump 不能与 private media 分离，否则数据库可恢复但作品文件不可恢复。

功能冻结 head：`9cc30cf71dc4e6fc97bd81f2308dd884a267c230`。GitHub Actions `36249594313` 五个 job 全绿。

## 1. 所有 authenticated mutation 默认 write-ahead

不再维护容易漏项的“安全操作白名单”。

所有通用路由：

- `COMMAND`
- `SECRET`

都会在数据库事务前：

1. 先做当前 Session / 权限只读预检；
2. 对 Safety Journal fsync 一条 `intent.<operation>`；
3. intent 成功后才进入业务事务。

`READ / AUTH / BINARY` 不自动写 intent；特殊 password change 仍显式 write-ahead。

因此后续新增普通写接口，不需要开发者记得手工加 recovery allowlist，默认就受保护。

### fail closed

如果 Safety Journal 写失败：

- DB 事务不会开始；
- Receipt 不创建；
- Audit 不创建；
- 业务对象不修改；
- API 返回失败。

同一 Idempotency-Key 会派生稳定 intent ID；网络重试不会在真实 journal 中重复制造 post-backup delta。

## 2. 多进程 journal

Safety Journal 继续是数据库外独立文件，并增加：

- 文件级 lock directory；
- 锁内重新读取完整 hash chain；
- append 后 fsync；
- 两个 API/Worker/CLI writer 并发追加仍保持 seq/prevHash/hash 正确；
- 首次并发 open 也有测试，不会初始化两条不同 journal。

Worker：

- deletion cleanup；
- deletion finalization

在真正执行安全写前同样 write-ahead。

post-commit AuditEvent 仍由 Worker 周期性补写，作为数据库审计证据副本；write-ahead intent 才是防止崩溃窗口漏记的第一层。

## 3. staging / production 运行时门

当：

- APP_ENV = staging / production
- ACCESS_MODE = INTERNAL

时，`SAFETY_JOURNAL_FILE` 必须存在且为绝对路径，否则配置加载直接失败。

local / test 保持可选，避免破坏开发体验。

## 4. 备份进入 quiesced 模式

`recovery:backup` 现在要求：

- `BACKUP_QUIESCED=yes`
- `ACCESS_MODE=MAINTENANCE`
- egress / cleanup / merge execution gates 全部 DISABLED
- 没有 QUEUED/RUNNING durable job
- 没有可继续处理的 upload
- 没有 CLEANING deletion

备份开始前同步 Safety Journal 并冻结 backup head。

任何备份点后的 authenticated mutation 已有 write-ahead intent，因此即使事故发生在 DB commit / Audit / journal sync 之间，恢复批准仍会看到 post-backup delta 并保守阻断。

## 5. Backup manifest v2

`once-backup-manifest-v2` 同时绑定：

- PostgreSQL custom dump bytes + sha256；
- recovery epoch digest；
- Contact key digest；
- migration digest；
- Safety Journal id / sequence / head；
- private media stable backup identity；
- 每个 Asset：
  - asset id
  - upload id
  - object token
  - original bytes + sha256
  - preview bytes + sha256

manifest 自身仍有 manifestDigest。

数据库 dump 或 media bundle 任意替换、截断、改权限、改摘要都会在恢复链被拒绝。

## 6. private media 只按数据库 allowlist 备份

不会递归复制整个 MEDIA_ROOT。

只复制数据库中非 ERASED Asset 对应的：

- original.bin
- preview.jpg

明确不把：

- staging 文件；
- trash；
- 未入库残留；
- 不可解释文件

当成正式备份资产。

备份复制前先通过 LocalMediaProvider 校验数据库摘要；复制后再 hash 副本。

备份期间还会前后比较 Asset stable/runtime identity；发生漂移则不签发 manifest。

## 7. 媒体恢复

新增：

`pnpm recovery:restore-media`

输入：

- backup manifest v2；
- backup media bundle；
- fresh target MEDIA_ROOT。

只恢复 manifest allowlist；目标必须是全新/空目录。

恢复后并不直接认为文件可用，仍必须经过 `recovery:check`：

- original size/hash；
- preview size/hash；
- readonly permission；
- Asset stable identity；
- DB 当前 runtime identity。

## 8. approval 与 media identity

Recovery approval evidence 新增 media identity digest。

APPROVED 的数据库 CHECK 也强制：

- approval.mediaIdentityDigest
- report.media.backupIdentityDigest

完全一致。

因此不能拿“同一批 DB + 另一份 media bundle”拼接批准。

## 9. 真 PostgreSQL 验收

功能冻结：

`9cc30cf71dc4e6fc97bd81f2308dd884a267c230`

Actions：

`36249594313`

五个 job 全部 success。

通用验证：

- 103 request routes；
- core / transport：295 / 295；
- safety-intent：4 / 4；
- safety-journal：4 / 4；
- recovery：11 / 11；
- 原 PostgreSQL 合同：67 / 67；
- T29 rebuild fresh PostgreSQL：PASS；
- DEV-09A/B recovery fresh PostgreSQL：PASS；
- DEV-09D backup/restore approval PostgreSQL：PASS；
- browser-resume / handoff / media / production：全部 success。

CI 明确输出：

`PASS DEV-09D pg_dump/pg_restore+media: DB and private media restore together; zero journal delta approves; post-backup safety delta blocks`

该真实链执行：

1. fresh source PostgreSQL；
2. 创建真实 Source / Person / Contact / private media；
3. write-ahead Safety Journal；
4. quiesced backup；
5. pg_dump；
6. private media allowlist bundle；
7. 在另一 fresh DB pg_restore；
8. restore private media bundle；
9. recovery prepare；
10. restore-check；
11. 故意追加真实 post-backup safety intent → approval 阻断；
12. 零增量证据 → approve；
13. 新 recovery epoch 生效；
14. Source 仍保持 SUSPENDED、媒体仍保持恢复隔离语义，不自动“上线”。

## 10. 仍未完成

FR-30 仍不标记整体完成。

当前 post-backup Safety Intent 只用于**保守阻断**。

下一刀 DEV-09E 需要：

1. journal intent 与最终 commit/rollback 形成显式可验证配对；
2. 区分：
   - failed-before-commit intent；
   - committed delta；
   - prepare 已保守覆盖的 delta；
   - 必须人工处理的 delta；
3. 对 post-backup delta 生成 resolution plan；
4. 只有所有 delta 都有可验证 resolution，才允许非零增量 restore approval；
5. 不允许“管理员勾选忽略”。

下一刀：**DEV-09E Safety Delta Resolution**。
