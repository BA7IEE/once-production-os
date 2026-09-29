# WP5｜DEV-07C～07E 删除阻断、保留决定与计划驱动依赖清理

日期：2026-09-25。应用 `0.1.0-dev.1`。基线：PR #11 / DEV-07B。当前功能 head：`32316937b91c7f66c9ed14a368ac74c2b58eed5b`，PR #14。

本工作包把删除从“只预览”推进到真正的受控依赖清理，但**没有宣告删除完成**。

## 1. 状态链

```text
preview（零写入）
  → DRAFT（冻结影响图）
  → BLOCKED_FOR_USE（正常使用立即失效）
  → 人工保留决定
  → planDigest 冻结
  → 显式 cleanup start
  → CLEANING（Worker 按 executionPlanDigest 执行）
```

当前没有从 CLEANING 自动进入 COMPLETED / RETAINED_WITH_BASIS。

## 2. 阻断语义

BLOCKED_FOR_USE 和 CLEANING 都进入统一删除阻断策略。正常 Source / Person / Work / Project / Asset 详情、列表、结构化搜索/Facets、H1 交接、Shortlist 依赖和旧导出都会失效。

删除管理接口自己使用受控 bypass，以便被阻断对象仍可继续审计和清理。Source / Person 阻断会提升 protectionEpoch；Source 同事务追加 DELETION_BLOCKED history。

## 3. 保留决定

PROVEN 项自动 APPLY_PROPOSED。REVIEW_REQUIRED 项必须人工选择：

- APPLY_PROPOSED：按系统建议处置；
- RETAIN_WITH_BASIS：有独立依据保留。

保留必须由具备 sources.review 的成员批准，并绑定另一份当前有效 INTERNAL_USE Source。系统冻结该 Source 的 revision / protectionEpoch。计划冻结和 CLEANING 启动都会再次核对。

安全审核列表只返回 decision item ID 和依赖分类，不回显被冻结的底层 resource ID 或 retention source ID。

## 4. 不可逆清理执行器

`DATA_CLEANUP_MODE` 与 `data.delete` 分离。生产默认 DISABLED。

CLEANING Worker 使用 30 秒租约、最多 3 次 item 尝试和 executionPlanDigest。当前自动动作：

| resolvedAction | 当前实现 |
|---|---|
| REMOVE_RELATION | 删除 Work/Project/Shortlist 关系 |
| REVOKE_PERMISSION | UsePermission 改为 REVOKED |
| ERASE_DERIVATIVE | Export 收敛为 ERASED 最小头；ExportDependency 删除 |
| ERASE_PAYLOAD | Contact / FieldEvidence 删除；Import rows 清空 |
| RETAIN_MINIMAL_HEADER | Handoff 收敛为撤销安全历史 |
| RETAIN_WITH_BASIS | 再核对保留依据并写完成证据 |

每个 DONE item 必须写 cleanupEvidenceDigest、cleanedAt 和 worker audit。

以下仍明确 WAITING_EXTERNAL：
- Media / Upload 的物理对象；
- SourceHistory；
- Person / Work / Project 根对象，以及后续 Source / Asset 根终结；
- 其他未注册专用 payload。

因此 Worker 不会把未知动作或专用清理需求假报成完成。

## 5. 真实 Review 中发现的问题

### PostgreSQL NULL/UNKNOWN

首轮真实 PG 反例发现 `CHECK ("executionPlanDigest" ~ regex)` 在字段为 NULL 时结果是 UNKNOWN，而 PostgreSQL CHECK 只拒绝 FALSE。类似风险也存在 DONE cleanupEvidenceDigest 和 WAITING/FAILED errorCode。

没有改写 011；追加 `202609240012_cleanup_null_guards`，显式加入 `IS NOT NULL` 再做正则/长度检查。PG 随后验证：

- CLEANING executionPlanDigest 不能为 NULL；
- DONE cleanupEvidenceDigest 不能为 NULL；
- WAITING_EXTERNAL / FAILED 必须有非空 errorCode。

### 队列测试不能假设一次 claim 就是目标

共享 PG 套件可能存在更早的 QUEUED Export。测试改为按真实 Worker 语义持续 claim/process，直到目标 Export READY，而不是把一次 claim 的对象假定为本测试任务。

### cleanup item 原子性

真实 PG 用 FaultStore 在 WorkCredit 已准备删除后让 audit insert 失败；整事务回滚，WorkCredit 仍存在，item 标 FAILED。随后正常 Worker 重领并删除成功，attempts 从 1 变 2，写入 cleanupEvidenceDigest。

## 6. 最终验证

功能 head `32316937b91c7f66c9ed14a368ac74c2b58eed5b`，Actions 36096878872：

| 检查 | 结果 |
|---|---|
| 请求契约 | 101 |
| 核心/传输 | 251/251 |
| PostgreSQL | 63/63 |
| 原生表单 Chromium | 6/6 |
| browser-resume / handoff / media / production | 全部 success |

真实 Chromium 出现：

```text
PASS DEV-07E browser: frozen plan -> CLEANING -> dependency cleanup evidence; project root remains blocked and preserved
```

真实 PostgreSQL 出现：

```text
ok 60 - DEV-07E PG executes frozen dependency cleanup and keeps blocked root
ok 61 - DEV-07E PG cleanup item delete rolls back when audit insert fails, then retries safely
ok 62 - DEV-07E PG cleanup state constraints reject forged completion evidence
# tests 63
# pass 63
# fail 0
```

## 7. 未完成

FR-13/T13 仍不能标完成。还缺：

1. 私有媒体原件/预览的物理清理与清理证据；
2. SourceHistory 的专用最小保留/擦除程序；
3. Person / Work / Project / Source / Asset 根对象最终 ERASED 或有据最小头；
4. 删除请求最终 COMPLETED / RETAINED_WITH_BASIS / FAILED；
5. Person merge；
6. T29 隔离 JSON 重建；
7. DEV-09 恢复演练。

生产 DATA_CLEANUP_MODE 保持 DISABLED。
