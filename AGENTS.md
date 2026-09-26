# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP10_RECOVERY_DELTA_RESOLUTION.md` → `IMPLEMENTATION_STATUS.md` → `TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读 `WP9_RECOVERY_WRITEAHEAD_MEDIA.md` 与 Talent Domain 2.0 R1（PR #24）。

规格冻结不等于实现。以当前源码、前向 migration、生成契约和该 head 的真实 CI 为准。

## 当前开发点

- 分支：`feat/recovery-delta-resolution`，PR #25，base PR #22。
- 本地 Node v22.16.0 核心测试：321/321；MemoryStore，不替代 PostgreSQL/Chromium。
- 原 head `214cd89d727c0f072424d8ea4ba7600972a69098` 的 CI 在指纹校验失败，不能引用为功能 PASS。
- 完整 CI 以当前 head 为准，未核实前保持 Draft，不把 DEV-09/FR-30 整体写成完成。
- `main` 与堆叠开发分支不是同一交付状态，合并前需独立整合验收。

## 不变量

1. T29 JSON rebuild 不是完整备份恢复。
2. recovery prepare/check/approve 始终要求 MAINTENANCE 与数据执行闸门关闭。
3. approve 不自动打开 INTERNAL，也不解除 Source/Asset 隔离。
4. manifest v2 绑定 dump、private media、密钥、迁移与外部 Safety Journal；不得跳过指纹校验。
5. authenticated COMMAND/SECRET 在事务前 write-ahead；journal 失败必须 fail closed。
6. transaction promise 抛错不证明未提交，媒体 IO 抛错不证明未删字节。禁止 catch 中自动 aborted。
7. Journal v2 精确保存 requestId，旧 v1 字节与 hash anchor 不重写；缺证据一律保守阻断。
8. 延迟审计按 workspace/operation/resourceId/requestId 一对一匹配有效 intent/commit，不能借用旧记录。
9. 所有 post-backup sequence 必须纳入 resolution，approval 必须绑定完整报告及 digest。
10. 只自动覆盖六类既定的更保守动作；管理员不能勾选忽略未知增量。
11. 不改写历史 migration，不做生产部署/正式资料接管。

## 下一阶段

先关 DEV-09 剩余运维、保留策略与恢复并发/故障 Gate，再按已冻结顺序实现 Talent Domain 2.0 R1。

顺序：DEV-09 → TD2-01～06 → TD2-T01～18 → DEV-08 AI。
PR #24 为 SPEC_ONLY / NOT_IMPLEMENTED，不能以已有 CI 冒充人才 2.0 验收。
