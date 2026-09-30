# Talent Experience：首轮合同、ADR 与迁移计划

日期：2026-09-30。配套 [v1.1完整规范](15_TALENT_EXPERIENCE_V1_1.md)。本文件将拟实施合同与本次已实现切片分开；所有未实现项均不提供占位入口。

## 已合并合同（PR-01a）

`POST /api/v1/directory/talents`，`directory.talent.create`，COMMAND，HTTP 201。

严格正文：`schemaVersion=once-talent-experience-v1`、`displayName`、`kind=TALENT|CONTACT`；可选 `roleCodes`、成对 `sourceId/sourceRevision`。TALENT 未传 roleCodes 默认 model；显式空列表、重复/未知/停用职业拒绝。CONTACT 不接受职业。只新增草稿，不修改或合并已有人物；同名不是同一人的证明。

内部会话、精确 Origin/CSRF、records.write、当前成员身份绑定、Idempotency-Key 仍由正式入口校验。机器白名单不扩大。已有来源复查当前权限、scope、状态和 revision；无来源调用既有 TEMP_ORGANIZE 创建真实归因于当前成员的来源/历史及仅其可见的限定范围，沿用7天期限。

同一数据库事务创建 Person、TalentProfile、PersonRole 及对应字段依据，写回执和审计。返回现有最小回执，不返回来源全文。角色由既有 TD2 createFact 生成；每项递增人物 revision，回执为最后 revision。写前安全日志沿用正式 Application 入口。审计失败全部回滚，提交成功失去响应则原键重放；重放重新检查当前人物、来源和权限。来源失效返回不可用，不凭回执重新创建人物。

UI 只有“新增人才”入口，默认模特，支持多职业与次级普通联系人分支；可选已有来源。姓名和提示之外无强制假填。结果未知时冻结正文、关闭/取消入口并显式核对原提交。既有专业工作台、普通联系人同档升级与兼容API保留。PR-01b 的照片目录、组合筛选和主详情及生命周期合同见 [本轮交付](../release/TALENT_EXPERIENCE_PR01B.md)。

## ADR-TE-01：四类真实主体

保留内部 Membership 与 ServicePrincipal；新增 TalentAccount 和 share 内稳定 CastingRecipient，均不成为内部成员。扩展既有 command/audit 的 principalKind 与有FK的主体分支，不建立简化第二套回执。COMMAND 四分支 XOR、按 workspace/principal/operation/key 唯一；SYSTEM 仅真实系统审计。writeAhead、HTTP、worker、恢复与归因使用相同稳定身份元组。旧历史按真实 actor/servicePrincipal 回填，不改归属。

## ADR-TE-02：投稿与同档认领

草稿保存服务器，未绑定者关联自有 ENROLL 申请和名额；定向邀请要渠道匹配或人工确认。ACTIVE SELF 对 Person 和 Account 双向唯一；监护/代管逐人独立批准。提交冻结摘要，依赖组原子采纳，一次审核终结；撤回/终态后 fork。逐目标基线决定冲突，不因无关报价变化拒绝案例。认可的新事实写现有专业链，不复制主人才库。审核人和提供人分开归因。

## ADR-TE-03：用途与投影

Consent、SourceUseBasis 和 DisplayPermission 分开；统一可用性判定接入新旧消费者，同意撤回不等待定时任务。本人预填按 selfExposureManifest，不因认领即可读内部来源。内部、本人、客户、官网 DTO 从允许字段构造。价格/排序/facet 同样鉴权；含敏感条件采用 POST READ 和服务器 SavedView，不进 URL、日志或浏览器存储。

## ADR-TE-04：媒体多来源和播放

INTERNAL_SOURCE、TALENT_SUBMISSION、AGENT_SUBMISSION 显式上下文；真实 uploader 分支贯穿worker和回执。技术READY与STAGED/ADOPTED/RETIRED分开；多来源同人/同角色关系取代主来源相等，而非删除权限判断。READY未采纳素材有独立回收计划，物理确认后释放配额。

增加不可变对象 stat/openByteStream，范围有界、背压、取消；网络外短事务鉴权和首字节前复查。无Range 200、单Range 206/416、多Range忽略为有界200。PDF只附件，MP4须H.264/AAC真实兼容验收。精确字节人工展示审批覆盖图像、PDF、字幕和声音，衍生副本继承原件/许可依赖。

## ADR-TE-05：外部入口与恢复

初期同精确Origin分路径，独立Cookie/预认证上下文/CSRF，显式contextId防多标签错绑。Cookie Path只分流，不保证脚本隔离；同源XSS仍可能影响员工会话，所有文本转义、禁任意HTML/SVG/PDF同源执行、无第三方脚本、严格CSP；不能达到时改独立Origin再开放。路径按完整段分流，不把casting-shares误送客户处理器，不尝试认证失败后的身份回退。恢复隔离使旧外部会话、邀请、分享和验证码无效，不补发旧消息。

## 分阶段前向迁移

| 子包 | 数据变更与强约束 | 保留/升级验证 | 生命周期前置 |
|---|---|---|---|
| PR-01a 本次 | 无 schema/迁移；组合既有表 | main的54次迁移和所有实体ID保持；PG同键竞争/回滚 | 沿用既有Person/TD2来源/导出/删除/恢复链，无新增实体 |
| PR-01b | TD2 2.1：以现有 talentProfiles/personRoles 承载 Demographics/ModelProfile/角色标签，封面 Asset 引用、measuredOn nullable/UNKNOWN/reportedAt | 不伪填旧日期；角色FK/字典、生日受限投影；旧2.0严格适配 | 同步字段依据/OWNER_KEYS、查询、转移、删除、恢复 |
| PR-02a | account/identity/session/challenge/delivery、principal分支/索引/FK/XOR | 历史内部/机器回执原键重放；账号身份keyed hash唯一 | safety intent、replay、审计、账号停用、恢复不补发 |
| PR-02b | invitation/claim/grant、submission/item、consent/source attribution/use basis | SELF双向唯一、名额原子预留、提交终态、关系原子采纳 | grant撤回、所有旧消费者用途即时失效、self manifest |
| PR-03 | uploader/暂存归属、同人角色媒体、WorkMetadata、回收计划/配额 | 已有媒体source/hash/objectRef不改；真实异步worker | 草稿READY清理、依赖/共享原件、播放和首字节撤权 |
| PR-04 | 受限机器摄取唯一键/状态及上传上下文 | 旧机器白名单语义保留；新增仅自己摄取范围 | 无审核/全库媒体/公开/删除权限 |
| PR-05 | rate/availability/saved view与独立成本权限 | 金额整数、币种单位不混筛、区间及时区 | 价格读取含条件权限、历史、导出/恢复 |
| PR-06 | 候选PERSON_ROLE_V1、多Work/collection分支；share/version/entry/recipient/session/access/feedback/display | 旧候选ID/顺序/备注保留为LEGACY，显式归并；素材CHECK/FK、稳定反馈唯一 | 固定值/依据版本与当前用途、媒体字节审批、撤回/删除/恢复 |
| PR-07 | publication/outbox、独立公开投影/回执 | 实际CMS接口核对后追加；不虚构端点 | OS先停供；真实下架失败待处理；不复活旧发布任务 |

仅追加迁移；每个包都验证有数据旧库升级、空库安装、原ID/源/关系摘要、PG并发/回滚/重放、JSON重建和真实备份恢复。前端回滚不得使旧代码接纳新主体凭证；出现新增事实不能回退为无数据旧schema。本次不运行生产迁移。

## 配置映射计划（未实现者不读 env）

现有7天临时整理为 `LIMITS.temporaryMs`；现有内部会话/媒体/资源限额保持原代码。本次无新增运行env。下面变量为拟实现名称，需在相应包纳入统一config校验和.env.example，允许收紧，禁止用户改配额或Infinity。

| 拟配置组/变量 | 默认及语义 | 实施包 |
|---|---|---|
| TALENT_PORTAL_ENABLED / CASTING_ENABLED / TALENT_PUBLICATION_ENABLED | false/false/false；分别阶段门，不替代恢复闸门 | 02/06/07 |
| TALENT_SESSION_IDLE_DAYS / ABSOLUTE_DAYS | 7/30，每请求查epoch；Cookie期限不得更长 | 02 |
| TALENT_CONTEXT_TTL_MINUTES / MAX_CONTEXTS | 15/5，显式contextId绑定浏览器 | 02 |
| TALENT_OTP_TTL_MINUTES / MAX_ATTEMPTS / RESEND_SECONDS | 10/5/60；换发使旧challenge失效 | 02 |
| TALENT_OTP_IDENTITY_HOURLY / DAILY / IP_HOURLY / WORKSPACE_DAILY | 5/10/20/200；UNKNOWN不盲发、不得刷掉累计限制 | 02 |
| TALENT_CLAIM_DAYS / ENROLL_DAYS / ENROLL_USES / ADMISSION_DAYS | 7/30/100/7；不超过邀请期限，used+reserved不超限 | 02 |
| TALENT_INTERNAL_USE_MONTHS | 12（可缩短）；必须与同意文本一致，不静默续期 | 02 |
| TALENT_ENROLL_BYTES / ACTIVE_DRAFTS / PERSON_BYTES | 200000000/5/2000000000；真实主体预算 | 03 |
| MEDIA_WORKSPACE_BYTES / STAGING_BYTES / ACTOR_CONCURRENT / WORKSPACE_CONCURRENT | 旧部署保持原配额；新部署20000000000/1000000000/3/20 | 03 |
| TALENT_SUBMISSION_MAX_ITEMS / COLLECTION_MAX_FILES | 100/100；JSON保持1MB；大批分可追踪小批 | 02/03 |
| TALENT_DRAFT_DAYS / SUBMITTED_DAYS / REJECTED_DAYS / WITHDRAWN_DAYS | 90/180/30/7；新合法引用或ADOPTED不因旧TTL销毁 | 03 |
| TALENT_AVAILABILITY_FRESH_DAYS / BUSINESS_TIMEZONE | 30/Asia-Shanghai IANA值 Asia/Shanghai；有效UNAVAILABLE不自动过期 | 05 |
| CASTING_DAYS / MAX_ENTRIES / MAX_MEDIA / FEEDBACK_TEXT / FEEDBACK_PER_MINUTE | 7/100/12/1000/30，逐recipient限制 | 06 |
| MEDIA_PLAY_ACTOR_STREAMS / WORKSPACE_STREAMS / MAX_SECONDS / BUFFER_BYTES | 2/10/900/8000000；背压/取消，不全文件Buffer | 03/06 |
| 独立会话/挑战/身份hash/消息密钥、邮件短信provider与凭证/发送人/模板/预算 | 无默认secret/provider；未配置不发送，PROVIDER_NOT_VERIFIED | 02 |

价格、身份、秘密查询不写普通日志；配置校验错误不得输出secret。声明时间取服务器真实接收，测量日期未知则UNKNOWN，不写今日伪日期。

## PR-01b finalization · 查询与导航合同（2026-10-01）

`POST /directory/talents/search` 返回 `queryVersion=once-talent-directory-query-v1.1`，TD2 读事实仍为 2.1。role、gender、nationality、market、experience、style、service、location、language、industryCode、workTypeCode 接受旧字符串或 1–20 个值的数组；重复值、未知/停用字典代码、非法枚举及未知字段均拒绝。正常 UI 只发送数组。数组内 OR，维度间 AND；角色业务条件与作品职业绑定，同一 WorkCredit/Work 满足行业与作品类型。前端只请求一次，内存参考、Prisma SQL 初筛、最终权限匹配、候选查询共用语义。

十一维 facet 对当前维度去除全部已选值，保留其他条件，对每个选项计算可见的唯一 Person 数；多职业、多标签、多作品不重复计人。响应包含 roles/genders/nationalities/markets/experiences/styles/services/locations/languages/industries/workTypes，全部在 UI 展示计数。

产品配置 `DIRECTORY_AGE_PRESETS` / `age-presets-v1` 统一采用儿童 0–17、18–24、25–34、35–49、50–130，加自定义范围。此处按本轮确认的年龄快捷入口细化原规范的建议分组，名称仅为查询预设，不写人物分类。最终发送 ageMin/ageMax；YEAR_ONLY、DECLARED_RANGE 保留整个可能区间，UNKNOWN 不进入任何明确区间，不影响成年资格。

`history.state` 仅保存白名单查询草稿/已应用条件、页码、surface、Person ID + nullable PersonRole ID 和明确职业选择；不保存 DTO、联系方式、来源正文、明文生日、价格、备注或任何认证凭证。`GET /me.directoryStateScope` 是当前身份会话的不可用于认证的导航命名空间摘要；状态同时绑定 membershipId。退出、401、身份变化或同账号新会话均清除当前条目或拒绝历史条目；其他历史条目再返回时复核绑定。每次恢复重新请求当前权限数据。localStorage/sessionStorage 门禁不变。

候选保存 `{personId,personRoleId}`。普通联系人明确 null；仅一个有效职业可直接绑定，多职业必须显式选择，查询只允许满足当前职业/业务/作品条件的 matchingRoleIds。两个职业可分别选择同一人，进入既有 Shortlist 时复查当前职业版本和署名作品，不建立第二套候选模型。

本轮无数据库 schema 变化或新迁移，既有第 55 次迁移冻结。PR #29 保持 Draft；PR-02 及邀请、认领、门户、多来源上传、分享、官网发布未启动。

## PR-02a 已实现合同（2026-10-01，Draft 待复核）

本轮仅 INTERNAL/MACHINE/TALENT 三个 COMMAND 主体；CASTING 尚未实现，不预建外部分享入口。SYSTEM 仅审计。既有 Actor 保留，TalentActor 不含 membershipId/userId；统一 CommandPrincipal 只用于回执、审计及写前归因，人才认证由独立 Portal 处理器执行。实际路由、身份规范化、发送状态、配置及生命周期详见 [PR-02a 交付](../release/TALENT_EXPERIENCE_PR02.md)。

身份规则固定 `talent-identity-v1`：邮箱仅 domain IDNA/lowercase，local-part 保留大小写/点号/加号；PHONE 显式 E.164，不推断区号。HMAC 独立key并绑定workspace/渠道；身份检索key与账号摘要不符时拒绝，不能恢复错key后复制账号。LOGIN 已开放实现，RECOVER 无恢复权限捷径。认证表不进入普通业务 JSON，实际备份恢复在 prepare/检查阶段阻断旧凭证。默认 Portal 关闭，真实Provider未验不等于生产可用。

新增第56/57次前向迁移，前55次不变。仅基础认证，不建立 Invitation/Claim/Grant/Submission/Consent，也无任何本人媒体、客户或公开接口。详细证据绑定 PR #30 最终提交，不以 PR-01 main CI 代替。
