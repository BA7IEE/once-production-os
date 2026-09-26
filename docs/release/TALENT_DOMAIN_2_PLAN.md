# Talent Domain 2.0｜实施前冻结计划

日期：2026-09-26  
状态：SPEC_ONLY / NOT_IMPLEMENTED  
基线：`feat/recovery-writeahead-media` PR #22 head `c0768330d21f0fddf2853e96417d101eaa2bfbe9`

## 1. 决策

当前恢复链继续按 DEV-09 完成。恢复链完成后，先执行 Talent Domain 2.0，再启动 DEV-08 AI。

原因不是增加功能，而是避免 AI / Agent 围绕当前过渡字段 `Person.roles[] / skillCodes[] / heightCm` 写入新事实，随后人才模型升级造成更大迁移与证据返工。

本计划只冻结规格和开发顺序，不声称任何 Talent 2.0 migration、API、页面或测试已经实现。

## 2. 不推翻的现有能力

以下保持原领域和稳定 ID：

- Person / Source / FieldEvidence / Contact；
- Asset / StorageObject / Rendition；
- Work / WorkCredit / WorkAsset；
- Project / ProjectParticipant / ProjectWork；
- Shortlist；
- UsePermission / Export / Deletion / Merge；
- DEV-09 backup / restore 安全链。

## 3. 新增开发切片

| ID | 内容 | 主要验收 |
|---|---|---|
| TD2-01 | PersonRole / TalentProfile / Capability 正规化与兼容迁移 | 一个 Person 多 Role；旧 role/skill 无损回填；稳定 ID 不变 |
| TD2-02 | ModelProfile + 专属字段 Evidence | 身高/三围/鞋服码/测量日期按 Model Role 管理；非 Model 不误挂 |
| TD2-03 | Representation + MediaCollection | 经纪/Agency 有类型化关系；同一 Asset 可复用到多个集合 |
| TD2-04 | Translator 语言对/服务模式 + Crew 通用模型验证 | Translator 可筛语言对；摄影/剪辑等无需一职业一表 |
| TD2-05 | Search 2.0 与 Shortlist/Export/Rebuild/Recovery 接线 | Role+Capability+Work+Media 搜索；旧安全边界不回退 |
| TD2-06 | Talent Schema / Agent Contract + Gate | 未知字段拒绝；schemaVersion 固定；Agent 写入不绕过来源/权限/CAS |

## 4. AI Gate

在 TD2-06 之前：

- 可以继续 Mock/设计 AI provider，不把其输出写入新的正式人才事实；
- 不实现依赖旧 `roles[] / skillCodes[] / heightCm` 的 extract_profile/suggest_tags/parse_search 正式契约；
- DEV-08 不标记开始。

Gate 通过后，AI 只消费版本化 Talent Schema；AI Proposal 仍不是业务事实，采纳继续走人类确认和目标域命令。

## 5. 迁移纪律

- 只追加 migration，不改写已经应用的历史 migration；
- 先双读验证，再切新写，最后另一个 migration 删除旧列；
- `skillCodes[]` 迁为 GENERAL capability，不猜角色；
- `heightCm` 只有存在明确 MODEL Role 才自动映射，否则进入迁移报告；
- Person/Work/Project/Asset UUID 不变；
- T29 JSON rebuild 与 DEV-09 backup/restore 都必须在旧列删除前证明新模型可重建/恢复。

## 6. 对抗性检查重点

实现 PR 必须重点验证：

1. 一人多角色不会复制 Person；
2. Role 与 Capability 不混淆；
3. 不产生“每职业一表”的无界扩张；
4. MediaCollection 不复制 Asset；
5. External Work 不被算成 ONCE 实绩；
6. 新专属字段的权限、Evidence、导出和 AI 白名单默认 fail closed；
7. Agent 未知字段、未知 code、旧 schemaVersion 明确拒绝；
8. Merge/Delete/Export/Rebuild/Recovery 覆盖新增关系；
9. 旧库前向升级和新空库安装都可运行；
10. 不因 Talent 2.0 修改已通过的安全不变量。

详细冻结规格见 `docs/spec/15_TALENT_DOMAIN_2.md`。
