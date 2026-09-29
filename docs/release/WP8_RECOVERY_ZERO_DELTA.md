# WP8｜DEV-09A～09C 恢复隔离、Restore Check 与零增量批准

日期：2026-09-26。应用 `0.1.0-dev.1`。基线：DEV-07H / T29。当前开发分支：`feat/recovery-approval`，PR #21。

本工作包推进 FR-30 / DEV-09，但**仍不宣告 FR-30 完成**。

已完成的是一条保守恢复链：

```text
old backup
  ↓
fresh once_restore_* PostgreSQL
  ↓
MAINTENANCE
  ↓
DEV-09A prepare / quarantine
  ↓
DEV-09B DB + CONTACT_KEY + private-media restore-check
  ↓
DEV-09C Safety Journal + backup manifest
  ↓
仅 backup 后 0 条安全增量时 approve recoveryEpoch
  ↓
仍保持 MAINTENANCE
```

当前不会因为“恢复成功”自动开放 INTERNAL，也不会自动恢复旧授权、来源或媒体可用状态。

---

## 1. DEV-09A｜恢复隔离与旧能力失效

功能冻结 head：

`9781f1c2f4e47b9fcb6e6bff4f111e106f4e086c`

Actions：

`36222654621`

五个 job 全绿。

### 恢复前置条件

`recovery:prepare` 只接受：

- `ACCESS_MODE=MAINTENANCE`
- `DATA_EGRESS_MODE=DISABLED`
- `DATA_CLEANUP_MODE=DISABLED`
- `DATA_MERGE_MODE=DISABLED`
- loopback `once_restore_*` PostgreSQL
- 显式 `DATABASE_URL_RECOVERY`
- 部署侧新的 recovery epoch
- 旧数据库 recovery epoch 的 SHA-256 摘要

普通 `DATABASE_URL` 不作为 fallback。

### Prepare 的保守处置

在一个事务中：

- 旧 Session 全 revoke；
- 未消费 Activation 全 consume；
- 所有 User sessionEpoch 提升；
- 除指定维护 ADMIN 外，旧 User / Membership 默认 DISABLED；
- PENDING / ACCEPTED Handoff → REVOKED；
- ACTIVE UsePermission → REVOKED；
- 非 ERASED Export → STALE，清 payload / payloadDigest；
- QUEUED / RUNNING Job → FAILED(`RESTORE_REVIEW_REQUIRED`)；
- 非终态 Upload → FAILED；
- READY Asset → QUARANTINED；
- RECEIVED / CONFIRMED Source → SUSPENDED，protectionEpoch 提升并写 SourceHistory；
- 新建 `RecoveryRun(state=PREPARED)`；
- 写 `recovery.prepare` Audit。

**prepare 不修改 workspace.recoveryEpoch。**

所以即使恢复数据库已经能启动，只要部署侧使用新 epoch，普通 INTERNAL 登录仍被 recovery boundary 阻断。

Audit 写失败时整个 prepare 回滚。

---

## 2. DEV-09B｜Restore Check

功能冻结 head：

`dfdacc4a8581837aad8f58030d9be981a94aefd5`

Actions：

`36224012436`

五个 job 全绿。

### 两种模式

`recovery:check` 默认 CHECK：

- 零写；
- 只返回当前 report。

显式：

```text
--record
ALLOW_RECOVERY_CHECK=yes
```

才把报告写入 `RecoveryRun(state=INSPECTED)`。

即使报告有 blocker，也可以持久化证据；`INSPECTED` 不代表可批准。

### Database safety state

检查：

- workspace 仍是旧 recovery epoch；
- 无未 revoke Session；
- 无待激活 Activation；
- 除维护 ADMIN 外无 ACTIVE 旧 User / Membership；
- 无活动 Handoff / UsePermission；
- 无 READY / QUEUED 旧 Export；
- 无 QUEUED / RUNNING Job；
- 无 runnable Upload；
- 无 READY Asset；
- 无 RECEIVED / CONFIRMED Source；
- 无 CLEANING 中的 DeletionRequest。

当前 DB 安全状态会生成 `databaseStateDigest`。

检查后只要这些状态发生变化，下一次 report digest 会不同。

### Contact key

Restore Check 实际读取全部 Contact ciphertext，并用恢复后的 `CONTACT_KEY_FILE` + 原 AAD 解密。

不会仅比较 key 文件名或配置字符串。

错 key → `CONTACT_KEY_MISMATCH`。

report 只记录：

- key digest；
- Contact 数量；
- 解密失败数量。

不写明文。

### PostgreSQL migration

CLI 读取：

- 当前代码目录中的 migration 列表；
- 恢复数据库 `_prisma_migrations` 已完成列表。

两边完整集合不一致 → `MIGRATION_MISMATCH`。

### Local private media

`LocalMediaProvider.openExisting()` 是只读恢复入口：

- 不 mkdir；
- 不 chmod 修复；
- 不创建 marker；
- 要求 root 是已登记私有目录；
- 目录权限必须私有；
- original / preview 必须是只读普通文件；
- 实际核对 bytes + SHA-256。

report 记录：

- expected Asset IDs；
- verified / missing / mismatch IDs；
- 当前 Asset identity digest。

Asset DB 元数据变化后，即使 ID 不变，旧媒体证据也会变 stale。

---

## 3. DEV-09C｜独立 Safety Journal

核心问题：数据库备份可能落后于业务当前状态。

如果某成员在备份后被停用，旧备份恢复时会把他重新变成 ACTIVE；只看恢复后的数据库无法知道这是“过去状态”。

因此新增**数据库之外**的 Safety Journal。

### 文件格式

`once-safety-journal-v1`

- JSON Lines；
- 第一行 header；
- 后续每行一条事件；
- sequence 单调；
- 每条记录包含 prevHash；
- SHA-256 hash chain；
- Audit ID 不能重复；
- 文件必须 0600 类权限；
- 父目录必须私有。

journal 只写 Audit metadata：

- auditId；
- workspaceId；
- createdAt；
- action；
- resourceKind；
- resourceId；
- changedFields。

不复制业务正文、密码、Contact、token。

明显只读事件，如登录成功/拒绝、logout、contact.read、preview/download，不进入安全链。

Worker 当前每约 5 秒从已提交 AuditEvent 补写 journal；`safety-journal` CLI 也可以显式 sync / verify。

---

## 4. Backup Manifest

`recovery:backup` 的顺序：

1. 先把当前已提交 AuditEvent 同步到 Safety Journal；
2. 冻结 journal id / sequence / headHash；
3. 核对 migration 集合；
4. 执行真实 `pg_dump --format=custom`；
5. 数据库 dump chmod 为私有；
6. 计算 dump bytes + SHA-256；
7. 写 `once-backup-manifest-v1`。

manifest 绑定：

- backupId；
- applicationVersion；
- dump bytes / sha256；
- 旧 recoveryEpoch digest；
- Contact key digest；
- migration digest；
- Safety Journal journalId / sequence / headHash；
- manifest 自身 digest。

manifest 必须私有；dump 在 approval 时也重新要求私有文件权限。

### 为什么 journal 锚点在 pg_dump 之前

如果备份锚点之后有业务/安全写入：

- 即使 PostgreSQL snapshot 恰好包含部分新写；
- 这些事件仍属于 post-backup safety delta；
- 当前 09C 一律拒绝自动批准。

这是保守选择。

---

## 5. 零增量 Recovery Approval

`recovery:approve` 默认只做 eligibility CHECK。

真正写入需要：

```text
--apply
ALLOW_RECOVERY_APPROVE=yes
```

### 批准前重新验证

- 原 `.dump` SHA-256 / bytes 与 manifest 一致；
- manifest 自身 digest 正确；
- Safety Journal 是同一 journalId；
- journal 包含 manifest 里的 backup sequence / headHash；
- 当前 restore-check 仍无 blocker；
- Contact key digest 一致；
- migration digest 一致；
- DB / Contact / media 当前状态与持久化 report 仍一致；
- workspace 仍保留旧 recovery epoch；
- Safety Journal 当前 head = backup head；
- postBackupEntries = 0。

只要 backup 后多 1 条 journal 事件：

`RECOVERY_JOURNAL_DELTA_UNRESOLVED`

当前版本**没有人工跳过按钮**。

### approve 做什么

一个数据库事务中只做：

- workspace.recoveryEpoch → 部署侧新 epoch；
- RecoveryRun → APPROVED；
- 保存 approval evidence + digest；
- 写 `recovery.approve` Audit。

Audit 失败则 workspace epoch 与 RecoveryRun 全部回滚。

approve 不会：

- re-enable 旧成员；
- re-enable Source；
- unquarantine Asset；
- 恢复旧 Handoff / UsePermission / Export；
- 把部署 `ACCESS_MODE` 改成 INTERNAL。

因此批准完成后，部署仍应保持 MAINTENANCE，由维护人员做最终人工复核。

---

## 6. 真实 PostgreSQL 演练

09C 功能冻结 head：

`5846934c04c99c813b5aa3e2314a3d32a908a940`

Actions：

`36227263791`

5 个 job 全部 success。

### 通用测试

- 请求契约：103；
- core / transport：290 / 290；
- recovery core：11 / 11；
- Safety Journal：3 / 3；
- Backup Manifest：2 / 2；
- 原 PostgreSQL 合同：67 / 67；
- browser-production 原生表单：6 / 6；
- browser-resume / handoff / media / production：全部 success。

### 真恢复链

CI 会新建：

- `once_backup_*`；
- `once_restore_approval_*`。

然后：

1. source DB migrate；
2. bootstrap；
3. 正常 API 创建 Source / Person / Contact；
4. Safety Journal sync；
5. 真实 `pg_dump --format=custom`；
6. 写 backup manifest；
7. 在备份后真实执行 `source.suspend`；
8. 将新 AuditEvent append 到同 journalId 的安全日志副本；
9. 真实 `pg_restore` 到另一 fresh DB；
10. `recovery:prepare`；
11. `recovery:check --record`；
12. 用含 post-backup delta 的 journal approve → 必须阻断；
13. 用 backup head 零增量 journal eligibility → PASS；
14. `ALLOW_RECOVERY_APPROVE=yes --apply`；
15. workspace recovery epoch 切到新值；
16. RecoveryRun = APPROVED；
17. Source 仍保持 SUSPENDED；
18. 最后由测试显式使用 INTERNAL 配置启动 Application，管理员可重新登录，但依赖 suspended Source 的业务档案仍 404。

CI 明确输出：

`PASS DEV-09C pg_dump/pg_restore: zero journal delta approves new epoch; one real post-backup source.suspend audit blocks approval`

---

## 7. 为什么 FR-30 仍未完成

当前恢复链已经从“有 recoveryEpoch 字段”推进到真实 pg_dump / pg_restore / key / media / journal / approval。

但仍有至少三项必须继续：

### 7.1 Safety Journal 仍是提交后补写

当前 Worker 约每 5 秒 sync。

极端情况：

1. DB 安全变更已 commit；
2. journal 尚未 fsync；
3. 机器/DB 立刻不可恢复。

则外部 journal 可能缺少最后一小段变化。

因此下一刀必须做**同步或 write-ahead 的外部安全意图记录**，不能把 5 秒补写当作最终安全保证。

### 7.2 当前 backup CLI 只生成 PostgreSQL dump

09B 能验证一个已经恢复好的 private MEDIA_ROOT，但 09C backup 还没有：

- 自动生成私有媒体备份集合；
- 文件级备份 manifest；
- 真正从媒体备份恢复到 fresh root。

所以“数据库 + 私有媒体一致性备份”还未关闭。

### 7.3 当前只允许 0 安全增量

一旦 backup 后有任何 journal event，当前直接阻断 approve。

这很安全，但没有实现规格要求的“根据 Safety Journal 重新应用/人工核对备份点后的停用、撤销、删除等安全变化”。

需要下一切片做显式 resolution；不能加“忽略并继续”。

---

## 8. 下一刀

**DEV-09D：write-ahead safety intent + 私有媒体备份包。**

顺序：

1. 把安全事件从“5 秒后补写”升级为事务提交前/返回前的外部 write-ahead intent；
2. 文件写失败时业务写 fail closed；若 DB 后续回滚，只产生保守 false-positive journal delta；
3. 增加跨进程 journal lock，防 API / Worker / CLI 并发 append；
4. backup 在受控 quiesced 状态下生成 DB + private media 一致性 bundle；
5. 在 fresh restore DB + fresh media root 做完整恢复；
6. 然后再做 DEV-09E post-backup safety delta resolution。

在 09D/09E 关闭前，FR-30 继续标记为 **PARTIAL / NOT COMPLETE**。
