# 当前实现状态｜WP3 内部 JSON 导出与依赖清单

应用 `0.1.0-dev.1`。当前分支 `feat/export-dependencies`，PR #10，基于 PR #8。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；新增独立 `data.export` | 全站可访问性、生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体租约、关系原子命令；ExportJob 独立有限租约 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1 | 机构/品牌、所有权转移、受控合并 |
| DEV-04 媒体 | local/test 私有静态图片、检查/预览 | COS、PDF/视频、原件、正式生命周期 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本、旧库正式升级 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、普通分页/Facets SQL 下推 | 来源 visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | **DEV-07A：精确 INTERNAL_EXPORT 许可、JSON 冻结清单、ExportDependency、Worker、下载复查、部署出口闸门；关系安全移除** | T29 隔离重建；依赖影响预览；受控删除/ERASED；人物合并 |
| DEV-08 AI | 未开发，仍在一期 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | recoveryEpoch、开发配置 | 备份/恢复、旧库+私有文件一致性 |
| DEV-10 总体验收 | 多切片核心/PG/浏览器回归 | 完整内部旅程、重建、性能/恢复门未关闭 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-07A 当前证据

功能 head `19585fb4382ac781d9e2688320ec8e1071340c92`，Actions [36005508490](https://github.com/BA7IEE/once-production-os/actions/runs/36005508490) 五项全绿。

- 92 条请求契约；
- 230/230 核心/传输；
- 46/46 PostgreSQL；
- 原生表单 Chromium 6/6；
- browser-production 跑通“精确用途审批 → ExportJob → Worker JSON → 浏览器下载”，并在来源暂停后证明旧导出整件不可下载；
- exporter-only 成员测试证明 `data.export` 不会扩张 `sources.read`；
- DB 直接拒绝错来源 UsePermission、未登记导出字段和未登记成员权限；
- ExportJob / ExportDependency / audit / receipt 任一写后故障均整事务回滚。

## FR/T 状态边界

FR-29 的**导出半链**已实现，但 T29 还要求在隔离空间重建 10 人/3 作品/1 项目，目前未做，因此 FR-29/T29 不标完成。

FR-12 的“旧导出失效”已覆盖来源暂停和许可撤销等当前依赖；FR-13 的删除处置尚未实现，不能把导出依赖表当成删除已完成。

## 接下来

DEV-07B：依赖影响预览 → 安全阻断 → 受控清理/ERASED → 人物合并。并补 JSON 重建工具与 J-OS-05，再推进 DEV-09 恢复演练。
