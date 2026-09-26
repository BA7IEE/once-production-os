# Talent Domain 2.0 R1｜实施前重新冻结计划

日期：2026-09-27  
状态：R1_SPEC_FROZEN / NOT_IMPLEMENTED  
基线：`feat/recovery-writeahead-media` / PR #22 head `d0d3a05e57403201f8de82120fbbf7ce218bf5f3`；Talent R1 规格在 PR #24

## 1. 决策

当前 DEV-09 恢复链继续完成。恢复链 Gate 关闭后，先执行 Talent Domain 2.0 R1，再启动 DEV-08 AI。

R1 是对 R0 的对抗审查回填，不是另起新系统。核心纠偏：

- Person 不等于 Talent；TalentProfile 改为可选；
- Person.source 收窄为 originSource，多来源事实由 Evidence 支撑；
- 外部 Agent 需要 PersonExternalRef + ServicePrincipal/Machine Actor；
- 取消数据库层“大而全 ModelProfile”，Model UI 改为组合视图；
- 增加 PersonLanguage、TalentLocation、CastingProfile、MeasurementSet、AdultEligibility、Credential；
- Representation 支持 Role / territory；
- MediaCollection type 与内容 tag 分离；
- ShortlistItem 固定 personRoleId；
- CapabilityDefinition / Talent Schema Registry 正式成为约束；
- 冲突或无直写权限进入 FieldProposal；
- TD2 Gate 从 12 条扩展为 18 条。

本计划只冻结规格和开发顺序，不声称 migration、API、页面或测试已经实现。

## 2. 不推翻的既有能力

以下保持原领域与稳定 ID：

- Person / Source / FieldEvidence / Contact；
- Asset / StorageObject / Rendition；
- Work / WorkCredit / WorkAsset；
- Project / ProjectParticipant / ProjectWork；
- Shortlist；
- UsePermission / Export / Deletion / Person Merge；
- T29 JSON rebuild；
- DEV-09 backup / restore / Safety Journal 安全链。

R1 必须通过前向 migration 接这些能力，不允许重建 ID 或旁路现有安全机制。

## 3. R1 开发切片

| ID | 内容 | 主要验收 |
|---|---|---|
| TD2-01 | **Identity & Actor Foundation**：Person≠Talent、originSource、TalentProfile optional、ExternalRef、ServicePrincipal/ActorRef、迁移骨架 | 联系人无需Talent；exact ref解析；机器身份真实审计；稳定ID不变 |
| TD2-02 | **Role & Common Facts**：PersonRole、CapabilityDefinition/Capability、PersonLanguage、TalentLocation、AdultEligibility、Credential | Role/Capability分离；语言/地点/资格有来源和时间；unknown code拒绝 |
| TD2-03 | **Casting & Representation**：CastingProfile、MeasurementSet、size system、Representation | Model/Actor/KOL共享casting事实；尺寸有历史；代表关系可按Role/territory |
| TD2-04 | **Media & Role Context**：Collection type/tag、Shortlist.personRoleId、Translator关系、Creative/Crew组合模型 | type/tag不混；Shortlist不丢Role；Translator可筛；无一职业一表 |
| TD2-05 | **Search & Maintenance Wiring**：Search 2.0 + Merge/Delete/Export/T29 Rebuild/DEV-09 Recovery 全接线 | 组合查询可解释；维护/备份/重建没有新增盲区 |
| TD2-06 | **Schema & Agent Contract Gate**：Schema Registry、FieldProposal、Agent API/MCP contract、R1完整Gate | unknown field/code/schema拒绝；冲突不覆盖；TD2-T01～18全部有真实证据 |

## 4. R1 Gate

只有以下全部通过，TD2-06 才能 PASS：

1. Person ≠ Talent；
2. 一人多 Role；
3. 多来源事实与冲突 Proposal；
4. ExternalRef 精确身份解析；
5. ServicePrincipal Machine Actor；
6. Capability Registry；
7. Language / Location；
8. Casting / Measurement + size system；
9. AdultEligibility；
10. Representation role/territory；
11. MediaCollection type/tag + Asset复用；
12. Shortlist role context；
13. Translator / Crew 组合模型；
14. Credential；
15. Search 2.0 权限/facet一致；
16. Merge/Delete/Export 新关系接线；
17. T29 Rebuild + DEV-09 Recovery；
18. Agent Schema / FieldProposal / stale 处理。

这些用例编号为 TD2-T01～18，不能用旧 FR/T、R0 文档或历史 CI 冒充。

## 5. Agent / AI Gate

TD2-06 之前：

- 可以设计 Provider/Mock，但不把输出按旧 talent 字段写入正式事实；
- 不实现依赖旧 `roles[] / skillCodes[] / languageCodes[] / cityCode / heightCm` 的正式 extract_profile/suggest_tags/parse_search；
- 外部 Agent 不得通过现有人类账号冒充操作；
- 不开放无 Schema 的任意字段写入。

Gate 之后：

- Agent 使用 ServicePrincipal + exact ExternalRef + schemaVersion；
- 无直写权限或冲突写入 FieldProposal；
- AIProposal/FieldProposal 的采纳都走目标领域命令；
- unknown field/code/stale schema fail closed。

## 6. 迁移纪律

- 只追加 migration，不改写历史 migration；
- Person.sourceId 迁移语义收窄为 originSource；
- Person.roles[] → PersonRole；
- skillCodes[] → GENERAL Capability，不猜 Role；
- languageCodes[] → PersonLanguage，level 全部 null；
- cityCode → BASE TalentLocation；
- heightCm 只在有明确相关语义时进入 MeasurementSet，否则 migration review；
- Shortlist 对单 active Role 可自动回填 personRoleId，多 Role 必须人工迁移，不猜；
- 先双读验证，再切新写，最后另一个前向 migration 删除旧列；
- Person/Work/Project/Asset UUID 不变；
- Merge/Delete/Export/T29 Rebuild/DEV-09 Recovery 必须在旧列删除前覆盖全部新关系。

## 7. 对抗性检查重点

实现 PR 必须特别防止：

1. Person 被 TalentProfile 反向强制成“所有自然人都是人才”；
2. originSource 被继续误用成整个人才资料主来源；
3. Agent 用姓名/头像自动 merge；
4. ServicePrincipal 借 defaultMaintainer 冒充人类审计；
5. Capability/Role code 演变成自由标签垃圾场；
6. Model/Actor 重复保存 height/hair/eyes；
7. 尺寸覆盖历史、shoe/clothing size 缺体系；
8. AdultEligibility 被 AI/图片推断；
9. MediaCollection type 与 FASHION/LINGERIE 等内容 tag 再次混淆；
10. Representation 无法表达不同 Role / territory；
11. Shortlist 多Role上下文丢失；
12. Credential 与 Capability 混为一个字段；
13. 新TD2关系漏出 Merge/Delete/Export/Rebuild/Recovery；
14. unknown schema/code 被自由 JSON 吞掉；
15. Proposal 在 source/target/schema 已变化时仍可采纳。

## 8. 完成定义

Talent Domain 2.0 R1 完成不是“多建了一批表”，而是：

- Person 身份唯一且可容纳非人才联系人；
- 多职业、能力、语言、位置、casting、资格、代表关系可组合；
- 每个关键事实知道来源与时间；
- 外部 Agent 可以稳定找人且操作身份可审计；
- 冲突不静默覆盖；
- Shortlist 保留职业上下文；
- Search 2.0 基于结构化事实；
- 维护、导出、重建、恢复没有盲区；
- AI 后续只消费同一 Talent Schema，不另造第二套模型。

详细冻结规格见 `docs/spec/15_TALENT_DOMAIN_2.md`。
