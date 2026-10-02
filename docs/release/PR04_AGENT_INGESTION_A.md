## 2026-10-02：PR-04A finalization（Draft，待最终冻结复核）

本轮仅收口 imported INTERNAL_REVIEW 的完整DB形状约束与结构化secret leak检测。前向迁移72，1–71字节不变；真实历史引用不建立假FK。rebuild与DB校验对齐，TALENT_CONSENT原合同回归通过。原OTP浏览器和Agent摄取复用统一helper；合法UUID/hash/时间/计数不因OTP子串碰撞失败，正文和真实Bearer/receive token、authorization及签名URL仍严格检查，失败不输出秘密。

本地Core689/689，PG80个程序/170项/0失败（14.19），空库1→72、保留71→72及真实pg_dump/restore通过；原12组Browser+新ingestion13/13，真实receive token接入后4条媒体旅程复跑通过。最终PG16/14项CI仅认本轮最终head，回填PR描述和交付回复；首次36926840575 attempt1及旧交付说明保留。详见 [finalization说明](PR04A_FINALIZATION.md)。待本轮代码级复核后正式确认PR-04A FROZEN；PR #32 Draft、未合并、未部署，PR #31不修改，不进入PR-04B。所有生产门NOT_RUN，DEPLOYED=false。

以下保留上一轮交付与历史状态。

# PR-04A：外部 Agent 主体与文字摄取

日期：2026-10-02。状态：**IMPLEMENTED + CORE_MEMORY_TESTED + POSTGRES_TESTED + BROWSER_TESTED；Draft、未合并、未部署，待代码级复核**。开发分支 `codex/external-agent-ingestion-pr04a`，stacked base 为 PR #31 的 `codex/talent-experience-pr03`。冻结 PR-03 SHA `aeaf49da7d5346785adac6df4e2d34321f9d92d2`、冻结设计 SHA `7017d5ef9583b0fd6f7a19521a7faa0f43ce7252`。本轮不改变 PR #31 head，不宣称 PR-04 开发冻结。

## 交付路径

真实 ServicePrincipal Bearer → schema / dictionaries → MACHINE 服务器草稿 → 文字、职业、基础资料和量尺候选 → 冻结提交 → 真实内部 Chrome 审核 → 明确 CREATE_NEW / LINK_EXISTING → 同事务建立 Source、SourceAttribution、INTERNAL_REVIEW basis、Person / Role / facts / Evidence → 原人才目录及主详情。

Agent 不预建 Person，不取得候选目标档案的读取权。采纳是内部使用依据，不代表证件核验、成年认定或本人同意。未知量尺日期保持 `measuredOn=null + datePrecision=UNKNOWN`。

## 模型与前向迁移

| 编号 | 目录 | 内容 |
|---|---|---|
| 69 | `202610020001_agent_ingestion` | ServicePrincipal.authorizationEpoch；共享 TalentSubmission 的 TALENT / MACHINE 分支；候选目标与冻结基线；typed SourceAttribution / SourceUseBasis；XOR、workspace 复合 FK、外部键唯一、主体与冻结内容不可变、真实终态审核依据门禁 |
| 70 | `202610020002_ingestion_permission_boundary` | 保留旧 TD2 凭证族，另允许窄 ingestion 凭证族；数据库拒绝混合族、空权限和超长组合 |
| 71 | `202610020003_ingestion_declaration_retention` | 来源声明与条目按同事务终态 TTL 单向清理；不允许把已清理的原文复活；保留机器归因和冻结目标历史 |

迁移 1–68 与冻结 aeaf49da 逐文件字节一致。69/70 实跑后发现的增量均向前追加，没有回写已应用迁移。空库安装到 71、保留数据 68→71 均实测。PrismaStore 是正式入口，MemoryStore 只用于 Core。

共享 Submission：TALENT 保持 TalentAccount + Consent / Claim / Grant 原合同；MACHINE 的 talentAccountId / consentId / claimId / grantId 全空，servicePrincipalId 非空。`(workspaceId, servicePrincipalId, externalSubmissionKey)` 唯一，principalKind、owner、原 intake 快照创建后不可切换。未审核 personId 一律为空；proposedPersonId 只是建议 UUID，不能通过它获取正式 Person 权限。

## 授权、目标和审核原子性

Submission 冻结 ServicePrincipal ID / authorizationEpoch / recoveryEpoch / intake scope revision / maintainer。读写、submit、review、回执重放都复查当前主体、期限、恢复隔离、责任员工有效性、权限上限及 scope。纯 token / keyVersion rotate 不改变授权 epoch；permissionCodes、scope、defaultMaintainer、停用 / 撤销、有效期或恢复边界变化必须递增。既有 ServicePrincipal 初始 epoch=1；数据库触发器与 MemoryStore 使用相同边界。

NEW：submit 前不生成 Person；reviewer 明确 CREATE_NEW + 自己可访问的 formalScopeId。最小建档采纳姓名、别名、简介和一个职业，相关条目按依赖组整组处理。

EXISTING：submit 冻结精确 Person、revision、protectionEpoch、scope/revision、merge/delete 和相关 Role/Profile/Casting/Measurement、FieldEvidence及全部支持Source基线。reviewer 只能明确 LINK_EXISTING 同一目标，不跟随 alias/canonical；基线、来源可用性或删除/合并变化返回 TARGET_REBASE_REQUIRED。由原机器在当前合法权限下显式 fork、新外部键、重新提交；不能在旧提交上改目标。恢复隔离和已清理草稿不能借 fork 复活。

LINK reviewer 同时有 intake 与目标 formal scope；CREATE_NEW 正式 scope 由 reviewer 选择，Agent 输入该字段被 strict schema 拒绝。正式 Source 与 Person/事实使用 formal scope，Submission 保留 intake provenance。正式投影使用当前 Person/Source/Evidence，不额外要求历史 intake scope；授权变化阻断旧摄取操作，不把已采纳事实伪装成仍属于 Agent 的写权限。

一次审核在同事务完成：重查主体、目标和 reviewer → 正式 Source + 历史 → Attribution + Basis → Person / Role / facts + 字段 Evidence → 条目 APPLIED/REJECTED（appliedId分别引用实际Person、PersonRole、TalentProfile、MeasurementSet）→ 根终态、回执与审计。真实 PostgreSQL 注入审核 Audit 失败时全部回滚。

## typed SourceUseBasis

- TALENT_CONSENT：真实 consentId，consentRevision>0；INTERNAL_REVIEW 专用字段全空，旧本人路径保持原行为。
- INTERNAL_REVIEW：consentId / consentRevision 空；真实 MACHINE Submission / SourceAttribution / ServicePrincipal / reviewer，非空内部 reviewBasis、fieldScope、明确一年内 validUntil。DB XOR/CHECK、复合 FK 与延迟约束要求真实已完成审核，拒绝 revision=0、假 Consent、缺 reviewer、缺依据和混填。

SourceAttribution 分别保留 MACHINE 提供者与 INTERNAL reviewer。后续本人维护仍需真实 TalentConsent，不继承 MACHINE basis。Source 当前性、撤回、过期、删除、字段 Evidence、export/rebuild 和完整性检查识别两种 basis。

## 权限与 API

窄凭证仅含 `ingestion.schema.read`、`ingestion.submit`、`ingestion.read.own`、`ingestion.withdraw.own`。不与旧 talent.fact.write / 正式写 / 审核 / 删除 / 合并权限混合；旧 TD2 MACHINE 合同继续回归。内部通过既有 ServicePrincipal 管理 API 创建、rotate、更新授权和 revoke，本轮没有新增机器媒体入口。

输入 schemaVersion=`once-talent-experience-v1`；摄取合同版本=`once-agent-ingestion-v1`，结构化字段复用 TD2 2.1。条目为 IDENTITY_TEXT、ROLE、PROFILE、MEASUREMENT，最多 50；稳定 clientItemKey，批量 upsert，依赖及重复代码校验，unknown fields reject。schema / 字典不返回正式档案 DTO。

| 主体 | 路径（前缀 `/api/v1`） |
|---|---|
| MACHINE only | GET `/ingestion/schema`、`/ingestion/dictionaries` |
| MACHINE only | POST `/ingestion/submissions`；GET `/ingestion/submissions/{id}` |
| MACHINE only | POST `/ingestion/submissions/{id}/items`、`validate`、`submit`、`withdraw`、`fork` |
| INTERNAL + talent.review / intake scope | GET `/ingestion-review/submissions`、`/{id}`；POST `/{id}/review` |

MACHINE 只用真实 Bearer，Cookie 不回退，Bearer+Cookie 拒绝。A 不可读写 B 的提交，机器不能进内部审核或 Portal。内部写保持 Origin / CSRF / 当前 Membership。普通 receipt/audit 的 MACHINE actorId=null、servicePrincipalId 正确；继续复用 Commands / writeAhead / replay-policy，以稳定机器主体 + operation + commandKey 为作用域。原键原摘要重放，异摘要 409；终态审核新键返回 SUBMISSION_CLOSED，不产生第二份成功审计/回执。

## 内部审核 UI 与页面证据

既有“审核收件箱”在功能开启时显示真实 Agent 投稿。页面提供材料提供者、来源声明、候选字段、NEW/EXISTING、可见目标、基线 / rebase、依赖、采纳选择、明确 formal scope、内部依据和截止日期。主界面不以 UUID/hash/epoch 代替业务资料。

真实 Chrome 截图：[审核页](../../artifacts/agent-ingestion-pr04a/01-candidate-review.png)、[正式人才主详情](../../artifacts/agent-ingestion-pr04a/02-formal-person.png)。本轮候选和正式资料都是合成验收数据。视频、浏览器断言、数据库约束和恢复证据见 `artifacts/agent-ingestion-pr04a/`。

## 实测结果与验收对应

| 检查 | 真实结果 / 边界 |
|---|---|
| Core / MemoryStore | 全量 685/685；含新 ingestion 聚合场景，既有 Talent、TD2 MACHINE 全部回归 |
| Typecheck / 生成合同 / 静态门禁 / 构建 | `pnpm verify`；transport typecheck / Prisma validate 单独执行 |
| PostgreSQL 全量 | 79 个测试程序，169 项，0 失败；本地 PostgreSQL 14.19，不标记为 PG16 |
| 新 PG 专项 | 真实并发外部键、FK/XOR/不可变/epoch、审计故障、原键重放/新键 closed、Source撤回、JSON重建、pg_dump/restore、恢复隔离、原文单向清理；见 [postgres.json](../../artifacts/agent-ingestion-pr04a/postgres.json) |
| 68→71 保留库 | 原 TALENT 账号/claim/grant/submission/item/consent/attribution/basis 和旧 TD2 principal 的旧列逐项不变，epoch 仅回填1；见 [upgrade.json](../../artifacts/agent-ingestion-pr04a/upgrade.json) |
| 本地 Browser | 新 Nest + 真 Bearer + 内部 Chrome 完整审核旅程通过；原 TalentMaintenance（360/390/430）、TalentDirectory、media / media-staging / media-purge 回归通过 |
| CI | 新增独立 ingestion 浏览器 job；完整 14 jobs，含 PostgreSQL 16、原12组 Browser + 新 ingestion。最终结论只认本 PR 最终 head 的 Actions，不沿用 PR31 冻结 CI |

对应冻结设计：I01身份、I02旧新权限边界、I03 scope/owner、I04幂等并发、I05未知事实、I07依赖审核的文字部分；I13 proposed目标未绑定、I14 merge/delete/revision rebase、I15真实INTERNAL_REVIEW、I16假Consent拒绝、I17 rotate继续、I18授权变化失效、I21机器不可指定正式scope、I22新Person明确正式scope。I19/I20媒体正式授权及I06/I08/I09/I10媒体/Collection/Work本人接手留在后续包，不将文字路径冒称完整媒体验收。

补充反例：字段证据来自 Source B、事实本身仍主来源 A；B 撤回而 Person/事实 revision 不变时，审核仍必须 TARGET_REBASE_REQUIRED。初始实现漏掉这条支持来源，Core 真实复现为错误 200；已补冻结字段证据及其来源，Core/PG均拒绝 409，无新迁移。

结构化条目采用真实事实记录ID作为appliedId，身份文字使用Person ID；Core/PG与真实Nest/Chrome审核数据库断言覆盖，避免把职业或量尺结果误记为Person ID。无需新增字段/迁移。

首 head a79edae 的 CI36919823171有13项通过，media-purge因依赖安装触及30分钟job上限取消，Browser未执行；本地该旅程实跑通过。仅把该job预算改为45分钟，测试命令、断言及测试自身超时不变。最终新head仍完整重跑14项，不沿用旧head结果。

本地测试记录汇总及源码摘要见 [verification.json](../../artifacts/agent-ingestion-pr04a/verification.json)。最终 SHA / exact-head CI run 回填对应 Draft PR 描述和交付回复，避免把本地记录作为远端最终检查。

## 生命周期与后续

普通业务 JSON 不含 MACHINE 草稿、ServicePrincipal 凭证、账号/Grant 或原始 reviewer依据。已采纳正式事实保留安全 `internal-review-basis-v1` 来源历史及 Evidence；JSON 重建不重建运行授权。真实备份包含必要归因，restore 后执行恢复隔离，旧 principal 撤销、旧草稿失效，正式 provenance 不丢。

Person 删除覆盖绑定/建议目标的机器条目与原文；merge 不把待审建议自动转给主档；恢复不复活旧机器权限。终态到期同事务清理条目及来源声明，已清理材料不能 fork 复活，完整性检查覆盖根/归因/basis。

`AGENT_INGESTION_ENABLED=false` 默认关闭正式外部入口，严格配置校验；测试明确开启。保持：

```
PROVIDER_VERIFIED=NOT_RUN
COS_PROVIDER_VERIFIED=NOT_RUN
MOBILE_DEVICE_VERIFIED=NOT_RUN
PRODUCTION_MIGRATION_VERIFIED=NOT_RUN
DEPLOYED=false
```

后续 PR-04B 真实图片/PDF/H.264媒体摄取、PR-04C Collection/Work、PR-04D本人接手总闭环均未开始。MCP/Skill、任意URL抓取、OCR/PDF解析、自动merge及商业模块未实现。本轮交代码级复核后停止，保持 Draft，不合并、不部署。
