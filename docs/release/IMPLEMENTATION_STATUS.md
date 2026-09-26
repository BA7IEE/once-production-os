# 当前实现状态｜DEV-07F～07G 删除最终化与受控 Person merge

应用 `0.1.0-dev.1`。当前分支 `feat/person-merge`，PR #17，基于 `feat/deletion-finalization` / PR #15。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web、生成契约指纹 | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 data.export / data.delete / data.merge | 全站可访问性、生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体/导出/删除租约；merge 原子命令/重放鉴权 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1、**受控 Person merge / old-ID alias** | 机构/品牌、所有权转移 |
| DEV-04 媒体 | local/test 私有静态图片、检查/预览；删除时 local 原件/预览物理 purge | COS、PDF/视频、正式原件生命周期 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘；merge 关系重绑/冲突决定 | 主体关联、内部双语文本、旧库正式升级 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、普通分页/Facets SQL 下推；merged ID 不再进入普通结果 | 来源 visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | 07A 导出；07B 影响预览；07C 阻断；07D 保留决定；07E 依赖清理；**07F 专用最终化/ERASED；07G Person merge** | **T29 隔离 JSON 重建** |
| DEV-08 AI | 未开发，仍在一期 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | recoveryEpoch、开发配置 | 备份/恢复、旧库+私有文件一致性、restore-check |
| DEV-10 总体验收 | 多切片 core / PG / browser 回归 | T29、完整内部旅程、性能/恢复门未关闭 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-07F 删除最终化证据

功能 head `f3396a6b4585b04896a9e381efac4cc68e968462`，Actions `36112160471` 五项全绿。

- Source / Person / Work / Project 进入严格 ERASED 最小头；
- Local Asset / Upload 先物理 purge 原件与预览，再写 ERASED 头；
- SourceHistory 走受控 one-way redaction，普通 UPDATE / DELETE 继续被 DB trigger 拒绝；
- 删除请求最终状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED；
- finalizationDigest、租约、失败重试和 audit rollback 有真实 PG / Chromium 证据；
- 伪造 ERASED / terminal shape 被数据库拒绝。

因此当前实现中的 FR-13 / T13 删除链已经跨过 07E 的“只清依赖”状态，具备专用最终化闭环；正式数据升级和恢复演练仍未做。

## DEV-07G Person merge 证据

功能冻结 head `1673272979e338ede4ddf09952c941cae7344070`，Actions `36217418690` 五项全绿：

- 103 条请求契约；
- 263 / 263 core / transport；
- 67 / 67 PostgreSQL；
- 原生表单 Chromium 6 / 6；
- browser-resume / handoff / media / production 全部 success；
- browser-production 真实完成“选 canonical / duplicate → preview → 字段决定 → execute → 一条 alias → old ID 只读解析/写入拒绝”。

关键安全边界：

- 不自动去重；
- scope 不一致直接阻断；
- old ID 解析不扩大旧 scope；
- merge decision / alias append-only、no-chain、复合身份 FK；
- Handoff / UsePermission 撤销，不向 canonical 转移；
- Contact 因 AAD 变化重新加密；
- 无敏感维护权限时 preview 不枚举 Contact 精确数量；
- 同 Source 才允许采用 duplicate 值或 UNION；不同 Source 的 profile 冲突只能保留 canonical；
- hidden Work / Project / Shortlist / Media 依赖阻断；
- previewDigest 陈旧、audit 故障和幂等重放均有反例覆盖。

## FR/T 状态边界

- FR-03 / T03 / AT-22：当前受控 Person merge 切片有实现与隔离验收证据。
- FR-13 / T13：当前删除链已实现到专用最终化；正式数据升级/恢复仍属于 DEV-09，不等同于删除逻辑未实现。
- FR-29 / T29：**未完成**。现有 `once-export-v1` 只解决受控内部导出和依赖复查，还没有隔离重建工具。

## 接下来

进入 **T29 隔离 JSON 重建**。只消费受控 `once-export-v1`，默认落到新建隔离工作空间 / 空数据库目标；完成“10 人 / 3 作品 / 1 项目关系”重建，并证明不包含 Session、密码、密钥或未选字段。T29 不是备份恢复，完成后再推进 DEV-09。
