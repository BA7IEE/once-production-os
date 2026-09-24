# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP3_EXPORT_DEPENDENCIES.md` → `docs/release/IMPLEMENTATION_STATUS.md` → `docs/release/TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读 WP2B/WP2/WP1/M1/H1/A1/R1 历史说明与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于当前实现状态；当前代码、迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`feat/export-dependencies`
- PR：#10，基于 `feat/search-facts-sql` / PR #8
- 功能代码固定 head：`19585fb4382ac781d9e2688320ec8e1071340c92`
- Actions：36005508490，五个 job 全绿
- 请求契约：92
- 核心/传输：230/230
- PostgreSQL：46/46
- Chromium 表单：6/6
- browser-resume / handoff / media / production：全部成功

文档收口后的最终 head 必须重新跑同一套 CI；不要拿功能 head 的绿灯替代最终 head。

## DEV-07A 当前不变量

1. 可读不等于可导出；`data.export`、精确 UsePermission、`DATA_EGRESS_MODE` 三者缺一不可。
2. `TEMP_ORGANIZE` 不允许创建 `INTERNAL_EXPORT` 许可。
3. UsePermission 精确绑定真实 Source + Person/Work/Project/Asset；数据库组合 FK 防止错来源授权。
4. 导出字段只有显式白名单；联系人、source 原文、Session、密码、密钥、objectToken/签名 URL 不存在可选字段。
5. ExportDependency 冻结 sourceRevision/protectionEpoch、资源 revision/epoch、许可 id/revision、字段和截止时间。
6. Worker 生成前和下载时逐依赖复查；任一安全依赖失效整件拒绝，不删除一行后继续发旧文件。
7. 普通内容 revision 变化只标记 `contentChanged`，旧 payload 保持生成时快照；安全状态变化阻断下载。
8. 部署出口默认 `DISABLED`；恢复/维护时可看历史元数据，但不能因此下载。
9. ExportJob 自带有限租约/重试，不复用已有 `durable_jobs.aggregateId -> ImportBatch` 外键，避免破坏导入任务语义。
10. 已应用迁移不改写；本批新增 `202609240006_export_dependencies` 与 `202609240007_export_payload_json_null`。

## 安全边界

正式 API 仍只用 PrismaStore。ADMIN 也不能绕过 scope、来源状态或用途许可。只有 `data.export` 但没有 `sources.read` 的成员可以查看最小许可摘要用于执行获准导出，但不能读取来源列表/原文；前端也不会因此主动请求 source.list。

内部 JSON 导出是迁移/重建业务动作，不是备份。数据库、媒体对象、密钥、配置的备份恢复必须走 DEV-09 独立运维路径。

## 下一步

进入 **DEV-07B**：先做删除/合并前的精确依赖影响预览，再做“先阻断、后清理”的受控删除和人物合并。并同步准备 T29 的隔离重建工具；没有重建验证前，不宣告 FR-29/T29 完成。DEV-08 AI 仍不得绕过删除/恢复安全门槛。
