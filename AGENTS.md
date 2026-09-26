# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP6_PERSON_MERGE.md` → `WP5_DELETION_CLEANING.md` → `WP4_DELETION_IMPACT_PREVIEW.md` → `WP3_EXPORT_DEPENDENCIES.md` → `IMPLEMENTATION_STATUS.md` → `TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读历史 WP2B/WP2/WP1/M1/H1/A1/R1 与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于实现状态；当前代码、前向迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`feat/person-merge`
- PR：#17，基于 `feat/deletion-finalization` / PR #15
- 功能冻结 head：`1673272979e338ede4ddf09952c941cae7344070`
- Actions：`36217418690`，五个 job 全绿
- 请求契约：103
- 核心/传输：263/263
- PostgreSQL：67/67
- Chromium 表单：6/6
- browser-resume / handoff / media / production：全部成功

文档收口后的最终 head 必须重跑同一套 CI。

## DEV-07F～07G 当前不变量

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

进入 **T29 隔离 JSON 重建**：

1. 只消费受控 `once-export-v1`；
2. 默认只允许新建隔离工作空间 / 空数据库目标，不覆盖现有业务数据；
3. 重建稳定 ID、Source / Person / Work / Project 和选中的关系；
4. 明确不重建 Session、密码、密钥、未导出字段、审计伪历史；
5. 完成规格 T29 的“10 人 / 3 作品 / 1 项目关系”真实重建验收；
6. JSON 重建仍不是 DEV-09 备份恢复，二者必须保持独立。

T29 完成后再推进 DEV-09。不要提前启动 DEV-08 AI。
