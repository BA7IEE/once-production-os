# 当前实现状态｜WP5 删除阻断、保留决定与依赖清理

应用 `0.1.0-dev.1`。当前分支 `feat/deletion-cleaning`，PR #14，基于 PR #13。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 data.export / data.delete | 全站可访问性、生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体/导出/删除清理租约 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1 | 机构/品牌、所有权转移、Person merge |
| DEV-04 媒体 | local/test 私有静态图片、检查/预览 | COS、PDF/视频、原件、正式生命周期、删除专用物理清理 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本、旧库正式升级 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、普通分页/Facets SQL 下推 | 来源 visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | **07A JSON 导出；07B 影响预览/DRAFT；07C 使用阻断；07D 保留决定/planDigest；07E CLEANING 依赖执行器、逐项证据、Export ERASED 最小头** | 07F 媒体/SourceHistory/根对象最终清理；最终状态；Person merge；T29 重建 |
| DEV-08 AI | 未开发，仍在一期 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | recoveryEpoch、开发配置 | 备份/恢复、旧库+私有文件一致性 |
| DEV-10 总体验收 | 多切片核心/PG/浏览器回归 | 完整内部旅程、重建、性能/恢复门未关闭 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-07E 当前证据

功能 head `32316937b91c7f66c9ed14a368ac74c2b58eed5b`，Actions 36096878872 五项全绿。

- 101 条请求契约；
- 251/251 核心/传输；
- 63/63 PostgreSQL；
- 原生表单 Chromium 6/6；
- browser-production 真实跑通“影响预览 → DRAFT → BLOCKED_FOR_USE → 人工决定 → planDigest → CLEANING → Worker 清理关系 → cleanupEvidenceDigest”；
- Project 根在清理后仍存在、持续不可见，参与/作品关系已删除；
- PG 真实证明 Contact / FieldEvidence 删除、UsePermission 撤销、Export ERASED 最小头和 ExportDependency 删除；
- cleanup item 删除后 audit 写失败会整事务回滚，随后安全重试成功；
- 012 前向迁移修复 PostgreSQL CHECK 的 NULL/UNKNOWN 三值逻辑，executionPlanDigest 或 DONE evidence digest 不能以 NULL 穿过约束。

## FR/T 状态边界

FR-12 的删除阻断已具备真实覆盖。FR-13/T13 **仍未完整关闭**：当前专用媒体物理清理、SourceHistory 处置、根对象最终 ERASED/最小头和删除请求最终状态尚未实现。

FR-29/T29 **未完成**：导出能力已实现，但隔离 JSON 重建工具尚未做。

## 接下来

DEV-07F：专用媒体/历史清理与根对象最终态；任何无法证明完成的项目继续停在 CLEANING/FAILED。之后补 Person merge 与 T29，再推进 DEV-09。
