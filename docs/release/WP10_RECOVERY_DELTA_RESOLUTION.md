# WP10｜DEV-09E Safety Delta Resolution

## 当前状态

分支 `feat/recovery-delta-resolution`，PR #25，基于 PR #22。

本批为恢复增量审批实现与对抗修复；**不是整个 FR-30 的完成声明，也不是生产接管许可**。

接续时发现原 head `214cd89d727c0f072424d8ea4ba7600972a69098` 的 Actions `36254839809` 在 MANIFEST 指纹校验失败，功能测试没有开始。三处漂移为 API、007 migration、safety-intent test。保留校验门，按真实文件重新计算，不修改历史 migration。

## 已实现

- write-ahead intent 与 committed completion 逐条归并。
- 仅六类已有安全动作可由 recovery prepare 更保守状态覆盖：source.suspend、handoff.decline、handoff.revoke、usePermission.revoke、asset.quarantine、upload.cancel。
- 非零增量只有全部可解释且无 blocker 才可 approve；approval 绑定 deltaResolutionDigest、完整报告和日志锚点。
- 每一个 post-backup sequence 必须且仅能被报告覆盖一次。
- 无 write-ahead、无 completion、不在上述范围的已提交变更、无法关联的审计继续阻断。
- approve 只批准新 recovery epoch，不打开 INTERNAL，不解除 Source/Asset 隔离。

## 本轮实际修复

1. Journal entry 前向升级为 v2，持久化 requestId；v1 历史记录和 header/hash/backup anchor 原样保留，不重写。
2. 延迟审计只能按 workspace + operation + resourceId + requestId 精确匹配一组有效 intent/commit；一个 completion 只解释一个不同 AuditEvent，备份前已消费的证据不可复用。
3. 全链 marker 校验覆盖备份前记录，孤立 commit、矛盾 commit/abort 不能解释备份后审计。
4. 被 prepare 覆盖的 commit 必须指向 intent 的同一个资源；不能用另一对象的完成标记通过审批。
5. API/Worker 的 transaction promise 抛错不再写 abort：数据库可能已经提交，只是确认响应丢失；物理媒体也可能已删除。
6. abort 只有显式 NOT_STARTED 证明、同一请求、有效 v2 intent 且非多事务 Worker 才可 NO_COMMIT。旧 v1 abort 一律不能证明无副作用；缺 intent 继续阻断。
7. Finalizer 的 write-ahead 失败不会进入会写数据库的 fail-state 路径，也不会碰媒体字节。

## 验证边界

- 修复前新增的首批回归：15 项中 10 项失败，证明缺口实际可复现。
- 最终隔离本地核心测试：321/321，Node v22.16.0，MemoryStore；不等同 PostgreSQL 或浏览器验收。
- 新增 `recovery-delta-adversarial.test.ts` 12 项、`recovery-worker-intent.test.ts` 2 项、`safety-intent.test.ts` 的提交后断线回归 1 项。
- 当前提交的完整 GitHub Actions 验收仍须以最终 head 对应结果为准；未完成前保持 Draft。

## 明确限制与后续顺序

- 自动识别的是少量能证明已被隔离覆盖的动作，不是任意业务增量重放器。
- v1 缺少 requestId 的延迟审计继续 blocker；不根据相似字段猜测请求身份。
- 丢失 completion 后的幂等重试不会重复业务写入；若原审计与补写 completion 的 requestId 不一致，仍保守阻断，尚无持久回执关联的自动修复。
- 仍需 FR-30 正式运维手册、长期保留策略、恢复并发/故障审查和开发分支整合验收。
- 不改历史 migration、不接管正式资料、不运行生产数据库、不开放 AI。
- 冻结顺序保持：完成 DEV-09 整体 Gate → 合入 Talent Domain 2.0 R1（PR #24）→ TD2-01～06 → TD2-T01～18 → DEV-08 AI。
- PR #24 是 SPEC_ONLY / NOT_IMPLEMENTED；不要把当前扁平人才结构写成 TD2 已实现。
