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
