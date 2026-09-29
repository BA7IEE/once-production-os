# WP3｜DEV-07A 内部 JSON 导出与精确依赖清单

日期：2026-09-24。应用版本 `0.1.0-dev.1`。输入：PR #8 / `699bd0e8b411c351bef0a6ee8777ed92ecff996e`。开发分支：`feat/export-dependencies`，PR #10。

本批只关闭 DEV-07 的“导出与依赖”切片，**不宣告 DEV-07、FR-29/T29 或一期全部完成**。

## 1. 为什么不能做“可见就下载”

内部读权限与数据离开系统的风险不同。DEV-07A 因此要求三道门同时成立：

1. 当前成员有 `data.export`；
2. 每个实际导出对象/字段都有当前有效的 `INTERNAL_EXPORT` UsePermission；
3. 部署侧 `DATA_EGRESS_MODE=INTERNAL_APPROVED`。

`.env.example` 默认仍为 `DISABLED`。关闭出口不会抹掉审计用的 ExportJob 元数据，但会阻断创建、Worker 执行和下载。

`TEMP_ORGANIZE` 只允许有限内部整理，不得创建 INTERNAL_EXPORT 许可。

## 2. 许可与字段白名单

UsePermission 精确记录：
- sourceId；
- subjectKind = SOURCE / PERSON / WORK / PROJECT / ASSET；
- subjectId；
- fields；
- validFrom / validUntil；
- evidenceNote；
- reviewerId；
- revision/status。

数据库使用类型化 subject FK，并要求 Person/Work/Project/Asset 与许可声明的 Source 一致，不能拿 A 来源给 B 对象授权。

当前 JSON 字段是显式白名单。没有联系方式、`Source.textPayload`、Session、密码哈希、密钥、objectToken 或签名 URL 字段。媒体只允许 `media.identity`：文件名、mime、bytes、sha256、宽高等迁移身份。

只有 `data.export` 但没有 `sources.read` 的成员，可以查看执行导出所需的最小许可摘要；不能因此读取 source.list、来源原文或审批依据。

## 3. ExportJob 与 ExportDependency

创建导出时冻结：
- selected Person / Work / Project；
- 精确字段集合；
- 关系（仅两端都被显式选中时）；
- 可选 Source 字段；
- 可选媒体身份；
- sourceRevision / sourceProtectionEpoch；
- 资源 revision / protectionEpoch；
- usePermission id / revision；
- 有效截止时间；
- schemaVersion = `once-export-v1`。

ExportJob 使用自己的有限 lease / attempts，不复用既有 `durable_jobs.aggregateId -> ImportBatch` 结构。这样不会为了新增导出任务破坏已经稳定的导入任务外键和续跑语义。

Worker 执行前逐依赖复查，READY 后下载再次逐依赖复查。任一安全依赖失效时整件旧导出拒绝，不做“删掉一行继续下载”。

普通内容 revision 改变不会重写过去冻结的 payload；详情显示 `contentChanged=true`。来源暂停/到期、scope/保护版本变化、Asset 隔离、许可撤销/过期或发起人失去权限则阻断后续下载。

## 4. 数据库迁移

新增：
- `usePermissions`
- `exports`
- `exportDependencies`

迁移：
- `202609240006_export_dependencies`
- `202609240007_export_payload_json_null`

第二条是前向修复：Prisma 的 nullable JSON 使用 JavaScript `null` 时会写 JSON null，数据库约束明确区分 READY 必须有真实 payload，与非 READY 可为 SQL NULL/JSON null。未改写旧迁移。

数据库 CHECK 还限制：
- `memberships.extraPermissions` 只能含登记权限；
- export/use-permission/dependency fields 只能来自 33 个登记字段；
- subject exactly-one；
- Export 状态/payload 组合；
- attempts / expiry 等基本边界。

## 5. 管理端

导航新增“内部导出”。

资料审核者：
- 选择对象类型与对象；
- 勾选允许字段；
- 填许可截止时间；
- 写审批依据；
- 可撤销许可。

导出者：
- 只从 ACTIVE、未过期许可中勾选；
- 前端从许可推导 selectedIds 和 fields，不要求手写 UUID；
- 创建后查看 Worker 状态、截止时间、payload SHA-256、contentChanged 和阻断原因；
- READY 且全部依赖仍成立时可下载 JSON。

审批与执行保持分离；页面不会自动为导出者创建许可。

## 6. 实际验证

功能代码 head：`19585fb4382ac781d9e2688320ec8e1071340c92`。

GitHub Actions [36005508490](https://github.com/BA7IEE/once-production-os/actions/runs/36005508490) 五个 job 全部成功：

| 检查 | 结果 |
|---|---|
| 文件指纹 / 冻结安装 / Prisma / 类型 / 构建 | PASS |
| 请求契约 | 92 条 |
| 核心/传输 | 230/230，失败 0 |
| PostgreSQL | 46/46，失败 0 |
| 原生表单 Chromium | 6/6 |
| browser-resume / handoff / media | PASS |
| browser-production | PASS |

新增 Chromium 日志明确出现：

```text
PASS DEV-07A browser: explicit export permission -> worker JSON -> controlled browser download
PASS DEV-07A privacy: source suspension makes the whole old export non-downloadable
```

真实 PG 新增验证：
- wrong-source subject permission 被组合 FK 拒绝；
- 未登记 export field 被 CHECK 拒绝；
- 未登记 extraPermission 被 CHECK 拒绝；
- ExportJob 冻结精确 Dependency，Worker 生成 JSON；
- exports / exportDependencies / audit / receipt 任一写后故障整体回滚。

核心新增 7 条导出安全用例，含 exporter-only 不扩张 source read。

## 7. Review 中实际发现并修复

- 最初考虑复用 DurableJob；审查发现其 aggregateId 数据库外键固定指向 ImportBatch，因此改为 ExportJob 自带租约，避免破坏导入语义。
- Prisma nullable JSON 的 JS null 与 SQL NULL 语义不同，新增前向迁移约束两者。
- 首轮 Chromium 已证明审批→Worker→下载成功，但最后失效检查被未关闭作品详情 overlay 挡住；按真实交互关闭父详情后重跑。
- 第二轮失效测试错误用未展示在表格里的 export UUID 查行；改为限定“我的导出任务”面板定位。业务失效断言未删除。
- UI Review 发现 `data.export` 不应隐含 `sources.read`；许可列表改为最小摘要，export-only 页面不再主动请求 source.list，并补核心反例测试。

## 8. 尚未完成

T29 仍要求“10 人 / 3 作品 / 1 项目在隔离空间重建”，目前没有完整重建工具，不能把导出成功等同于迁移闭环完成。

DEV-07B 尚需：
- 删除/合并前的依赖影响预览；
- 先安全阻断，再异步清理；
- 敏感 payload / 导出 / 预览等 ERASED 处置；
- 有独立合法依据的材料保留决定；
- 人物受控合并，不扩大 scope/用途、不合并登录账号。

DEV-09 备份/恢复仍是独立运维路径；普通 JSON 导出不是备份。
