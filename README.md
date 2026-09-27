候选职业选择与人工复核已接通：同一人物按不同职业分别入选，作品须匹配本次职业；旧候选升级保留原编号/备注并逐项待核实，不猜职业。416/416 CORE_MEMORY_TESTED，服务/React/core/transport类型、契约、静态检查及构建 PASS；完整 PostgreSQL 链（含原合同67/67、职业上下文/升级的审计回滚重试、真实备份恢复与各版重建）DB_TESTED；真实 Chromium 双职业入选、合并后人工复核、响应丢失原请求回放 BROWSER_TESTED。证据：`artifacts/td2-candidate-context-20260928/`。本批无新迁移；复杂来源/共享媒体/保留历史清理及完整交付仍待继续，未合并、未部署。

详见 [候选职业衔接](docs/release/TD2_CANDIDATE_CONTEXT.md)。

专业工作台已接通人物建档、基本身份、多职业/语言、量尺与成年资格、翻译方向、能力和机构登记、资质编号、集合素材、字段建议及专业组合检索。412/412 CORE_MEMORY_TESTED；服务/React/core/transport类型、契约、静态检查与构建 PASS。真实 PostgreSQL + Chromium 表单验证通过，覆盖响应丢失后原请求回放、旧版本冲突、只读账号与来源暂停清屏。证据：`artifacts/td2-workbench-20260928/`。本批无数据库迁移；完整人才2.0仍未完成，角色候选衔接、复杂来源/共享媒体/历史清理及全部交付证据继续推进。

详见 [专业工作台](docs/release/TD2_PROFESSIONAL_WORKBENCH.md)。

职业不明候选碰撞已支持人工选择保留项；两边复核记录的 UUID、原因和状态保留，原候选编号只追加，合并不会代替人工职业核实。412/412 CORE_MEMORY_TESTED，类型、契约、静态检查及完整构建 PASS；真实 PostgreSQL 双向选择、审计回滚/同键重试、SQL 历史保护和完整数据库链 DB_TESTED；真实 Chromium 合并与既有迁移流程 BROWSER_TESTED。40 次前向迁移在新空库通过，两个既有合成库各59表原内容摘要未变，其中一库显式含升级前复核记录；真实备份恢复保留新候选历史。证据：`artifacts/td2-candidate-review-20260928/`。完整人才2.0仍未完成；工作台、复杂来源/媒体清理继续开发，未部署。

详见 [候选复核合并](docs/release/TD2_CANDIDATE_REVIEW_MERGE.md)。

当前接续：[合并保留历史迁移](docs/release/TD2_MERGE_HISTORY_TRANSFER.md)增加 v11；旧身份、原合并决定及操作者、保留主档案与量尺关系一起迁移，目标不伪造新合并。人才 2.0 整体仍未完成。

前批：[身份字段来源证据迁移](docs/release/TD2_IDENTITY_EVIDENCE_TRANSFER.md)增加 v10；普通联系人无需人才档案即可按独立许可迁移所选身份字段的来源和原核验记录。整体人才 2.0 仍未完成。

前批：[成年资格与原核验归属迁移](docs/release/TD2_ADULT_TRANSFER.md)增加 v9；独立许可、原证明和核验证据一起保留，目标不伪造核验人或延长有效期。完整人才 2.0 仍未完成。

前批：[媒体集合与内容标签迁移](docs/release/TD2_COLLECTION_TRANSFER.md)增加 v8 白名单；图片顺序、说明、推荐标记及归档状态保留，共享文件只迁移一份。完整人才 2.0 仍待继续验收。

前批：[资质证明原件迁移](docs/release/TD2_PROOF_MEDIA_TRANSFER.md)已接入独立图片/来源许可、真实文件下载和隔离重建；已核验状态与附件关系保留。完整人才 2.0 尚未完成，证据见该页与当前 head CI。

前批：[无附件资质与加密编号迁移](docs/release/TD2_CREDENTIAL_TRANSFER.md)已接入独立许可和隔离重建；带证明附件的资质仍阻断，完整人才2.0未完成。

前批：已支持的十一类专业资料可另行批准[字段来源证据迁移](docs/release/TD2_FIELD_EVIDENCE_TRANSFER.md)，保留原记录和核验归属；完整人才2.0仍未完成。

> 当前入口：[人才 2.0 状态](docs/release/TD2_MAINTENANCE_STATUS.md)、[专业冲突合并](docs/release/TD2_CONFLICT_MERGE.md)、[职业候选保留](docs/release/TD2_ROLE_CANDIDATE_MERGE.md)与[专业导出/重建子集](docs/release/TD2_TYPED_TRANSFER.md)、[代表关系及关联机构迁移](docs/release/TD2_REPRESENTATION_TRANSFER.md)。PR #26 基于 PR #25，尚未合入 main；以下旧阶段证据不替代当前 head 验收。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

历史内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/项目 → 检索/候选 → 受控导出 → 删除最终化 → Person merge → T29 隔离重建 → **恢复隔离/检查/零增量批准 → write-ahead + DB/private media 同包备份恢复**。

DEV-09D 功能冻结 head `9cc30cf71dc4e6fc97bd81f2308dd884a267c230` 在 Actions `36249594313` 五个 job 全绿：103 routes、295/295 core/transport、67/67 原 PG，以及真实 pg_dump/pg_restore + private media 恢复演练。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前维护能力

受控删除已完成 DEV-07F 专用最终化：依赖清理完成后，Source / Person / Work / Project 可进入严格 ERASED 最小头；LocalMediaProvider 会先物理清理原件/预览，再终结 Upload / Asset；SourceHistory 只允许专用单向脱敏；最终请求状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED。

Person merge 不是自动去重。它要求 `data.merge + records.write`、显式 preview、逐字段/逐关系决定和独立 `DATA_MERGE_MODE`。旧 ID 只读解析，写入继续拒绝；Handoff / UsePermission 不随身份转移；不同 Source 的 profile 值不会被静默改写到 canonical Source。

## 仍未完成

- 人才 2.0：冲突资料合并、专业资料导出/重建、复杂来源与媒体引用清理、组合工作台；
- 正式 COS / PDF / 视频 provider；
- DEV-08 四类有界 AI；
- 最终性能/生产接管门。

DEV-09E 已有逐条 delta resolution 实现；正式运维、长期保留与并发故障 Gate 仍未关闭，不允许人工勾选绕过。

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

下一步是 **人才 2.0 冲突资料合并、白名单导出与类型化重建**。根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
