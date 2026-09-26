# ONCE Production OS｜v0.5 / Talent Domain 2.0 R1 文档 QA

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI  
状态：R1 文档一致性复核；**不等于产品测试通过**

## 1. 本轮检查边界

本轮通过 GitHub 当前 PR #24 文档和现有 Prisma/schema/release 证据，对 Talent Domain 2.0 R0 做结构性对抗审查并回填主文档。

没有因此执行或宣称：

- Talent R1 migration 已运行；
- PostgreSQL 新表/约束已验证；
- API/UI 已实现；
- ServicePrincipal/ExternalRef/Proposal 已运行；
- TD2-T01～18 已通过；
- 真实人才资料已导入；
- DEV-08 AI 已启动。

现有 DEV-00～09 的真实实现状态仍只以 `docs/release/`、对应 PR/commit/CI 为证据。

## 2. R1 跨文档一致性检查

| 检查 | R1 结果 | 边界 |
|---|---|---|
| Person / Talent 边界 | SPEC_UPDATED | Person为自然人；TalentProfile 0..1；Role要求Talent |
| 多来源事实 | SPEC_UPDATED | originSource只作身份来源；事实各自Evidence；冲突走Proposal |
| 多职业 | SPEC_UPDATED | PersonRole；不复制Person；Shortlist保存personRoleId |
| Capability治理 | SPEC_UPDATED | CapabilityDefinition/Schema Registry；unknown code fail closed |
| Language / Location | SPEC_UPDATED | 行记录+来源/时间；旧数组迁移不猜级别 |
| Model/Actor casting | SPEC_UPDATED | 取消大而全ModelProfile；CastingProfile+MeasurementSet复用 |
| 尺寸体系 | SPEC_UPDATED | Measurement历史；shoe/clothing value+system |
| 成人资格 | SPEC_UPDATED | AdultEligibility；UNKNOWN fail closed；不依赖图片推断 |
| Representation | SPEC_UPDATED | 可按Role/territory/有效期表达 |
| ExternalRef | SPEC_UPDATED | exact映射；姓名/头像不得自动merge |
| Credential | SPEC_UPDATED | 与Capability分离；敏感编号掩码/加密 |
| MediaCollection | SPEC_UPDATED | type与tag分离；Asset不复制 |
| Machine Actor | SPEC_UPDATED | ServicePrincipal独立于User/Membership |
| Agent冲突写入 | SPEC_UPDATED | FieldProposal + schema/base/source revision |
| API/权限 | SPEC_UPDATED | Machine认证、Talent R1 typed routes、Schema/Proposal routes |
| 状态/时序 | SPEC_UPDATED | Proposal、ExternalRef、Measurement、Eligibility、Credential、ServicePrincipal状态 |
| 运维/恢复 | SPEC_UPDATED | Machine credential与新TD2关系进入restore-check |
| 开发Backlog | SPEC_UPDATED | TD2-01～06按R1重定义 |
| 独立验收 | SPEC_UPDATED | TD2-T01～18；旧测试不能冒充R1通过 |

## 3. 仍需实现时证明的约束

### 数据库

- Person 可无 TalentProfile；
- PersonRole 必须有 TalentProfile；
- personRoleId 所有组合 FK 均证明属于同一 Person；
- ExternalRef active 唯一性与 namespace/issuer 作用域；
- MeasurementSet / CastingProfile current 指针一致；
- Representation role/agent/agency exactly-one/至少一项约束；
- FieldEvidence / FieldProposal typed owner exactly-one；
- Audit/Receipt actor 为 Membership / ServicePrincipal exactly-one；
- ShortlistItem.personRoleId 与 personId 组合约束；
- MediaCollection type/tag/item 父子关系；
- Credential/Eligibility/Proposal 的敏感字段和状态 CHECK。

### 迁移

- roles[] / skills[] / languages[] / city / height 回填规则真实执行；
- 多Role Shortlist 不猜；
- height 不反推 MODEL；
- originSource 语义切换不伪造字段证据；
- 旧ID稳定；
- 双读比较后才切新写；
- 删除旧列只能使用新的前向 migration。

### 安全与维护

- ServicePrincipal revoke/rotate；
- Machine Actor scope/permission；
- Proposal stale；
- AdultEligibility fail closed；
- ExternalRef冲突；
- Merge/Delete/Export；
- T29 Rebuild；
- DEV-09 Backup/Restore；
- 敏感 Credential / Adult evidence DTO 白名单。

## 4. R1 文档关系

R1 事实优先级：

1. `15_TALENT_DOMAIN_2.md`：Talent R1 专项冻结契约；
2. `04_PRD.md`：产品行为；
3. `07_DATA_MODEL.md`：逻辑模型/约束；
4. `08_API_PERMISSIONS.md`：接口与Machine Actor权限；
5. `09_STATES_WORKFLOWS.md`：状态与Proposal时序；
6. `10_BACKLOG_TESTS.md`：TD2-01～06与TD2-T01～18；
7. `12_DECISIONS_CHANGELOG.md`：正式架构决策；
8. `docs/release/TALENT_DOMAIN_2_PLAN.md`：基于当前实现的实施接力。

如存在矛盾，先修主文档，不允许编码 Agent 挑对自己方便的一份执行。

## 5. 冻结边界

当前可以称为：

**Talent Domain 2.0 R1 SPEC FROZEN**

不能称为：

- Talent Domain 2.0 implemented；
- database migrated；
- Agent ready；
- MCP ready；
- AI ready；
- production ready。

真正冻结为实现完成必须以 TD2-T01～18 的指定 commit 证据为准。

文件指纹由仓库根 `MANIFEST.sha256` 统一维护；本文件不再复制一份容易失效的静态哈希表。
