# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/TALENT_DOMAIN_2_PLAN.md` → `docs/spec/15_TALENT_DOMAIN_2.md` → `docs/release/WP9_RECOVERY_WRITEAHEAD_MEDIA.md` → `WP8_RECOVERY_ZERO_DELTA.md` → `WP7_JSON_REBUILD.md` → `WP6_PERSON_MERGE.md` → `IMPLEMENTATION_STATUS.md` → `TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读历史 WP 与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于实现状态；当前代码、前向迁移、生成契约和真实 CI 优先。

## 当前冻结点

- 规格分支：`spec/talent-domain-2-v2`
- 规格 PR：#24，基于 `feat/recovery-writeahead-media` / PR #22
- DEV-09D 功能冻结 head：`9cc30cf71dc4e6fc97bd81f2308dd884a267c230`
- Actions：`36249594313`，5/5 全绿
- routes：103
- core / transport：295/295
- 原 PG：67/67
- 真 pg_dump/pg_restore + private media：PASS
- browser-resume / handoff / media / production：全部 success
- Talent Domain 2.0 R1：SPEC_UPDATED；TD2-01～06 NOT_IMPLEMENTED；TD2-T01～18 NOT_RUN

## Talent Domain 2.0 R1 新不变量

1. **Person ≠ Talent**：Person 是自然人唯一主身份；TalentProfile 是可选 0..1；经纪人/客户联系人可只有 Person。
2. 一个现实人物多职业使用 PersonRole，不复制 Person。
3. Role 表达职业，CapabilityDefinition/PersonCapability 表达能力；未知 code fail closed。
4. Person.source 只作 origin；Language/Location/Capability/Measurement/Representation/Credential 等事实各自带 Source/Evidence，冲突不得静默覆盖。
5. R1 不建“大而全 ModelProfile”；Model UI 由 MODEL Role + CastingProfile + MeasurementSet + Capability + MediaCollection + Work + Representation 组合。
6. MeasurementSet 保留时间快照，鞋/服装尺寸带 size system；旧 height 不反推 MODEL。
7. AdultEligibility 不靠图片推断；UNKNOWN 不满足需 VERIFIED_ADULT 的业务条件；默认不长期保存完整身份证/生日。
8. PersonExternalRef 只做 exact provider/namespace/externalKey 身份解析；姓名/头像/相似度不得自动 merge。
9. ServicePrincipal 是独立 Machine Actor；scope/permission/credential/default human maintainer 分离，审计不得伪装成人类。
10. MediaCollection type 只表示资料形式，内容风格用 Tag；Asset 是文件，Work 是真实作品。
11. Representation 可按 PersonRole / territory 表达；Credential 与 Capability 分离。
12. ShortlistItem 必须保存 personRoleId，多Role不猜，Role失效不静默切换。
13. 外部 Agent/AI 读取版本化 Talent Schema；无直写权或冲突时走 FieldProposal；未知 field/code/schemaVersion 拒绝。
14. 当前 Person.roles[] / skillCodes[] / languageCodes[] / cityCode / heightCm 是迁移输入；只允许追加前向 migration，稳定 Person/Work/Project/Asset ID 不变。
15. Merge/Delete/Export/T29 Rebuild/DEV-09 Recovery 必须覆盖全部新 TD2 关系。
16. TD2-01～06 和 TD2-T01～18 未完成前，不启动正式 extract_profile / suggest_tags / parse_search 人才写入契约。

## DEV-09D 不变量

1. T29 JSON rebuild 仍不是 backup restore。
2. restore 默认 MAINTENANCE；prepare 不能批准新 epoch。
3. restore-check 必须同时验证 DB、migration、Contact key 与 private media。
4. backup manifest v2 同时绑定 PostgreSQL dump 与 private media allowlist。
5. media backup 不递归复制 staging/trash。
6. 所有 authenticated COMMAND / SECRET 写请求默认 write-ahead，不能靠手工 operation allowlist。
7. Safety Journal 写失败必须 fail closed；DB 事务不得开始。
8. 同 Idempotency-Key 重试派生同一 intent identity。
9. Worker deletion cleanup/finalization 在安全写前也要 write-ahead。
10. journal 多进程 append 必须锁内重读 + fsync。
11. staging/production INTERNAL 必须配置绝对 SAFETY_JOURNAL_FILE。
12. backup 必须 MAINTENANCE + gates disabled + quiesced。
13. 零 journal delta 才能按 09C/09D 当前规则 approve。
14. approve 只同步 workspace recovery epoch；不自动开放 INTERNAL。
15. Source/Asset 等恢复隔离状态不会因 approve 自动解除。

## 当前仍未完成

post-backup intent 目前只用于**保守阻断**，还没有形成完整 resolution：

- intent 是否最终 commit；
- 哪些 intent 在事务前失败；
- 哪些 committed delta 已被 prepare 的更保守状态覆盖；
- 哪些需要人工处理/重新执行；
- 如何将处理结果纳入 approval evidence。

## 下一步：先 DEV-09E，再 Talent Domain 2.0，再 AI

DEV-09E Safety Delta Resolution 目标：

1. Safety Journal 为 write-ahead intent 增加可验证 completion marker；
2. 事务成功后记录 COMMITTED；失败不伪造 commit；
3. 同 idempotent command retry 能补齐同一 intent；
4. 恢复时按 backup anchor 之后的 intent/commit 成对分析；
5. 自动 resolution 仅用于“prepare 已明显更保守”的动作；
6. 其余 committed delta 保持 blocker，直到有独立可审计 resolution；
7. unresolved intent（没有 commit marker）同样 blocker；
8. 非零 delta approval 必须绑定 resolution digest。

DEV-09 整体 Gate 关闭后，按 R1 的 `TD2-01 → TD2-02 → TD2-03 → TD2-04 → TD2-05 → TD2-06` 推进，完成 TD2-T01～18，再进入 DEV-08 AI。

不要提前启动 DEV-08 AI，不要把 unresolved journal delta 人工勾选为忽略，也不要为了新职业建立“一职业一套人才库”。
