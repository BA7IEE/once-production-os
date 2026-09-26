# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/TALENT_DOMAIN_2_PLAN.md` → `docs/spec/15_TALENT_DOMAIN_2.md` → 当前 DEV-09 恢复链对应 release 文档/PR → `IMPLEMENTATION_STATUS.md` → `TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读 WP7/WP6/WP5/WP4/WP3/WP2B/WP2/WP1/M1/H1/A1/R1 与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于实现状态；当前代码、前向迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`spec/talent-domain-2`
- 基线：`feat/recovery-writeahead-media` / PR #22 head `c0768330d21f0fddf2853e96417d101eaa2bfbe9`
- 本分支性质：**规格升级，不含 Talent 2.0 产品实现**
- 新增：`docs/spec/15_TALENT_DOMAIN_2.md`、`docs/release/TALENT_DOMAIN_2_PLAN.md`
- 决策：完成当前 DEV-09 恢复链后执行 TD2-01～06，再启动 DEV-08 AI
- 不得把本分支文档更新记作 schema/API/UI/测试已经完成

## Talent Domain 2.0 新不变量

1. 一个现实人物只有一个 Person；多职业使用 PersonRole，不复制人物。
2. Role 表达职业，Capability 表达能力，不能用无限细分 Role 代替能力模型。
3. 所有人共用 TalentProfile；专属 profile 只按真实结构化需求增加。
4. 首批完整专属结构为 ModelProfile；Translator 使用语言对/服务模式；Creative/Crew 优先 Role + Capability + Work。
5. Asset 是文件、MediaCollection 是组织方式、Work 是真实作品；同一 Asset 可复用但不复制物理对象。
6. Agent/Agency/booking 使用 Representation 类型化关系，不塞进备注。
7. Agent/AI 必须读取版本化 Talent Schema；未知字段/code/schemaVersion fail closed。
8. 当前 Person.roles[] / skillCodes[] / heightCm 只是迁移输入；只允许追加前向迁移，稳定 Person/Work/Project/Asset ID 不变。
9. TD2-01～06 未完成前，不启动正式 extract_profile / suggest_tags / parse_search 人才写入契约。
10. Merge/Delete/Export/Rebuild/Recovery 必须覆盖所有新增 TD2 关系，不能形成维护盲区。

## DEV-07F～07H 当前不变量

1. 删除必须从 impact preview 开始；hidden dependency 只计 unresolved，不能枚举不可见对象。
2. DEV-07F 已实现专用最终化：只有依赖清理和专用清理均可证明完成时，根对象才进入 ERASED 最小头，请求才进入 COMPLETED / RETAINED_WITH_BASIS；失败保持 FAILED/阻断。
3. Local media 必须先物理 purge 原件/预览，再写 ERASED header；SourceHistory 只能走 reviewed one-way redaction adapter，普通 UPDATE / DELETE 仍禁止。
4. Person merge 绝不自动触发；必须 `data.merge + records.write`、显式 preview、冲突逐项决定、`DATA_MERGE_MODE=INTERNAL_APPROVED`。
5. canonical / duplicate scope 必须一致；旧 ID 只读解析前先检查旧身份原 scope，不能借 canonical 扩权。
6. old Person ID 不能继续写、handoff 或进入普通 list/search；PersonAlias 不能自指/成链，且 merge decision / alias 为 append-only 审计证据。
7. Handoff / INTERNAL_EXPORT UsePermission 在 merge 时撤销，不能转移到新身份。
8. Contact 因 AAD 含 personId 必须解密后重新加密；无 `sensitive.write` 时 preview 不返回 Contact 精确数量，也不逐条探测其来源。
9. Person profile 只有一个 primary Source：同 Source 才允许采用 duplicate 值/数组 UNION；不同 Source 的字段冲突只能保留 canonical，避免改写来源归因。
10. Work / Project / Shortlist 隐藏依赖直接阻断；可见关系无冲突时改绑 canonical，有冲突时必须逐项明确保留哪条关系。
11. Shortlist 改绑后必须重写 addedPersonRevision / addedPersonSourceRevision，身份变化不能被误报成“未变化”。
12. previewDigest 执行前重新扫描；关系、来源、版本或影响变化使旧 preview 失效。
13. Audit 与 merge 领域写同事务；audit 失败整体回滚，同键可安全重试；merge receipt replay 仍复查当前权限/可见性。
14. 旧迁移不改写；新安全修复只追加前向迁移。

## 导出安全边界继续有效

`data.export + INTERNAL_EXPORT UsePermission + DATA_EGRESS_MODE` 缺一不可。ERASED Export 只保留最小安全头；冻结 manifest、fields、usePermissionRefs、payload、payloadDigest 会被清掉。

## 下一步

1. 先完成当前 **DEV-09 / FR-30** 恢复链，不因本规格PR打断其安全闭环；
2. DEV-09 Gate 通过后启动 **TD2-01**，按 TD2-01 → 02/03/04 → 05 → 06 推进；
3. 每个 TD2 PR 必须提供前向 migration、旧库升级、新空库、真实 PostgreSQL、浏览器、维护依赖与回滚/前滚证据；
4. TD2-05 必须把新增关系接入 Shortlist、Export、Person merge、Deletion、T29 rebuild 和 DEV-09 recovery；
5. TD2-06 固定版本化 Talent Schema / Agent Contract，并跑 TD2-T01～12；
6. TD2 Gate 通过后才进入 **DEV-08 AI**。

不要把 T29 JSON rebuild 当数据库备份；不要因为 Talent 2.0 增加职业需求就创建“一职业一表”的空平台；不要提前启动正式人才 AI。