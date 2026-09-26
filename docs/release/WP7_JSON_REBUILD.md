# WP7｜DEV-07H / T29 隔离 JSON 重建

日期：2026-09-26。应用 `0.1.0-dev.1`。基线：DEV-07G / PR #17。开发分支：`feat/json-rebuild`，PR #18。

本工作包关闭 FR-29 / T29 的“内部 JSON 导出后可在隔离环境重建”切片。它是受控迁移工具，**不是数据库备份恢复，也不是普通后台导入功能**。

功能冻结 head：`feeab369396bf85536c92e3f8812d2bd50d3be9a`。GitHub Actions `36220456451` 五个 job 全绿。

## 1. 输入边界

重建器只接受严格校验的 `once-export-v1`：

- Source；
- Person；
- Work；
- Project；
- WorkCredit；
- ProjectParticipant；
- ProjectWork；
- media identity 清单。

不会从 JSON 重建：

- User / Membership；
- Session / Activation；
- 密码哈希、CSRF key、Contact key、recoveryEpoch；
- Contact；
- FieldEvidence；
- Audit 历史；
- CommandReceipt；
- ExportJob / UsePermission；
- Source 原始 `textPayload`；
- 未被导出的字段；
- 私有媒体二进制原件/预览。

Schema 使用 strict object：未知字段直接拒绝，不能把密码、token、密文或自定义旁路字段偷偷塞进重建包。

## 2. 源 Export 摘要门

`CHECK` 可以只验证包结构和目标环境，不写业务数据。

`APPLY` 额外要求：

```text
--expected-sha256 <READY Export.payloadDigest>
ALLOW_REBUILD=yes
```

CLI 先用与 Export 相同的 digest 规则计算输入 JSON；不一致时返回 `REBUILD_DIGEST_MISMATCH`，**在任何数据库连接/写入前停止**。

因此 APPLY 的来源不是“任意符合 Schema 的 JSON”，而是被人工带入的、与原 READY Export `payloadDigest` 一致的冻结 payload。

成功后目标环境 Audit：

- action = `rebuild.apply`
- resourceKind = `rebuild-export`
- resourceId = 源 `exportId`

SourceHistory 不被滥用来存迁移 metadata。

## 3. 目标环境安全门

CLI 只读取 `DATABASE_URL_REBUILD`，刻意忽略普通 `DATABASE_URL`。

只允许：

- PostgreSQL；
- loopback：`127.0.0.1 / localhost / ::1`；
- 数据库名必须匹配 `once_rebuild_*`；
- 显式账号和密码；
- 无 query string / hash。

目标安装还必须：

- 已完成 bootstrap；
- 只有 1 个 workspace；
- 只有 1 个已激活 ADMIN 用户/成员；
- 只有 bootstrap 的 WORKSPACE scope；
- 没有待处理 Activation；
- 业务表为空。

允许目标管理员先通过正常 API 补齐 Dictionary；因此 catalog preparation 产生的 target-local Audit / CommandReceipt 不会被误判为“已有业务数据”。

工具不会：

- drop database；
- truncate；
- reset；
- 自动 migrate；
- 合并到已有业务图；
- 自动覆盖既有记录。

## 4. 重建语义

重建保留：

- Source UUID；
- Person UUID；
- Work UUID；
- Project UUID；
- 关系两端 UUID。

统一重绑到目标环境：

- workspaceId；
- WORKSPACE scope；
- maintainer；
- 当前目标管理员。

Source：

- 只接受当前有效的 `INTERNAL_USE / CONFIRMED` 快照；
- `textPayload` 为空，因为原文不在受控导出；
- protectionEpoch 增 1，表示跨环境重建边界；
- 写一条 `BASELINE` SourceHistory；
- BASELINE 的 `actorId=null`、`decisionReason=null`，不伪造原审核历史；
- 实际执行人由独立 `rebuild.apply` Audit 记录。

## 5. 正常业务规则不能被重建器绕过

重建器直接写 Store，因此额外补了与正常 API 等价的约束：

- 分类代码必须在目标 Dictionary 中存在且启用；
- roles / languages / skills / workType 不能含重复代码；
- Work / Project 标题 trim 后不能为空；
- ONCE origin 必须有 originNote；
- 单 Work 最多 30 个媒体身份、50 条署名；
- 单 Project 最多 50 条参与、30 条作品关系；
- 全包关系总量有额外安全上限；
- 关系两端必须都在本次闭包内；
- relation 不能重复；
- media position 必须从 0 开始连续；
- 同 Work 不能重复同一 Asset link；
- 同一个 Asset UUID 可以被多个 Work 合法复用，但其 fileName/mime/bytes/sha256/尺寸/source/revision 必须完全一致。

## 6. 当前 intentionally 不重建的状态

### ACTIVE Work

`once-export-v1` 只有媒体 identity，没有私有媒体字节、objectToken、preview 文件。

因此 ACTIVE Work 不能被原样恢复为“可用作品”，否则系统会声称存在实际没有的媒体。当前直接返回 `REBUILD_MEDIA_BYTES_REQUIRED`。

### ACTUAL ProjectParticipant

现有 export relation 只冻结 state / role，不导出 ACTUAL 所要求的真实依据 note。

因此 ACTUAL participant 返回 `REBUILD_RELATION_DETAIL_MISSING`，不会凭空生成依据。

### Media

media identity 只校验闭包和一致性，Summary 明确：

`mediaRestored = 0`

不会创建假的 Upload / Asset 或空 objectToken。

## 7. 事务与失败语义

APPLY 是一个数据库事务：

1. 重新验证目标仍隔离/空；
2. 验证完整闭包；
3. 写 Source + BASELINE；
4. 写 Person / Work / Project；
5. 写关系；
6. 最后写 `rebuild.apply` Audit。

Audit 注入失败时，前述所有业务写全部回滚。

成功后再次对同一目标执行会得到 `REBUILD_TARGET_NOT_EMPTY`，不会重复写第二份。

## 8. 实际 T29 验收

功能冻结 head：

`feeab369396bf85536c92e3f8812d2bd50d3be9a`

Actions：

`36220456451`

五个 job 全部 success。

通用验证：

- 请求契约：103；
- core / transport：274 / 274；
- `rebuild.test.ts`：11 / 11；
- PostgreSQL 原有合同：67 / 67；
- 原生表单 Chromium：6 / 6；
- browser-resume：17 / 17；
- browser-production / handoff / media 全绿。

T29 真 PostgreSQL 有两层：

### A. 真实 Export → 真实重建

在 source `once_test_*` DB 内：

- 正常 API 创建 10 Person；
- 3 Work；
- 1 Project；
- 3 WorkCredit；
- 2 ProjectParticipant；
- 3 ProjectWork；
- 创建真实 INTERNAL_EXPORT UsePermission；
- 真实 Export Worker 生成 READY `once-export-v1`；
- 取得真实 `payloadDigest`。

然后在独立 fresh `once_rebuild_*` DB：

- migrate；
- bootstrap；
- CHECK；
- 注入 Audit 故障验证整批回滚；
- 用真实 `payloadDigest` CLI APPLY；
- 直接查询 PostgreSQL 验证稳定 UUID 与 10 / 3 / 1 业务图；
- 验证 Contact / Evidence / Session / Export 等未被重建；
- 验证第二次 APPLY 被拒。

### B. CLI 安全门

独立 fresh `once_rebuild_*` DB 额外验证：

- CHECK 零写；
- 普通 `once_test_*` URL 被拒；
- 错误 `--expected-sha256` 在 DB access 前被拒；
- 正确摘要 + `ALLOW_REBUILD=yes` 才 APPLY；
- 第二次 APPLY 被拒。

CI 明确输出：

`PASS DEV-07H T29 PG/CLI: CHECK zero-write -> 10 people/3 works/1 project APPLY -> stable ids/relations; unsafe target and replay rejected`

## 9. T29 与 DEV-09 的边界

T29 已满足规格中的：

- “10 人 / 3 作品 / 1 项目关系在隔离空间重建”；
- 稳定关系；
- 来源可解释；
- 不含 Session / key / 未选字段；
- 不依赖商业/网站表。

但 T29 **不是备份恢复**。

它不保存：

- 数据库全量；
- 账号体系；
- 密钥；
- 私有媒体；
- 运行时配置；
- 删除/审计完整历史。

下一刀进入 **DEV-09 / FR-30：备份、恢复、restore-check 与维护演练**。
