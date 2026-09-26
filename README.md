> 当前增量：**DEV-07F 删除最终化 + DEV-07G 受控 Person merge + DEV-07H / T29 隔离 JSON 重建**。T29 详见 [WP7_JSON_REBUILD.md](docs/release/WP7_JSON_REBUILD.md)。当前仍是开发 Draft，不接管正式资料。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单 → 受控 JSON 导出 → 删除最终化 → 受控 Person merge → **隔离 JSON 重建**。

T29 功能冻结 head `feeab369396bf85536c92e3f8812d2bd50d3be9a` 在 Actions `36220456451` 五个 job 全绿：103 条请求契约、274/274 core/transport、67/67 原 PostgreSQL 合同、真实 once-export-v1 → fresh once_rebuild_* PostgreSQL 的 10 人/3 作品/1 项目重建，以及 CLI digest/目标/replay 安全门。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前维护能力

受控删除已完成 DEV-07F 专用最终化：依赖清理完成后，Source / Person / Work / Project 可进入严格 ERASED 最小头；LocalMediaProvider 会先物理清理原件/预览，再终结 Upload / Asset；SourceHistory 只允许专用单向脱敏；最终请求状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED。

Person merge 不是自动去重。它要求 `data.merge + records.write`、显式 preview、逐字段/逐关系决定和独立 `DATA_MERGE_MODE`。旧 ID 只读解析，写入继续拒绝；Handoff / UsePermission 不随身份转移；不同 Source 的 profile 值不会被静默改写到 canonical Source。

## 仍未完成

- DEV-09 / FR-30：备份、恢复、restore-check、密钥/私有媒体一致性与正式升级演练；
- 正式 COS / PDF / 视频 / 原件完整生命周期；
- 四类有界 AI；
- 正式数据接管。

T29 只重建受控 `once-export-v1` 业务图，不是备份恢复。ACTIVE Work 因没有媒体字节不允许伪造恢复，ACTUAL participant 因旧导出没有依据 note 不允许凭空重建。

## 继续开发入口

先读：

- [WP7 T29 隔离 JSON 重建](docs/release/WP7_JSON_REBUILD.md)
- [WP6 受控 Person merge](docs/release/WP6_PERSON_MERGE.md)
- [WP5 删除阻断与清理](docs/release/WP5_DELETION_CLEANING.md)
- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

下一刀是 **DEV-09 / FR-30 备份与恢复演练**。T29 已完成；不要再把 JSON rebuild 当作 backup restore。根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
