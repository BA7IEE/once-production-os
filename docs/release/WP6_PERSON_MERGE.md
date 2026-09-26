# WP6｜DEV-07G 受控 Person merge

日期：2026-09-26。应用 `0.1.0-dev.1`。基线：DEV-07F / PR #15。开发分支：`feat/person-merge`，PR #17。

本工作包关闭 FR-03 / T03 / AT-22 的内部 Person 重复身份合并切片。它不是自动去重，也不是按姓名、电话或相似资料猜测“同一个人”。

功能冻结 head `1673272979e338ede4ddf09952c941cae7344070` 的 GitHub Actions `36217418690` 五个 job 全绿。

## 1. 操作模型

合并只能由具备 `data.merge + records.write` 的成员显式发起：

1. 选择保留的 canonical Person；
2. 选择 duplicate Person；
3. POST `/people/merge-preview` 做零写入影响扫描；
4. 逐项处理字段冲突与关系冲突；
5. 明确确认将撤销的交接/用途许可及需解除的媒体关联；
6. POST `/people/merge` 原子执行。

部署侧还有独立 `DATA_MERGE_MODE=INTERNAL_APPROVED` 闸门。权限本身不能越过部署开关；默认配置保持关闭。

重名、同联系方式、同作品、相似字段都不会自动创建 PersonAlias。

## 2. Preview 与陈旧保护

Preview 冻结并摘要：

- canonical / duplicate revision；
- 两边 Source revision / protectionEpoch；
- 字段冲突；
- WorkCredit / ProjectParticipant / ShortlistItem 关系与冲突；
- 活动 Handoff / INTERNAL_EXPORT UsePermission；
- Contact / FieldEvidence；
- Upload / Asset；
- 活动中的删除请求与 deletion dependency；
- 隐藏或当前不可处理的依赖。

执行时服务器重新扫描并比较 `previewDigest`。预览后新增关系、来源/版本变化或其他影响变化都会得到 `MERGE_PREVIEW_STALE`，不会按旧预览继续写。

Preview 本身不创建 merge、alias、receipt 或 audit。

## 3. 来源语义

Person 只有一个主 Source，因此 profile 字段不能在来源之间静默改写归因。

- canonical 与 duplicate **同 Source**：冲突字段可显式选 CANONICAL / DUPLICATE；数组字段还可选 UNION。
- 两条 Person **不同 Source**：冲突字段只能保留 CANONICAL。若业务判断另一份资料应成为主资料，应交换 canonical / duplicate 后重新预览。
- 不同 Source 的 duplicate displayName 不会自动塞进 canonical.aliases，也不会因此进入 canonical 搜索命中。

Contact 与 FieldEvidence 自己保留 Source 引用，因此可以受控改绑 Person；Contact 因 AES-GCM AAD 含 personId，改绑时必须解密后使用新 AAD 重新加密。

## 4. 权限与隐私

合并不会扩大原来的 scope：

- 两条 Person scope 不一致时直接阻断；
- old Person ID 详情只读解析前先检查旧身份原 scope，再检查 canonical 当前可见性；
- old ID 不能继续 PATCH、Handoff 或其他写入；
- normal list / talent search 不再返回 duplicate ID；
- alias 本身不能被无旧 scope 权限的人用猜测 UUID 探测。

Preview 也不能成为敏感元数据枚举器：

- 没有 `sensitive.write` 时，只返回 `SENSITIVE_WRITE_REQUIRED`，不返回 Contact 精确数量，也不继续逐条探测联系方式来源；
- 没有 `sources.review` 时，不返回活动 UsePermission 精确数量；
- hidden Work / Project / Shortlist / Media 依赖只形成 blocker，不回显隐藏对象。

## 5. 授权、媒体和关系迁移

身份变化不等于授权转移：

- canonical 和 duplicate 的活动 Handoff 都撤销；
- Person INTERNAL_EXPORT UsePermission 都撤销，不转到新身份；
- Upload 的 person 绑定解除；
- 只有 Asset Source 与 canonical Source 一致时才允许 reassign，否则 detach；
- WorkCredit / ProjectParticipant / ShortlistItem 在无冲突时改绑 canonical；
- 同一根对象上的重复关系必须逐项选择保留 canonical 关系或 duplicate 关系；
- 受影响 Work / Project / Shortlist 根 revision 会提升；Shortlist 的人物基线重写为 canonical 当前 revision/source revision，避免身份变化被误报成“未变化”。

## 6. 旧 ID 与审计证据

成功后：

- canonical 继续作为稳定 Person；
- duplicate 状态变为 ARCHIVED；
- 新建一条 `PersonMergeDecision`；
- 新建一条 `PersonAlias(oldPersonId -> canonicalPersonId)`；
- old ID 仅允许详情只读解析，并返回 `resolvedFromId`；
- merge decision / alias 在 PostgreSQL 为 append-only，不允许 UPDATE / DELETE；
- alias 不能自指、不能形成链，且只能在 old Person 已归档后发布；
- alias 的 old/canonical 对必须与对应 merge decision 完整匹配；
- merge decision 的 Person / Source 组合由数据库复合 FK 固定。

幂等命令回执使用 `resourceKind=merge`，重放时仍重新检查当前 `data.merge` 与 canonical 可见性。Audit 与领域写处于同一事务；Audit 写失败时整个 merge 回滚，同键可安全重试。

## 7. 数据库与管理端

新增前向迁移：

- `202609250002_person_merge_foundation`
- `202609250003_person_merge_integrity`

新增：

- `personMerges`
- `personAliases`
- `data.merge` 附加权限；
- 管理端“人才合并”独立高风险工作台；
- 侧栏超出桌面高度时内部滚动，避免维护入口被挤出可点击区域。

管理端不把合并塞进普通 Person 编辑表单。必须先预览，再人工处理冲突和确认不可逆影响。

## 8. 实际验证

功能冻结 head：`1673272979e338ede4ddf09952c941cae7344070`。

GitHub Actions：`36217418690`，五项全部成功：

- 103 条请求契约；
- 263 / 263 core / transport；
- 67 / 67 PostgreSQL；
- 原生表单 Chromium 6 / 6；
- browser-resume / handoff / media / production 全部 success。

真实 browser-production 最终通过：

`PASS DEV-07G browser: explicit preview/decision/merge -> one alias; old Person id resolves read-only and disappears from normal lists`

核心/PG 额外覆盖：

- 无权 preview 不枚举受限 Contact；
- 同 Source 允许显式采用 duplicate 值/数组 UNION；
- 不同 Source 禁止 profile 值改写来源；
- preview 后新增关系使 digest 失效；
- UsePermission 撤销而非转移；
- merge audit 故障整体回滚；
- old ID scope 不泄漏；
- shortlist 人物基线随 canonical 重写；
- alias/decision append-only、复合 FK 与 no-chain 约束。

## 9. 仍未完成

Person merge 本身可视为本切片完成，但一期仍未完成：

- FR-29 / T29：内部 JSON 的隔离重建工具与“10 人 / 3 作品 / 1 项目关系”重建验收；
- DEV-09：备份 / 恢复、restore-check 与正式升级演练；
- 正式 COS、PDF/视频/原件完整生命周期；
- 四类有界 AI；
- 正式数据接管。

下一刀：**T29 隔离 JSON 重建**。重建工具必须消费受控 `once-export-v1`，默认只能对新建隔离工作空间/空库执行，不能把 JSON 导出伪装成备份恢复。
