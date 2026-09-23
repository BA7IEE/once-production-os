# 当前代码结构与实现边界

## 1. 一套业务核心，两种明确区分的适配器

```text
React 管理前端源码 ── cookie + CSRF ── Nest/Express 入口源码
                                      ↓
                             Application / routes
                                      ↓
                Identity / Talent / Imports / replay-policy
                                      ↓
                         Commands + 事务审计 + Tx
                           ↙                   ↘
               PrismaStore（正式代码）    MemoryStore（仅 tests）
                       ↓                        ↓
                PostgreSQL 候选迁移         合成单元/HTTP 验证
```

生产入口不会使用 MemoryStore，没有隐式降级。业务规则独立于 Nest 装饰器；2026-09-23 已在隔离 PostgreSQL 和本地真实 API/浏览器主链路实测正式适配器，生产部署与完整异常路径仍待验收。

## 2. 目录与属主

| 路径 | 本增量职责 |
|---|---|
| packages/core/src/identity.ts | 账号、激活、会话、重置、限流、角色调整 |
| policy.ts | 当前动作、范围、来源有效性；ADMIN 没有范围旁路 |
| talent.ts | 本增量的人才、来源、受限联系信息、字段核验、分类；后续随领域增长拆分，不复制规则 |
| commands.ts | 最小幂等回执，接收领域鉴权回调；不读取人才表 |
| replay-policy.ts | 回执重新读取时的领域权限和来源判断 |
| imports.ts | 有界 JSON 预览、选择集冻结、任务领取、逐行原子执行 |
| json-boundary.ts / validation.ts | 重复键、原型键、非法 Unicode、数值、嵌套、额外字段的请求约束 |
| api.ts / routes.ts | 框架无关的请求入口与登记表；37 条路由 |
| apps/api/src | Nest/Express、Prisma、配置、bootstrap 和独立 Worker 入口 |
| apps/admin-web/src | React 页面、显式 DTO、内存请求状态和响应错误呈现 |
| prisma | 17 个模型、SQL 初始迁移、组合 FK 与 CHECK；隔离空库迁移及专用测试 DB_TESTED，正式数据升级 NOT_RUN |

## 3. 本增量数据表

workspaces、users、memberships、sessions、activations、scopes、scopeMembers、sources、people、contacts、evidence、dictionary、receipts、audits、rateBuckets、imports、jobs。

用户不等于人才；角色为多值分类。敏感联系方式不在 Person 中，以 AES-256-GCM 保存，AAD 绑定 workspace/person/contact。一般人才 DTO 不携带密文、原文或联系信息。

重要限制：字段核验 evidence 是追加记录，带值摘要和来源 revision，但 **sources 尚无完整历史版本/决策归档表**。当前修改来源只保留新内容及操作元数据；暂停原因仍使用当前依据字段保存。因此尚不满足完整证据历史和恢复重建要求，不能把“有 revision”说成“旧版本全文可追溯”。正式资料试用前须完成 SourceRevision/决定记录，保留撤销原因和历史依据的独立语义。

## 4. 事务及规模选择

PrismaStore 每个短事务获取一个 PostgreSQL advisory transaction lock，确保当前小团队基线的身份检查、CAS、回执和写入之间不交错。这个选择是实现简化，不是高并发设计；会串行化所有应用事务。列表和范围过滤目前存在全量读取及多次查询，100 行预览亦可能放大查询数。

正式数据规模前必须做真实 DB 压测，把授权过滤/分页下推 SQL，再评审细粒度锁与多进程竞争。不允许因为慢就拿掉锁，也不能声明已经达到 v0.3 性能目标。

外部 I/O、密码 KDF 不放在业务事务内。Worker 现在只有 IMPORT_PEOPLE，无 AI、无文件或网站任务。任务按行重新查发起者、当前来源及其版本；租约 30 秒、过期可接管、最多 3 次领取，旧租约无法回写。失败会标记为 FAILED，已经提交的行保留，不承诺整批回滚。

## 5. 协议与状态

写命令需要 Idempotency-Key；相同键和请求先命中回执，再检查原 CAS，重放仍复查当前读取权限。不同输入冲突；凭证签发为单次敏感响应，不能把 secret 存入普通回执。

同步成功回执 state=SUCCEEDED；import.commit 为 HTTP 202/state=ACCEPTED，只代表排队。任务另有 QUEUED/RUNNING/SUCCEEDED/FAILED。前端结果未知保存原请求键于内存，不自动重发，不存 localStorage。关闭/刷新丢失内存键后应先检查已有记录。

JSON 摘要使用排序键的受限输入规范：拒绝不安全整数、无效 Unicode、重复键等。它不是已经验证全部 RFC 8785/JCS 兼容向量的实现；完整跨客户端规范仍属于 DEV-02 待收敛事项。

## 6. 契约生成的准确范围

运行 `pnpm contract:generate` 从路由与严格输入 Schema 生成 OpenAPI 路径/请求和前端 Inputs。`contract:check` 比较重新生成结果。

响应为白名单 DTO，当前前端 response types 独立手写；OpenAPI 未包含完整响应 JSON Schema，也未验证每一类响应的运行时结构。不得描述为“全部 API 客户端完全生成、全响应已契约测试”。

## 7. 人工建档与协作规则

最小档案只需显示名、至少一个制作角色及一个来源（已有 ID 或 inline，二选一）。临时整理最长 7 天，限定范围；需要长期内部使用依据时由拥有 sources.review 的人核验。空缺字段保持未知，材料陈述不代表系统替本人或品牌证明真实性。

新增人物初始 DRAFT；状态修改与来源有效性是两条不同轴。ARCHIVED 目前只是档案状态，不等于永久删除或访问撤销。来源暂停/到期会使依赖该来源的人才下一次读取受限，已发送到浏览器或被人复制的内容无法通过服务端撤回。

## 8. 后续扩展

继续复用稳定人员 ID、来源引用、范围与版本、事务命令入口；新增媒体/作品/项目拥有独立业务表及正式权限。不要把报价、合同、排期或财务事实堆进 Person.extra；不要把本增量中不存在的 AI 变成“已预留并完成”。
