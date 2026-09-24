# 当前实现状态｜WP4 删除影响预览与 DRAFT 申请

应用 `0.1.0-dev.1`。当前分支 `feat/deletion-impact-preview`，PR #11，基于 PR #10。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 `data.export` / `data.delete` | 全站可访问性、生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体租约、关系原子命令；ExportJob 独立租约 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1 | 机构/品牌、所有权转移、Person merge |
| DEV-04 媒体 | local/test 私有静态图片、检查/预览 | COS、PDF/视频、原件、正式生命周期 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本、旧库正式升级 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、普通分页/Facets SQL 下推 | 来源 visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | **07A：受控内部 JSON 导出；07B：删除影响预览、hidden dependency redaction、DRAFT 删除申请与冻结影响项** | 07C 使用阻断/清理/ERASED；保留决定执行；Person merge；T29 重建 |
| DEV-08 AI | 未开发，仍在一期 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | recoveryEpoch、开发配置 | 备份/恢复、旧库+私有文件一致性 |
| DEV-10 总体验收 | 多切片核心/PG/浏览器回归 | 完整内部旅程、重建、性能/恢复门未关闭 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-07B 当前证据

功能 head `9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273`，Actions [36019151162](https://github.com/BA7IEE/once-production-os/actions/runs/36019151162) 五项全绿。

- 96 条请求契约；
- 237/237 核心/传输；
- 52/52 PostgreSQL；
- 原生表单 Chromium 6/6；
- browser-production 跑通“人才 → 影响预览 → 看到作品/项目/Shortlist/旧导出依赖 → DRAFT 申请”，随后证明目标仍可读且没有执行删除按钮；
- 隐藏 Work/Project/Shortlist/Asset/上传等依赖只计 unresolved，不回显对象 ID；
- 预览零写入，新依赖出现后旧 digest 失效；
- DB 拒绝错来源 target 和 unresolvedCount>0 的 DRAFT；
- DeletionRequest / DeletionItem / audit / receipt 任一步写后故障均整事务回滚。

## FR/T 状态边界

FR-13/T13 **未完成**：当前没有 `BLOCKED_FOR_USE`、正式清理、ERASED 最小头或保留决定执行。

FR-29/T29 **未完成**：导出半链已实现，但隔离重建工具尚未做。

FR-12 的来源暂停/旧导出失效和清单隐藏已有局部覆盖，但删除申请本身不触发用途阻断。

## 接下来

DEV-07C：DRAFT → 明确批准 → 先阻断使用 → 清理 Worker → 有据保留 / ERASED 最小头 → 派生导出与媒体处置。之后补 Person merge 与 JSON 隔离重建，再推进 DEV-09。
