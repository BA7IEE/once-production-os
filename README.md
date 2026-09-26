> 当前增量：**DEV-09D Write-ahead Safety Intent + PostgreSQL/private media 同包备份恢复**。恢复证据见 [WP9_RECOVERY_WRITEAHEAD_MEDIA.md](docs/release/WP9_RECOVERY_WRITEAHEAD_MEDIA.md)。当前仍是开发 Draft，不接管正式资料。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/项目 → 检索/候选 → 受控导出 → 删除最终化 → Person merge → T29 隔离重建 → **恢复隔离/检查/零增量批准 → write-ahead + DB/private media 同包备份恢复**。

DEV-09D 功能冻结 head `9cc30cf71dc4e6fc97bd81f2308dd884a267c230` 在 Actions `36249594313` 五个 job 全绿：103 routes、295/295 core/transport、67/67 原 PG，以及真实 pg_dump/pg_restore + private media 恢复演练。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前维护能力

受控删除已完成 DEV-07F 专用最终化：依赖清理完成后，Source / Person / Work / Project 可进入严格 ERASED 最小头；LocalMediaProvider 会先物理清理原件/预览，再终结 Upload / Asset；SourceHistory 只允许专用单向脱敏；最终请求状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED。

Person merge 不是自动去重。它要求 `data.merge + records.write`、显式 preview、逐字段/逐关系决定和独立 `DATA_MERGE_MODE`。旧 ID 只读解析，写入继续拒绝；Handoff / UsePermission 不随身份转移；不同 Source 的 profile 值不会被静默改写到 canonical Source。

## 仍未完成

- DEV-09E：post-backup Safety Intent 的 committed/failed 配对与逐条 resolution；
- 正式 COS / PDF / 视频 provider；
- DEV-08 四类有界 AI；
- 最终性能/生产接管门。

当前恢复链对任何 post-backup journal delta 都会保守阻断；在 09E 完成前，不允许用人工勾选绕过。

## 继续开发入口

先读：

- [WP9 DEV-09D Write-ahead 与媒体备份恢复](docs/release/WP9_RECOVERY_WRITEAHEAD_MEDIA.md)
- [WP8 DEV-09A～09C Zero-delta 恢复链](docs/release/WP8_RECOVERY_ZERO_DELTA.md)
- [WP7 T29 隔离 JSON 重建](docs/release/WP7_JSON_REBUILD.md)
- [WP6 受控 Person merge](docs/release/WP6_PERSON_MERGE.md)
- [WP5 删除阻断与清理](docs/release/WP5_DELETION_CLEANING.md)
- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

下一刀是 **DEV-09E Safety Delta Resolution**。根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
