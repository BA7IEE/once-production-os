# PR-04D：同档接手与生命周期收口

基于用户冻结的 PR-04C `4e7593c9dbd06ef4355e2a928ebec0c8a1c72efb`，独立分支 `codex/external-agent-claim-handoff-pr04d`，stacked Draft PR #35。A `67f45a57801cdef9e419803139775e15dd329839`、B `379d06dbea9295d47dd7f998a90f76d5d885169a`、C 及迁移 1–74 保持冻结；不修改 PR #31–34 head。不合并、不部署，不开发 MCP / Skill。

本轮开发和本地验收闭环已完成；最终提交 SHA、17 项 exact-head CI URL 与结果以 PR #35 描述和交付回复为准，必须全部成功才声明 **PR-04 A–D DEVELOPMENT COMPLETE**。代码级冻结仍由用户复核确认，生产 Ready 不成立。各次历史失败保留，不借用 C 的 CI 36993113751。

## 同一 Person 的真实操作

真实 MACHINE Bearer 创建文字、model Role，上传真实 JPEG / H.264 MP4 / PDF，经异步 worker 得到 READY + STAGED；Portfolio / Showreel / 外部 Work 候选在 Chrome 内部审核后写既有正式模型。员工从该正式 Person 发 CLAIM 邀请，maxUses=1、默认 exposure 为空；TalentAccount 独立 OTP 登录、认领、内部确认、SELF Grant，整个流程始终是原 Person ID，不复制或自动合并。

同一人之后以新 Talent Submission 提供文字、新图片、更新既有 Portfolio identity、新外部案例；取得真实媒体 + Work TalentConsent 后再次审核，仍写原 Person，新增自己的 Source / Evidence / TALENT_CONSENT。原 MACHINE Attribution 与 INTERNAL_REVIEW basis 深比较不变，不换主体、不洗来源。

截图与数据库明细见 `artifacts/agent-handoff-pr04d/browser.json`、`02-claim-pending-390.png`、`03-exposure-approved-390.png`、`04-authorized-portal-390.png`、`05-talent-maintenance-submitted-390.png`（文件名以实际 artifact 为准）。页面刷新查库断言无第二 Person / Claim / Grant / exposure；390px 无横向溢出。这是 Browser viewport，物理手机仍 NOT_RUN。

## 模型与权限合同

无新实体、schema 或 Migration 75。PrismaStore / MemoryStore 复用 TalentInvitation、InvitationContext、TalentAccount、TalentClaim、TalentAccessGrant 和已有 selfExposureManifest。没有 AgentAccount、Handoff 表、Shadow Person、Agent Consent、第二套 Grant。

新增两个正式后台动作：

| 动作 | 合同 |
|---|---|
| `GET /api/v1/talent-handoff/people/{id}` | `talent.handoff.get`，INTERNAL + talent.review + records.read + 当前 Person 正式 scope；仅返回有权配置的候选摘要、版本、字段 digest 和状态 |
| `POST /api/v1/talent-grants/{id}/exposure` | `talent.grant.exposure`，Commands COMMAND，expectedRevision + ALLOW/REVOKE + fields/assets/collections/credits + approvalBasis；严格拒绝未知字段、重复或空选择；各对象 CAS，同事务业务/回执/审计/write-ahead |

字段开放仅复用原 displayName / aliases / intro 合同。资产、集合、exact Credit 使用当前 Grant + Person/Role/Source + typed basis + fieldScope + protection/recovery 和版本 digest；没有 token/uploader/intake 授权替代。Scope 隐藏则拒绝或不列出候选，ADMIN 无绕过。既有 `/media-exposure` 合同保持兼容；旧工作 Consent-bound exposure 仍要求同意 current。

新的“本人可见内容”面板放在人物主详情，通过可读名称逐项选择基础资料、照片/视频/附件、模卡/作品集、本人案例。显示未开放、已开放、来源或授权已失效、需要重新核对，要求明确批准依据；UUID / Source / Grant ID 只作服务器定位元数据，不需要用户手填。

历史 exact WorkCredit 的内部批准读 exposure 使用明确批准人、时间、依据，digest 绑定 Grant、账户、授权 epoch、人物保护、exact Credit、Work facts；不创建 Consent。它只允许 own case 投影，其他参与者 ID / Credit / Note 不返回。本人后续 Work 草稿、提交和审核仍必须取得当前 Work-capable TalentConsent；旧媒体 Consent 不能代替。

`requireExposureBasis` 统一复查当前 INTERNAL_DIRECTORY basis。TALENT_CONSENT 检查真实同意和正 revision；INTERNAL_REVIEW 检查真实内部审核或严格校验的 imported provenance。当前 basis 必须包含相应字段 / media / collection / work 能力。历史员工独立 Source 保持原政策。撤回或收窄 basis、Source revision/current、Role/Work/Credit 变化后，旧 manifest 不再放行；新 approval 也不能恢复无效资料。

Grant revoke 只终止人才访问；正式 Source / Asset / Collection / Work 不删除。新合法 Grant 的 manifest 默认空，不能继承旧开放项。Agent revoke / 授权变化只影响摄取控制面和未采纳材料，已合法 ADOPTED 内容仍依据独立正式 Source/basis；Talent 永远拿不到 Agent intake、STAGED、Submission、上传状态或 receive token。

## 生命周期与导出恢复

- merge：exact WorkRole 冲突阻断；实际允许的合并关闭旧 Grant，不把 SELF remap。待审 MACHINE proposed target 合并后 `TARGET_REBASE_REQUIRED`，personId 仍 null，不追 alias。
- deletion：人物 block 后 Portal、正式媒体、Collection/Work 以及旧摄取目标受保护；Source B 暂停只关闭 B 支持的内容，独立 Talent Source A 继续有效；Grant revoke 不删除正式对象。
- TTL / explicit deletion：复跑被冻结的共用物理生命周期。READY/STAGED 不冒充 FAILED，ADOPTED 不按草稿 TTL 删除；UNKNOWN 不还 quota，reversible takeover、irreversible wait、I/O heartbeat/fencing、一次 quota 释放、ERASED 无 retryable dangling intent 全部回归。
- 普通 JSON：导出混合 MACHINE / TALENT 合法正式来源，保留 INTERNAL_REVIEW / TALENT_CONSENT snapshot、人物职业集合案例关系和媒体 hash；排除 STAGED、authorizationEpoch、凭证、token 与认证模型。
- rebuild：真实文件 hash 校验、领域 rebuild 和 `pnpm rebuild:json` CHECK/APPLY 均跑过。保留正式 Person / Role / Collection / Work / Asset identity 和 exact Credit 关系；Credit 依原重建合同重建关系，不承诺原 Credit ID。无 ServicePrincipal / Account / Session / Claim / Grant / Submission / Invitation 重建，INTERNAL_REVIEW 仍非 Consent。
- PG16 真实 pg_dump/custom restore：保留 ADOPTED / STAGED、MACHINE / TALENT typed provenance。恢复 prepare 隔离旧 Bearer/session/邀请/Claim/SELF Grant，停掉 pending Machine / Talent draft/upload/lease；旧 worker finish 失败，旧授权不复活。没有改写 uploader、源字节或已采纳来源。
- integrity：快照覆盖 A–D，增加 Claim/Grant/Invitation/context 及 explicit exposure，核对 workspace / Person / exact Role / approved Claim 和引用关系。STAGED WorkAsset、orphan/cross-person 等结构错误阻断；历史 stale exposure 作为 `EXPOSURE_RECHECK_REQUIRED` 单列，复用实际 Portal 当前授权计算，不能成为可读权或恢复放行凭据。报告不输出正文或秘密。

## 新增反例与既有回归

新增 Core `agent-handoff.test.ts` 14 项，PG `agent-handoff.test.ts` 14 个隔离程序，包含主链路、混合导出恢复、12 类反例。真实 Browser 新增 `browser-agent-handoff.mjs`；不以 MemoryStore 造 READY 代替上传和 worker。

| 用户验收编号 | 实际覆盖 |
|---|---|
| 1–4 同档与真实主体 | Core/PG base、Browser 同一 Person / Grant / 新 Talent Submission 查库；全程零伪造 Consent |
| 5–11 默认关闭与开放 | Core/PG base；Browser 未开放 image/MP4/PDF 404、Collection/Work 空；批准后图片 naturalWidth、MP4 播放及 206 Range、PDF 原件、Collection/own exact Credit 可见 |
| 12 其他参与者 | Core/PG other-credit，共享 Work 另一 Person 的 ID 和 Note 不出本人投影 |
| 13–14 Source/basis 失效 | base / basis / basis-scope；已失效或无所需 fieldScope 的旧 exposure、重新开放均拒绝 |
| 15–17 撤权隔离 | machine-revoke / revoke；Agent 撤销保留正式读取，Grant 撤销只断本人权，新 Grant manifest 空；Browser 查正式四资产/两案例未删 |
| 18–23 本人维护 | base + Browser，新文字 / 图片 / Collection / Work 同 Person；真实 TALENT_CONSENT，新 Evidence，不改原 MACHINE 归因；无 Work Consent 拒绝，有同意正常 |
| 24–25 merge | merge + 既有 agent-media/structures PERSON/MERGE；exact Role 冲突、旧 pending target 不追 alias，旧 Grant 不转人 |
| 26–27 deletion/source | delete + base + 既有 agent-media delete、structures PERSON、media-staging/collections/work-cases 生命周期 |
| 28–29 purge | 全量 media-purge / deletion-finalization：单 owner、UNKNOWN/quota、长 I/O heartbeat、retryable intent 检查；真实 PG/Browser 回归 |
| 30–32 restore/rebuild | PG export-recovery，实际 pg_dump/restore、混合 JSON、真实 CLI，身份与授权不重建，typed basis 不变种 |
| 33–35 原子/幂等/并发 | rollback 在 audits/receipts 写后故障，全部回滚；base 原键重放；claim-race 两账号真实 PG 并发结果200/409、唯一 SELF |
| 36 secret guard | 结构化 OTP / session / invitation AUTH_SECRET / Bearer / receiveToken 及签名 URL / authorization 字段检测，UUID/hash 子串不误判；失败只报路径/类型，绝不输出秘密 |
| 37 浏览器 | 真实 Chrome390px、独立 Cookie / CSRF / account header、刷新无重复、无横向溢出；非物理手机验证 |

I01–I23 全量重跑映射：I01–I05/I13–I18/I21–I22 为 ingestion + imported-review-basis Core/PG；I03/I06/I08/I11/I17–I20 为 agent-media Core/PG/Browser；I07/I09/I14/I20 为 agent-structures Core/PG/Browser；I10 为本轮 handoff；I11/I12/I23 为旧生命周期与本轮混合导出/CLI/恢复。不是仅跑新增 D 测试，原 15 组 Browser 完整执行。

## 本轮实际验证

- Core：757/757，14 项新增 handoff；typecheck、contract/openAPI、build 和静态12项通过。
- PostgreSQL16：145个隔离程序 / 235项 / 235通过 / 0失败，首次各轮证据与最终全量日志分别保留。
- Browser：16/16 全部通过（原15组 + 新增D），原15组+本轮1组；真实 PostgreSQL / Chrome / Local Provider / 异步 worker，旧视频控制合同回归。
- migration：空库1→74、保留74→74 no-op，已存 Grant 和迁移 checksum 不变；1–74 Git 字节一致，无75。
- pg_dump/restore、实际 rebuild CLI、integrity 与 secret guard：通过；详见 `artifacts/agent-handoff-pr04d/verification.json` 和 `regression/`。
- 最终 CI：新 Draft PR35 head 的17项，URL与SHA回填PR描述及交付回复。成功前不借用任何旧 SHA 的绿灯。

首轮失败及后续修正不删除：MemoryStore 的旧 Consent 默认字段与 Prisma 默认不一致导致测试发现差异，按冻结默认语义兼容；测试夹具路径/现有严格请求字段、重建 Credit identity 断言及 Browser 网络/字段检查错误按实际合同修正，未削弱权限/安全断言。各轮通过和失败日志放本轮 artifacts；可能含认证屏幕的原始录屏仅保留本机私有目录，不纳入 Git，交付截图不含 OTP、token 或邀请链接。

## 停止点

最终17项 exact-head CI全部成功后可标 PR-04 A–D **DEVELOPMENT COMPLETE**，D仍待代码级复核确认冻结，Draft、未合并、未部署。没有剩余的本轮开发阻塞；实际供应商、COS、物理手机和生产迁移尚未验证，分别保留：

```ini
PROVIDER_VERIFIED=NOT_RUN
COS_PROVIDER_VERIFIED=NOT_RUN
MOBILE_DEVICE_VERIFIED=NOT_RUN
PRODUCTION_MIGRATION_VERIFIED=NOT_RUN
DEPLOYED=false
```

完成即停止，不进入 MCP / Skill 或新增功能。
