# 人才 2.0 无冲突专业图合并｜2026-09-27

## 接续事实

云端基线 PR #26 为 Draft，head `e8906b3508439c245bc5419a3e9e06c8e3bae7d7`，基于 PR #25 的 `feat/recovery-delta-resolution`。Actions `36296419596` 五条链全通过。main 仍为 R1，未包含后续开发链。本地原目录的未提交测试报告保留，开发在独立 worktree 的 `codex/talent-typed-merge` 分支进行。

规格依据 PR #24 / `54166a6f0f6753863d17f083a533b2cad5a9b3c2` 的 Talent Domain 2.0 R1。此次是 TD2-T16 的一个可执行子集，**不是完整 typed merge，也不关闭 TD2-06**。

## 实现

- `/people/merge-preview` 增加 `professional`：逐条稳定 ID、版本、动作和具体冲突。只返回维护元数据，不返回资格编号/密文、ExternalRef 值、建议原文或证据原文。
- 无冲突时，将重复人物的职业、能力、语言、地点、外观、量尺历史、成人资格、代表关系、外部标识、资质、翻译关系、集合/标签/素材引用及迁移复核整体改绑。保留记录 UUID、原来源、事实值和专业关系 UUID；typed Evidence 不换 owner。资格编号的 AAD 绑定资质 ID，迁移不破坏密文。
- 被合并人物作为第三方经纪人时，显式确认后改绑其代表关系，并提升被代表人物版本。禁止合并后形成自我代表。
- 受影响 PENDING Proposal 置为 STALE；直接 Person proposal 改绑主身份，typed proposal 保留 owner。机器身份和独立机构不跟随人才迁移。
- 执行请求新增可选 `professionalDecisions`，有专业迁移时必须与当前预览逐项完全一致。缺少、重复、伪造动作均拒绝；旧调用方只能继续执行无需专业迁移的请求。
- 既有身份、范围、来源、敏感维护、媒体权限和执行环境门继续有效。隐藏/不可用依赖不暴露具体记录，不能借管理员身份绕过范围。执行事务内重扫，专业图和端点变化使旧预览失效。
- 业务图、合并决定、旧 ID alias、审计、回执同事务。失败后使用原请求键重试；回执重放沿用当前权限检查。
- 现有人才合并页面显示专业迁移清单，逐项勾选后才能执行。页面完成不代表人才 2.0 组合工作台完成。

没有新增路由或迁移；请求 Schema、生成请求类型、OpenAPI 请求契约和前端 DTO 同步更新。历史 migration 未改动。

## 仍阻断的情况

- 两份 TalentProfile、两份 CastingProfile 或两份当前有效 AdultEligibility；
- 同职业/同语言有效期重叠、常驻地有效期重叠；
- 会被旧候选冲突处理器丢失的职业上下文或迁移复核关联；
- 隐藏/不可用来源或素材、缺少敏感维护权限、自我代表，以及超过 500 条专业图依赖。

冲突时保留双方原记录，不默删其中一份；下一步需要无损的逐字段/逐关系决策及旧 typed ID 处置。当前摘要保守包含工作空间人才与安全端点快照，因此无关资料变化也可能要求重新预览；不宣称性能 Gate 已完成。

## 验证与未完成门

验证结果见同日 `TEST_REPORT.md`，不继承基线的 CI 结果。

- 核心回归：354/354，含新增 7 项；CORE_MEMORY_TESTED。
- 完整服务/React typecheck、163 请求契约、静态检查和构建：PASS。
- 新空库 PostgreSQL 16 专业合并：DB_TESTED；相同共享断言验证原来源/UUID/职业候选/资格解密、审计后故障回滚、同键重试和重放。
- 完整 PostgreSQL/重建/恢复：DB_TESTED，原合同 67/67、T29 重建、恢复准备/检查、真实 DB+media 恢复、既有 TD2 删除/恢复、新增 TD2 合并全部通过。新增浏览器专业迁移与原 production 链：BROWSER_TESTED。
- 云端 CI：以最终提交对应 Actions 为准；初始 `e8906b3` 的成功不代表此次变更通过。
- PROVIDER_VERIFIED 不适用；正式部署、生产迁移、正式数据接管、完整冲突合并、专业导出/T29 重建、复杂来源/素材清理、组合工作台及 AI 均未完成或未执行。

本机验收发现 macOS 临时路径符号链接不满足私有媒体根目录规则，使用 `TMPDIR=/private/tmp` 后重跑；保留目录安全规则。系统默认 pg_dump 14 不能备份 PostgreSQL 16，另一本机 pg_dump/pg_restore 17 恢复至 16 时因 `transaction_timeout` 失败；最终使用隔离容器内匹配的 PostgreSQL 16 工具。不修改用例预期、不跳过失败、不放大超时。

实际浏览器验证还发现 `.codex` 隐藏工作目录内的绝对 `sendFile` 路径触发 Express 的隐藏文件拒绝，导致首页 404；改为固定静态目录 root 下的 `index.html`，不放开 dotfiles 策略。已在该工作目录通过真实登录及业务链验证。
