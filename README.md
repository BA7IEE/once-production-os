> 当前增量：**WP5 / DEV-07C～07E 受控删除：阻断、保留决定与计划驱动依赖清理**，见 [WP5_DELETION_CLEANING.md](docs/release/WP5_DELETION_CLEANING.md)。PR #14 基于 PR #13，保持 Draft；一期未完成，未生产部署。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单 → 受控 JSON 导出 → 删除影响预览 → 使用阻断 → 保留决定 → 冻结清理计划 → **受控依赖清理**。

功能 head `32316937b91c7f66c9ed14a368ac74c2b58eed5b` 在 GitHub Actions 36096878872 五个 job 全绿：101 条请求契约、251/251 核心/传输、63/63 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前删除能力

`data.delete` 不是一键删除权限。当前流程必须按顺序执行：

1. 零写入影响预览；隐藏依赖只计 unresolved，不泄露 ID；
2. 冻结 DRAFT 申请；新增依赖会让旧 previewDigest 失效；
3. 显式进入 BLOCKED_FOR_USE，正常读取/搜索/H1/Shortlist/旧导出立即失效；
4. REVIEW_REQUIRED 项逐项决定“按建议处置”或“有独立依据保留”；
5. 待决定清零后冻结 planDigest；
6. 只有部署侧 `DATA_CLEANUP_MODE=INTERNAL_APPROVED` 才能显式进入 CLEANING；
7. Worker 按 executionPlanDigest 逐项幂等执行，写 cleanupEvidenceDigest 和审计。

当前已真实执行的动作包括：关系移除、用途许可撤销、旧 Export 收敛为 ERASED 最小头、ExportDependency 删除、Contact / FieldEvidence 删除、Import rows 清空，以及有依据保留/最小安全头处理。

## 仍未完成

**CLEANING 不等于删除完成。** 当前以下项目会明确停在 WAITING_EXTERNAL 或继续保持阻断，不会假报完成：

- Media / Upload 的物理文件与预览清理；
- SourceHistory 的专用保留/擦除程序；
- Person / Work / Project / Source / Asset 根对象的 ERASED / 最小头终结；
- 删除请求最终 `COMPLETED / RETAINED_WITH_BASIS / FAILED` 收口；
- Person merge。

FR-13/T13 因此仍未整体完成。FR-29/T29 隔离 JSON 重建、DEV-09 备份恢复、正式 COS/PDF/视频/原件生命周期、机构/品牌、内部双语文本、四类有界 AI、正式数据升级与恢复演练仍在一期范围。

生产 `DATA_EGRESS_MODE` 与 `DATA_CLEANUP_MODE` 均默认 DISABLED。网站、AnqiCMS、客户门户、报价、合同、排期、财务继续延期。

## 继续开发入口

先读：

- [WP5 删除阻断与清理](docs/release/WP5_DELETION_CLEANING.md)
- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
