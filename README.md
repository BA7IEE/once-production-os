> 当前增量：**DEV-07F 专用删除最终化 + DEV-07G 受控 Person merge**。Person merge 详见 [WP6_PERSON_MERGE.md](docs/release/WP6_PERSON_MERGE.md)。当前仍是开发 Draft，不接管正式资料。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单 → 受控 JSON 导出 → 删除影响预览/阻断/清理/专用最终化 → **受控 Person merge**。

Person merge 功能冻结 head `1673272979e338ede4ddf09952c941cae7344070` 在 GitHub Actions `36217418690` 五个 job 全绿：103 条请求契约、263/263 核心/传输、67/67 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前维护能力

受控删除已完成 DEV-07F 专用最终化：依赖清理完成后，Source / Person / Work / Project 可进入严格 ERASED 最小头；LocalMediaProvider 会先物理清理原件/预览，再终结 Upload / Asset；SourceHistory 只允许专用单向脱敏；最终请求状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED。

Person merge 不是自动去重。它要求 `data.merge + records.write`、显式 preview、逐字段/逐关系决定和独立 `DATA_MERGE_MODE`。旧 ID 只读解析，写入继续拒绝；Handoff / UsePermission 不随身份转移；不同 Source 的 profile 值不会被静默改写到 canonical Source。

## 仍未完成

**CLEANING 不等于删除完成。** 当前以下项目会明确停在 WAITING_EXTERNAL 或继续保持阻断，不会假报完成：

- FR-29 / T29 的隔离 JSON 重建；
- DEV-09 备份恢复与正式升级演练；
- 正式 COS / PDF / 视频 / 原件生命周期；
- 四类有界 AI 与最终一期接管门。

FR-13 / T13 的当前删除链和 FR-03 / T03 的受控 Person merge 已具备实现与隔离验收证据。FR-29 / T29 隔离 JSON 重建、DEV-09 备份恢复、正式 COS/PDF/视频/原件生命周期、机构/品牌、内部双语文本、四类有界 AI、正式数据升级与恢复演练仍在一期范围。

生产 `DATA_EGRESS_MODE` 与 `DATA_CLEANUP_MODE` 均默认 DISABLED。网站、AnqiCMS、客户门户、报价、合同、排期、财务继续延期。

## 继续开发入口

先读：

- [WP6 受控 Person merge](docs/release/WP6_PERSON_MERGE.md)
- [WP5 删除阻断与清理](docs/release/WP5_DELETION_CLEANING.md)
- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

下一刀是 **T29 隔离 JSON 重建**。根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
