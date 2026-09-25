# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP5_DELETION_CLEANING.md` → `WP4_DELETION_IMPACT_PREVIEW.md` → `WP3_EXPORT_DEPENDENCIES.md` → `IMPLEMENTATION_STATUS.md` → `TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读历史 WP2B/WP2/WP1/M1/H1/A1/R1 与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于实现状态；当前代码、前向迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`feat/deletion-cleaning`
- PR：#14，基于 `feat/deletion-retention-plan` / PR #13
- 功能 head：`32316937b91c7f66c9ed14a368ac74c2b58eed5b`
- Actions：36096878872，五个 job 全绿
- 请求契约：101
- 核心/传输：251/251
- PostgreSQL：63/63
- Chromium 表单：6/6
- browser-resume / handoff / media / production：全部成功

文档收口后的最终 head 必须重跑同一套 CI。

## DEV-07C～07E 当前不变量

1. 删除必须从 impact preview 开始；hidden dependency 只计 unresolved，不能枚举不可见对象。
2. DRAFT 只冻结影响，不阻断；BLOCKED_FOR_USE 才进入统一正常读取阻断。
3. BLOCKED_FOR_USE 与 CLEANING 都必须保持 Source/Person/Work/Project/Asset 在普通详情、列表、搜索、H1、Shortlist、导出中不可用。
4. REVIEW_REQUIRED 项必须人工决定；`RETAIN_WITH_BASIS` 还需要 `sources.review`，且绑定另一份当前有效 INTERNAL_USE Source。
5. planDigest 冻结后不允许修改决定；启动 CLEANING 时再次核对 planDigest 和 retention source revision/protectionEpoch。
6. `DATA_CLEANUP_MODE` 是独立部署闸门，默认 DISABLED；`data.delete` 本身不能越过它。
7. CLEANING 使用独立租约和 executionPlanDigest；HTTP 请求只进入状态，不在事务内做长 I/O。
8. 当前 Worker 只自动执行注册过的依赖动作：关系、UsePermission、Export/ExportDependency、Contact、FieldEvidence、Import payload、Handoff 最小头、已审核保留。
9. 每个 DONE Item 必须有 64 字节十六进制 cleanupEvidenceDigest、cleanedAt 与 worker audit；DB 012 迁移显式防 PostgreSQL NULL/UNKNOWN 绕过。
10. SourceHistory、Media/Upload、Person/Work/Project 根对象遇到专用清理需求时保持 WAITING_EXTERNAL / CLEANING，不得写成完成。
11. 当前没有删除请求最终 COMPLETED / RETAINED_WITH_BASIS，也没有 Person merge。
12. 旧迁移不改写；新安全修复继续追加前向迁移。

## 导出安全边界继续有效

`data.export + INTERNAL_EXPORT UsePermission + DATA_EGRESS_MODE` 缺一不可。ERASED Export 只保留最小安全头；冻结 manifest、fields、usePermissionRefs、payload、payloadDigest 会被清掉。

## 下一步

进入 **DEV-07F**：实现专用媒体物理清理、SourceHistory 最小保留/擦除程序、根对象最终 ERASED/最小头及删除请求 `COMPLETED / RETAINED_WITH_BASIS` 收口。所有专用步骤必须可证明完成；任何一项无法证明就保持 CLEANING/FAILED，不能假报 T13 完成。

之后补 Person merge 与 T29 隔离重建，再推进 DEV-09。不要在 DEV-07F 完成前启动 DEV-08 AI。
