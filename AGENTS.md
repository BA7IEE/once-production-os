# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP4_DELETION_IMPACT_PREVIEW.md` → `docs/release/WP3_EXPORT_DEPENDENCIES.md` → `docs/release/IMPLEMENTATION_STATUS.md` → `docs/release/TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读 WP2B/WP2/WP1/M1/H1/A1/R1 历史说明与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于当前实现状态；当前代码、迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`feat/deletion-impact-preview`
- PR：#11，基于 `feat/export-dependencies` / PR #10
- 功能 head：`9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273`
- Actions：36019151162，五个 job 全绿
- 请求契约：96
- 核心/传输：237/237
- PostgreSQL：52/52
- Chromium 表单：6/6
- browser-resume / handoff / media / production：全部成功

文档收口后的最终 head 必须重新跑同一套 CI；不要拿功能 head 的绿灯替代最终 head。

## DEV-07B 当前不变量

1. `data.delete` 当前只开放删除影响预览和 DRAFT 申请，不等于删除执行权限。
2. `POST /deletion-requests/preview` 零写入；目标版本变化返回冲突。
3. 影响图覆盖当前已实现的 Source/Person/Work/Project/Asset、联系方式/核验/导入/上传、作品/项目关系、Shortlist、UsePermission 和 ExportDependency/旧导出。
4. 当前不可见的子依赖只计入 unresolved，不能通过删除预览枚举隐藏对象 ID。
5. 有 unresolved 或扫描超过 1000 项时，不允许创建删除申请。
6. 创建 DRAFT 前会重新扫描；新增依赖导致旧 `previewDigest` 失效。
7. DRAFT 只冻结目标 revision/protectionEpoch、影响摘要、具体影响项和申请原因；目标继续按原规则可读可写。
8. DRAFT 状态不会伪装成 `BLOCKED_FOR_USE`；本批没有清理 Worker、ERASED、媒体擦除或导出 payload 擦除。
9. 持久化的删除申请详情只返回摘要计数，不把冻结依赖 ID 当作后续范围变化的读取旁路。
10. 数据库 typed FK 把删除目标绑定到同 workspace、同 source 的真实 Person/Work/Project/Asset。

## 导出安全边界继续有效

`data.export + INTERNAL_EXPORT UsePermission + DATA_EGRESS_MODE` 缺一不可。TEMP_ORGANIZE 不能导出。Worker 生成前、下载时都复查依赖；安全状态变化整件拒下载。

## 下一步

进入 **DEV-07C**：真正的“先阻断、后清理”机制。先实现目标使用阻断与 protectionEpoch 变化，再实现清理计划/保留决定/ERASED 头和派生物擦除；清理不得依赖原申请人仍在岗。之后再做 Person merge 和 T29 隔离重建。

不要把 DRAFT 删除申请直接升级成一键物理删除，也不要在 DEV-07C 完成前启动 DEV-08 AI。
