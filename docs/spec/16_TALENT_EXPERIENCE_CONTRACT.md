## PR-03E finalization：删除权与保留配置

显式删除取得finalization lease与接管可撤销MediaPurgeIntent在同一事务：有效TTL lease及DELETE_PENDING/UNKNOWN/CONFIRMED必须等待；无有效lease的ELIGIBLE/CLAIMED终结为SKIPPED，原因EXPLICIT_DELETION_TAKEOVER。TTL在创建计划前检查显式删除归属，ERASED不允许可重试计划；恢复完整性检查同步检查。显式finalizer每10秒续租30秒lease，物理I/O前后核对租约，续租失败不得确认或继续下一个对象。原件物理调用仍在事务外。

本人上传沿用统一mediaRetention.draft配置续期并同步PersonMedia，不使用固定90天。迁移1–68冻结，本次无schema/迁移变化。

## PR-03E 执行补充（2026-10-01）

spec/15 §10.8冻结保留语义已接入独立MediaPurgeIntent；技术READY与业务STAGED/ADOPTED/RETIRED不混用。正式依赖、审核竞争、UNKNOWN、多对象/独占目录、容量、恢复隔离与删除优先合同详见 [PR03E_ACCEPTANCE](../release/PR03E_ACCEPTANCE.md)。迁移67新增清理计划，68前向补强JSON计划约束及不可变身份，1–66冻结。普通业务JSON不导出STAGED/清理计划，不扩Agent摄取或其他业务。

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

## PR-02b 已实现合同（2026-10-01，Draft 待复核）

本节接续已冻结 PR-02a。邀请/认领/grant、文本草稿/Submission、审核、来源和同意实际实现详见 [PR-02b 交付](../release/TALENT_EXPERIENCE_PR02.md) 顶部。前57次迁移冻结，新增58–61；保留原 Person/来源/媒体/作品/候选及机器接口语义，不实现PR-03。

- `once-talent-text-v1`：displayName、aliases、intro三个字段，最多3条；稳定 clientItemKey、依赖组和DAG、服务端字段摘要基线。保存不暗自更新基线，提交摘要冻结，整批一次决定，部分采纳后只fork未采纳项。UI将姓名/别名作为一组，简介为独立组。首次ENROLL明确采纳三项（后两项可为空），避免从旧隐藏档案复制补全。
- CLAIM7天/1次，ENROLL30天/默认100次，admission7天；产品常量集中 `TALENT_MAINTENANCE_LIMITS`，没有散落未校验env。草稿90天、已提交180天、已处理30天、撤回7天；活动文字草稿/提交每账号最多100个，创建和fork同门禁。过期镜像清理不擦除已采纳正式事实及合法依据。
- 所有绑定经过内部人工归属审核，指定identity匹配不能替代年龄/监护核实。批准前CLAIM无Person读权，ENROLL无Person占位；后续读取依赖当前账号+APPROVED Claim+ACTIVE Grant+Person，而非有效邀请。每个新增Portal业务GET与COMMAND均对照账号header，所有写入继续Origin/CSRF；身份失败不回退内部或机器主体。
- `selfExposureManifest`只保存字段、当前值摘要、来源及版本；返回前重新检查当前值/依据、用途期限和删除/合并保护。内部备注、来源原文、联系方式、报价及敏感生日不进入本人预填。自己提交的未到期草稿只能按本人查询用途查看。
- `internal-directory-2026-10-v1`明确365天、三个文字字段、内部目录/候选/受控业务导出；客户、公开和媒体均不包括。SourceUseBasis/SourceAttribution分离用途依据、本人材料提供者和实际审核员工。Source.internalUseUntil是数据库强约束的同事务用途投影，旧来源为null且保留原依据；撤回即时生效。匹配当前本人事实的FieldEvidence失效后不能退回旧来源冒充新值依据。
- 导出只传已采纳事实和必要历史依据；JSON重建的 importedBasis 不产生外部身份/账号/授权。物理恢复关闭旧grant及邀请，停用/删除/合并即时阻断旧关系；不把旧Grant自动挂到合并主档。所有新表进入原生命周期和恢复检查摘要。
- `/talent/*`与内部同源仅凭证分流，不声称浏览器脚本隔离。文本使用React转义，本地二维码、无第三方脚本或跟踪；沿用CSP、浏览器存储静态门禁。正式开放仍须真实Provider验证及单独上线审批。

当前状态：PR-02b IMPLEMENTED，交付证据与最终提交CI绑定PR #30；保持Draft待复核，未合并未部署，PROVIDER_VERIFIED=NOT_RUN。


## PR-02b finalization 审核终态与来源保护（2026-10-01）

终态APPROVED/PARTIALLY_APPROVED/REJECTED的审核命令，新键返回409 SUBMISSION_CLOSED；原键只能由原Commands层按principal/operation/commandKey/requestDigest重放，并保留当前资源读取鉴权，不在领域review中伪造幂等成功。相同键不同内容仍返回IDEMPOTENCY_KEY_CONFLICT。

未绑定ENROLL Submission全拒绝，同事务终结Claim、释放名额并记录内部决定人、时间及依据；无显式ownershipBasis时以本次Submission编号关联完整拒绝决定。已完成ENROLL之后的维护fork拒绝不改写原已批准Claim/Grant。普通JSON不携带被拒草稿或内部拒绝依据；实际恢复保留终态决定，不能复活reservation。

对于internalUseUntil非空的本人来源，普通source.update禁止携带textPayload（含空字符串），返回409 TALENT_BASIS_SCOPED；独立内部材料另建Source。请求schema及236条路由不变，迁移1–61不变，无新增数据库字段。本轮继续Draft待复核，未合并未部署。

## PR-03 启动切片：内部受控视频播放

PR-02已合并冻结，main `1a297d86ecfeac5d7a3c748322a867c9852a20c9` 的CI 36815702669九项通过；未部署，Provider未验证。PR-03独立分支先增加 `GET /api/v1/assets/{id}/playback`（BINARY，assets.read），无schema/迁移变化。继承内部原生scope/来源/人物/删除/恢复边界，两个短事务夹住事务外存储读取，首字节前审计失败拒绝。

Local/COS stat/openByteStream合同及200/206/416、取消、背压和流式额度按ADR-TE-04执行；当前只开放内部已批准素材，无Portal媒体或公开访问。新MP4限定H.264 yuv420p和AAC/无音频，PDF仍不解析。流每5秒尝试复查，绝对900秒上限可收紧。当前额度是单API进程边界，不宣称多副本全局限制或真实手机/COS验收。本人多来源、暂存归属、案例和回收生命周期仍属未完成范围，详见 [PR-03交付说明](../release/TALENT_EXPERIENCE_PR03.md)。

## PR-03 媒体归属与暂存底座合同（2026-10-01，Draft 待复核）

本节实现 spec/15 §10.2–10.8 的本轮底座，不改变冻结产品范围。迁移62追加 `PersonMedia`、真实 uploader、UploadContext 和独立 usageState；1–61逐文件不变。`INTERNAL_SOURCE` 保留旧创建参数并兼容显式 context；`TALENT_SUBMISSION` 的请求只接受 submissionId、可选 personRoleId、草稿 expectedSubmissionRevision 及新文件元数据，account/person/grant/scope 均由服务器推导。未知字段与已有 assetId 引用拒绝。`AGENT_SUBMISSION` 只保留判别联合和 ServicePrincipal FK 字段；数据库拒绝该分支，直到PR-04建立真实机器Submission及其FK，不开放机器入口。

`MediaAsset.sourceId`、hash、源字节和上传主体是不可改写的来源记录；本人上传的 sourceId 保持 null。正式采纳来源位于 PersonMedia.sourceId。普通 Asset DTO 的 sourceId/personId 表示当前正式业务关系，新增 originSourceId/personRoleId/relationId 明确区分原始来源；旧内部DTO保留旧值。返回前仍检查当前正式来源、关系Person/Role和原生scope。普通Asset/TD2/作品/候选/导出一律拒绝STAGED和RETIRED。

- 上传 → 接收 → complete → worker claim/lease/heartbeat/finish：复查真实主体、账号epoch、recoveryEpoch、当前Claim/Grant/Submission、DRAFT、媒体同意、人物/职业/范围版本、删除保护和存储资格。技术READY时原子生成STAGED关系和MEDIA条目；不建立假Source/Membership。
- DRAFT可上传/退休；提交前须全部处理完毕，MEDIA条目冻结。审核批准同事务创建正式Source、SourceAttribution/SourceUseBasis、PersonMedia ADOPTED；失败整体回滚。依赖组仍使用既有整批审核合同。媒体同意版本 `internal-directory-media-2026-10-v1` 为独立记录，包含media，不能借用旧文字同意。
- 本人预览/播放路径绑定URL内accountId，事务内对照实际Cookie账号；所有Portal写请求继续Origin/CSRF/账号header。审核专用路径另需talent.review、assets.read、申请接收scope与档案scope。Range/stream复用已复核播放实现，未增加播放器能力。
- PersonMedia包含业务state、revision/protectionEpoch、retainUntil/retiredAt/purgedAt。90/180/30/7天来自Submission保留状态；ADOPTED解除草稿TTL。DRAFT主动退休立即拒绝读取，但技术READY和占用额度保持到真实物理清理。自动暂存回收计划/通知/清理调度仍为下一切片，不借FAILED清理器删除READY文件。
- 个人2GB、ENROLL200MB；既有工作空间2GB与活动1GB配额保持。并发3/20、每小时100；`MEDIA_TALENT_BYTES / MEDIA_ENROLL_BYTES / MEDIA_WORKSPACE_BYTES / MEDIA_ACTIVE_BYTES / MEDIA_ACTOR_ACTIVE / MEDIA_WORKSPACE_ACTIVE / MEDIA_ACTOR_HOURLY` 集中校验，只允许收紧。旧部署不因新功能扩大额度；回收前占用不归还。
- JSON仅导出ADOPTED正式关系、依据及必要历史归因；重建不创建TalentAccount/Claim/Grant/Session。物理备份包含STAGED/ADOPTED，恢复准备保留usageState、隔离技术可读状态并使旧授权失效。Person删除纳入正式关系及暂存原件；Person合并只移动已ADOPTED正式关系，不转移本人STAGED材料，上传原归属保留，旧Grant撤销。若原上传精确绑定待迁移Role，预览以 `MEDIA_ROLE_DEPENDENCY_REQUIRES_REVIEW` 阻断，不能靠丢弃职业或改写原始归属完成合并。

当前尚无跨Submission复用Asset授权合同；fork仅复制文字，需要重新上传媒体。MediaCollection/模卡/素颜照/作品案例与媒体自动回收交互在本切片复核后继续；不进入客户分享、官网或PR-04。

## PR-03 正式媒体授权修正（2026-10-01）

ADOPTED 正式读取统一使用 PersonMedia 的当前 Person + 可选精确 PersonRole + 正式 Source + 当前用途/删除保护；Upload.scopeId 与 Claim/邀请 intake scope 是历史归因，不是正式读授权或附加门槛。关系、人物、来源、职业失效即时拒绝；预览/播放继续要求技术READY，Range每次请求沿用相同授权。直接Asset读/列表、TD2、作品/候选、导出与合并预览共用判断。没有显式正式关系的旧INTERNAL_SOURCE继续原有范围与主来源规则。

STAGED本人/审核路径保持既有账号、Submission/Upload intake scope和Grant/Claim关系要求；不能通过普通入口读。合并保留完整历史摘要，但只有当前邀请/申请/打开的Submission及任一根的STAGED材料继续要求接收范围，已终结的历史intake不额外限制正式媒体。精确Role迁移阻断、删除/恢复隔离不变。本修正不修改迁移62，不新增迁移、请求字段、路由或DTO。

## PR-03C 集合合同（2026-10-01，Draft待复核）

增量63复用现有Collection/Item/Tag，只增加独立coverAssetId、isCurrent和Tag ACTIVE/ARCHIVED。原workspace/Person/Role/Item FK保留，cover必须指本集合Item，current按Person+可空Role+类型唯一。1–62不改。

- `POST /td2/people/{id}/media-collections`：内部 `records.write` + `assets.read`，完整 ordered items、Person CAS、目标 Collection CAS、独立当前内部 Source CAS；禁止以本人期限来源承接新的员工材料。只接受 EXISTING_ADOPTED_ASSET_REFERENCE。
- `POST /portal/submissions/{id}/collections`：当前TalentAccount+Claim/Grant/Person+DRAFT+媒体使用同意，Submission CAS；替换本批COLLECTION方案，最多10个集合，每集合200项/8标签。unknown-fields reject保留；明确旧集合版本、职业、类型、封面、current、tag、ordered items。新文件只接受本批SUBMISSION_STAGED_ASSET，明确开放的正式文件可用EXISTING_ADOPTED_ASSET_REFERENCE跨提交复用；不复制文件，不改上传归因。
- `GET /portal/profiles/{id}/collections`：仅当前TalentAccount与有效Grant绑定的selfExposureManifest明确开放、版本摘要匹配且当前正式用途有效的素材/集合摘要；不开放全库搜索或Person内部资料。
- 受控PDF附件：内部`/assets/{id}/attachment`、审核`/talent-staged-assets/{id}/attachment`、本人`/portal/accounts/{accountId}/assets/{id}/attachment`，分别检查正式/暂存/当前账号授权；事务外读私有原件，返回前复查并写审计，不解析PDF、不生成公开URL。

MODEL_CARD图片/PDF、POLAROIDS图片、PORTFOLIO/OTHER图片/MP4、SHOWREEL/INTRO_VIDEO MP4。封面只能选本集合图片，与人物总封面独立。通用Person素材可放精确Role集合，精确Role素材不能借给另一Role或通用集合。审批准同事务采纳依赖媒体、正式来源/归因/同意依据、完整集合和审核回执；SUBMITTED不改写。Sources各自控制每个Item，集合本身Source失效才禁用整个集合。移出Item不删文件；旧内部来源原件的字节所有权不因新集合关系改变。完整JSON包仍要求所有必需证据可读，草稿永不入普通导出。

内容标签采用collection-tags-v1固定原8个code与ACTIVE状态目录；未知、停用或重复值拒绝新增；移除关系转ARCHIVED保留历史。本轮无标签管理或新业务菜单。PR03A/03B冻结，PR03C待复核；PR03D及后续未开始，三项外部验证保持NOT_RUN。


## PR-03C finalization 合同（2026-10-01，Draft待复核）

不新增或修改数据库结构，迁移1–63保持原样。以下修正取代“上传人即正式本人授权”的旧实现描述；STAGED接收范围不变。

- `POST /talent-grants/{id}/media-exposure`，`talent.grant.mediaExposure`，INTERNAL COMMAND，talent.review，并复查正式 Person/Source/Role 的当前范围与 assets.read。严格请求为 expectedRevision、decision=ALLOW/REVOKE、assets[{id,expectedRevision}]（最多200）、collections[{id,expectedRevision}]（最多50）、approvalBasis（4–2000字）；拒绝空选择、重复和未知字段。返回既有最小回执，复用 Commands、审计、write-ahead 与 talentGrant 回执重放策略。
- ALLOW 在当前 Grant 的 selfExposureManifest 写具体 mediaAsset/mediaCollection 版本、源版本、摘要及内部批准人/时间/依据。摘要绑定 grantId、account、Person/protection、authorizationEpoch 和正式实体内容。Collection 开放不自动开放全部 Item，素材分别批准。REVOKE 移除指定开放项；未批准、变更、过期或撤回立即拒绝当前本人读取和引用。
- 本人 Submission 的 MEDIA/COLLECTION 审核批准时，在同一事务为该账号当前 Grant 自动生成相应 exposure。归因仍保留原 uploader，不以 uploader 或 SourceAttribution 代替当前授权。内部和未来已采纳 Agent 来源使用相同开放合同；机器上传仍由迁移62约束拒绝，不开放 PR-04。
- Portal 原件/预览/MP4 Range、集合列表、已有素材引用、修改已有集合均使用该规则。新版本未获开放不能借旧草稿镜像读正式内容。JSON业务导出/重建不带 Grant/manifest；物理恢复保留证据后隔离清空 exposure、撤销旧 Grant，不能恢复旧开放权限。
- `collectionTypeCode` 与 personRoleId 一样属于稳定 identity。已有集合换类型返回 `409 COLLECTION_IDENTITY_CONFLICT`（Portal draft、内部 save、generic patch）；字段建议也拒绝改类型。需要另一类型时新建集合。
- 每次 Collection 审核/保存的有效 Tag 都使用本次正式 Source，包含重新启用和再次确认。ARCHIVED 历史及 FieldEvidence 保留。generic Tag create/patch 和字段建议落地均推进父 Collection revision，因此旧 expectedCollectionRevision 必须冲突。
- 审核新的 current 时，只对旧 current 的取消检查旧来源 scope/删除保护，不要求旧 Source 仍 current；false 的 FieldEvidence 使用本次合法 Source。新 current 的来源仍须当前有效；不可见旧范围全事务拒绝。

## PR-03D：作品案例实施合同

基线7909fa2，PR-03A/B/C已冻结。此增量复用Work/WorkCredit/WorkAsset，Portfolio保持独立；无TalentWork/Project/CRM扩张。

- `POST /portal/submissions/{id}/works`：expectedRevision + works[0..10]；严格workPlanSchema，未知字段拒绝。模式CREATE_EXTERNAL_WORK/LINK_EXISTING_WORK，targetWorkId与expectedWorkRevision同有同无；已绑定必须精确PersonRole，ENROLL仅declaredRoleCode。标题/简介/时间精度/地点/行业/作品类型/品牌展示名/本人署名、明确cover及最多30项有序素材。
- `GET /portal/work-catalog`：当前人才账号可用的role/industry/workType代码与显示名，不含人物或企业记录。
- `GET /portal/profiles/{id}/works`：当前账号+Grant+Person，逐个workCredit exposure；返回明确Work事实、本人Credit、单独获准媒体。无全库查询或其他参与者。
- `GET /people/{id}/work-cases`：内部records.read及当前Person/Work/Credit/Asset来源和范围检查，主详情视觉卡片。
- `talent.submission.decide.workDecisions`：每个已采纳WORK必须唯一decision、targetWorkId/expectedWorkRevision、basis。与文字/媒体/集合继续共用原Commands事务与重放策略；本轮没有第二套审核或候选模型。
- 新EXTERNAL Work的公共事实来自正式审核Source，本人Credit独立Source，媒体保持PersonMedia来源、同Asset ID/hash/uploader。关联已有Work不写公共事实。相同标题不自动合并。
- LINK冻结Work事实摘要及本人Credit版本；reviewer确认当前Work revision后可容忍纯非依赖版本变化；依赖变化409。本人稿件不能静默覆盖公共事实。
- `selfExposureManifest.kind=workCredit, field=OWN_WORK_CASE`：绑定current Grant/Account/Person保护版本、Work明确事实及本人精确Credit。来源/角色/删除/恢复校验每次执行。媒体仍使用独立mediaAsset exposure，不能由Work关系扩大授权。
- caseDate精度UNKNOWN/YEAR/MONTH/DAY/APPROXIMATE；未知为null。原Work字段不足以结构化表达时间、地点、展示品牌，新增四列，不建宽泛WorkMetadata。
- WorkCredit personRoleId/sourceId为历史兼容可空，新人才案例同时非空；复合FK限定同workspace/person/roleCode。既有旧Credit继承Work来源。
- 前向迁移64–66详见发布说明。导出四字段逐项许可，新原件依赖去重；验证过的原件才能重建WorkAsset/cover。

### PR-03D finalization 合同修正

- LINK_EXISTING 不写任何 WorkAsset、不改 cover/公共事实；新媒体可独立采纳，不能由LINK挂入目标Work。已有同Person+Role exact Credit完全保留，不以本次Note/Source覆盖。
- `portal.submission.mediaConsent` 保持原请求形状，textVersion新增 `internal-directory-media-work-2026-10-v1`；旧媒体版本语义不变。新版本fieldScope明确含work，Work保存/提交/审核要求当前同意能力。
- workCredit exposure新增服务端consentId绑定，旧无Work同意的exposure fail-closed，须明确新同意+审核；禁止按uploader、原Source归因或其他Consent自动补权。
- `work.creditUpgrade`：POST /works/{id}/credits/upgrade；expectedRevision、creditId、expectedCreditRevision、personRoleId、expectedRoleRevision、sourceId、sourceRevision。INTERNAL + records.write + sources.review，精确同人同职业/来源/范围校验；已有exact拒绝；原ID/Note保留，升级不自动产生Talent exposure。
- Work依据导出为talent-basis-v2，work scope只允许新Work同意文本。v1继续读，但不能借旧媒体版本获得Work capability。迁移1–66冻结，不新增67。
