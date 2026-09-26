# ONCE Production OS｜内部 API、权限与交互契约

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 SPEC_FROZEN，尚未实现

## 1. 接口面

所有业务路径相对 `/api/v1`。浏览器业务入口只允许内部成员会话；Talent R1 另允许受限 ServicePrincipal 通过独立机器凭证访问明确白名单路由。匿名仅登录/激活等认证动作；没有公开、客户分享或人才自助业务路由。健康检查由部署入口限制，不暴露内部配置。

四种角色模板ADMIN/EDITOR/REVIEWER/VIEWER。ADMIN是当前空间管理人，不是绕过用途检查的系统超级用户；敏感权限在配置里显式可见。角色与权限表只管理一期功能，不提供任意策略编程。

| 模板 | 默认能力 | 非默认能力 |
|---|---|---|
| ADMIN | 内部成员/配置/资料/审核/维护的已登记权限 | 无法绕过来源用途、文件隔离或计费未知规则 |
| EDITOR | 基本资料读写、来源整理、资产上传、作品/项目/清单编辑 | 联系原文读取/写入、原件下载、导出、AI、合并/删除需显式授权 |
| REVIEWER | 基本资料和必要来源读取、依据核验、用途许可/暂停 | 不自动获得全部联系人、配置和导出能力 |
| VIEWER | 获准基本资料、作品预览和内部清单读取 | 不可写、AI外送、下载原件或导出 |

`目标域write`由subjectRef确定：人物records.write、作品portfolio.write、项目projects.write；它不是任意客户端传入的权限字符串。人类原申请人须当前成员有效；ServicePrincipal 则须 status/scope/permission/credential 都有效。Machine Actor 的 defaultMaintainer 只是业务责任人，不替代真实 actor。

## 2. 字段、Cookie与请求

联系原文与受限内部备注单独DTO/权限；普通person详情不返回它们。sources.read不等于原件下载权；assets.original.read也不能越过来源用途。

服务端不透明Session，Host-only、Secure、HttpOnly Cookie；Origin精确白名单和写入CSRF保护；无通配CORS。口令/激活secret、签名URL、AI密钥不进请求日志或通用回执。登录、重置限流；停用/改权使旧会话失效。首次管理员只能由空库维护CLI创建。

普通读使用分页（12参数）及稳定排序，计数与联想同权限过滤。跨范围不存在/无权统一不透露对象。写Schema拒绝未知字段；workspaceId由服务端确定；字符串长度、数组数目、JSON大小均限定。

### 2.1 ServicePrincipal 机器认证

ServicePrincipal 使用独立不透明机器凭证，例如 `Authorization: Bearer <opaque>`；服务端只保存 hash/keyVersion，不与人类 Session/Cookie 混用。机器请求不依赖浏览器 CSRF，但必须走独立 rate limit、Origin 不作为授权依据、逐请求检查 scope/permission/status/expiry。

机器凭证只允许访问注册白名单。默认禁止 `members.manage`、`data.merge`、`data.delete`、用途批准、权限修改和生产运维等高危动作。revoke/rotate 后旧凭证下一请求立即失效。

所有 CommandReceipt/Audit/Job requester 保存真实 actor kind；Machine Actor 不得伪装成 defaultMaintainer。

## 3. 协议和错误

C=正式命令，A=命令接受后异步执行，Q=查询，QPOST=使用POST承载较大查询但无正式写入，R=敏感查询带审计，AUTH=一次性认证语义，SECRET=只返一次秘密，SIGN/ACCESS=按当前权限发临时访问而非重放旧URL。

正式命令要求Idempotency-Key和可变对象expectedRevision；查询不强行写命令回执。重放成功回执早于新命令CAS，详细唯一时序见09。不能对登录/激活盲套领域回执。

```json
{"operationId":"op_opaque","resourceId":"uuid","revision":4,"state":"ACCEPTED","replayed":false}
```

202只代表已接收，界面继续查job或资源；不是READY/SUCCEEDED。错误含稳定code、中文message、requestId及允许的修复提示，无SQL/栈/秘密。

400输入错误；401会话无效；403动作禁止；404无可访问对象；409旧版本/键冲突/终态不可再改；413输入大小超限；422用途不符或条件不可执行；429频率/上传准入限制。AI预算不足是明确业务码BUDGET_NOT_AVAILABLE；未知计费为AI_OUTCOME_UNKNOWN，不能指引用户点普通重试。

## 4. 内部操作清单

本表列每个方法的独立operationId；不存在“所有实体自动全CRUD”。详情中的关联数据也要按相同权限下推，不能靠前端隐藏。所有接口均待开发，并非当前已可调用。

| 方法 | 路径 | operationId | 权限 | 类别 | 关键契约 |
|---|---|---|---|---|---|
| POST | /auth/login | auth.login | 匿名限流 | AUTH | 用户名/口令；Origin+CSRF；安全Cookie，不回token |
| POST | /auth/activate | auth.activate | 一次性激活 | AUTH | 激活secret+新密码；消费CAS；无公开注册 |
| POST | /auth/logout | auth.logout | 当前会话 | AUTH | 撤当前会话，重复注销安全 |
| POST | /auth/change-password | auth.changePassword | 当前会话 | AUTH | 旧口令验证+新口令；旧会话按策略失效 |
| GET | /me | identity.me | 当前会话 | Q | 当前成员、权限和空间；无秘密 |
| GET | /memberships | member.list | members.manage | Q | 内部成员及权限摘要 |
| POST | /memberships | member.create | members.manage | SECRET | 建立账号/成员；激活secret仅一次返回，回执不存原值 |
| POST | /memberships/{id}/disable | member.disable | members.manage | C | expectedRevision；停用+epoch递增 |
| PATCH | /memberships/{id}/permissions | member.permissions | members.manage | C | 角色/敏感权限白名单；旧会话失效 |
| POST | /memberships/{id}/reset-access | member.resetAccess | members.manage | SECRET | 重新激活或重置；旧激活/会话失效；不直接设置已知公共密码 |
| GET | /catalog | catalog.list | records.read | Q | 注册namespace下的可见字典和别名 |
| POST | /catalog/items | catalog.create | catalog.manage | C | namespace/code/中英label，禁止客户端新增任意namespace |
| PATCH | /catalog/items/{id} | catalog.update | catalog.manage | C | expectedRevision；停用代替破坏引用 |
| GET | /sources | source.list | sources.read | Q | 来源范围过滤与待核验列表 |
| GET | /sources/{id} | source.get | sources.read | Q | 可读说明、依据状态、文件引用；敏感原件另校验 |
| POST | /sources | source.create | sources.write | C | 人工/文字来源及内部接收依据；允许无文件 |
| PATCH | /sources/{id} | source.update | sources.write | C | 正文/说明白名单+expectedRevision；不能顺便确认用途 |
| POST | /sources/{id}/review | source.review | sources.review | C | 明确内部依据/期限；expectedRevision；不自动批准AI/导出 |
| POST | /sources/{id}/suspend | source.suspend | sources.review | C | 原因+expectedRevision；protectionEpoch递增 |
| POST | /field-evidence | evidence.confirm | sources.review | C | 精确subject/field/source/版本；不接受AI充当reviewer |
| GET | /use-permissions | usePermission.list | sources.read | Q | 仅当前范围，按具体source/subject查询 |
| POST | /use-permissions | usePermission.create | sources.review | C | 额外用途、精确对象/字段/期限/条件；AI绑定配置 |
| POST | /use-permissions/{id}/revoke | usePermission.revoke | sources.review | C | expectedRevision；立即限制新使用 |
| POST | /use-restrictions | useRestriction.create | sources.review | C | 用途/主体/原因，明确禁止优先 |
| POST | /use-restrictions/{id}/resolve | useRestriction.resolve | sources.review | C | 处理依据+expectedRevision；不能当重新授权 |
| GET | /people | person.list | records.read | Q | Person/Talent边界；Role/Capability/Language/Location等结构化筛选；同范围total |
| GET | /people/{id} | person.get | records.read | Q | 明确字段白名单；不包含contacts原文 |
| POST | /people | person.create | records.write | C | 只建自然人Person；displayName/maintainer/originSource；不强制TalentProfile |
| PATCH | /people/{id} | person.update | records.write | C | expectedRevision；只改Person身份层字段；Role/Capability等走专用命令；scope单独受管理权限 |
| GET | /people/{id}/contacts | contact.get | sensitive.read | R | 字段/来源用途与范围复核，敏感读取审计 |
| PUT | /people/{id}/contacts | contact.replace | sensitive.write | C | 精确联系信息/来源+expectedRevision，不写普通日志 |
| PATCH | /records/{kind}/{id}/scope | record.scope | members.manage | C | kind有限枚举；scope成员同空间；保护版本递增 |
| GET | /organizations | organization.list | records.read | Q | 范围内列表及查询 |
| GET | /organizations/{id} | organization.get | records.read | Q | 当前可读主体详情 |
| POST | /organizations | organization.create | records.write | C | 名称/来源/关联主体，不建CRM流程 |
| PATCH | /organizations/{id} | organization.update | records.write | C | 允许字段+expectedRevision |
| GET | /brands | brand.list | records.read | Q | 范围内列表及查询 |
| GET | /brands/{id} | brand.get | records.read | Q | 当前可读主体详情 |
| POST | /brands | brand.create | records.write | C | 名称/来源/关联主体，不建CRM流程 |
| PATCH | /brands/{id} | brand.update | records.write | C | 允许字段+expectedRevision |
| POST | /people/{id}/talent-profile | talentProfile.create | records.write | C | 仅为已有Person启用Talent；expectedPersonRevision；一人0..1 |
| PATCH | /people/{id}/talent-profile | talentProfile.update | records.write | C | 内部摘要/状态白名单；不塞Role/Language/尺寸数组 |
| GET | /people/{id}/roles | personRole.list | records.read | Q | 当前/历史Role，按scope/source过滤 |
| POST | /people/{id}/roles | personRole.create | records.write | C | 已注册roleCode/source/validity；Person必须有TalentProfile |
| PATCH | /people/{id}/roles/{roleId} | personRole.update | records.write | C | status/validity+expectedRevision；不静默改roleCode |
| PUT | /people/{id}/capabilities | capability.set | records.write | C | 注册capabilityCode；personRoleId可空且须属于Person；未知code拒绝 |
| PUT | /people/{id}/languages | personLanguage.set | records.write | C | language+听说读写level可空+source；旧code迁移不猜级别 |
| PUT | /people/{id}/locations | talentLocation.set | records.write | C | BASE/SERVICE+location+validity+source；不把档期当location |
| POST | /people/{id}/external-refs | externalRef.create | records.write | C | provider/namespace或issuer/externalKey/source；exact唯一；不触发merge |
| POST | /people/{id}/casting-profile | castingProfile.upsert | records.write | C | hair/eyes/currentMeasurement引用；有来源；不是MODEL专属 |
| POST | /people/{id}/measurements | measurement.create | records.write | C | 时间快照+单位+size system；CONFIRMED历史不原地覆盖 |
| POST | /people/{id}/adult-eligibility | adultEligibility.record | sources.review | C | UNKNOWN/SELF_DECLARED/VERIFIED/RESTRICTED；不要求完整证件 |
| POST | /people/{id}/representations | representation.create | records.write | C | 可选personRole/agency/agent/territory/validity+source |
| POST | /people/{id}/credentials | credential.create | records.write | C | type/issuer/期限/来源；敏感编号加密并普通DTO掩码 |
| POST | /people/{id}/media-collections | mediaCollection.create | portfolio.write | C | type只表形式；可选personRole；source |
| PUT | /media-collections/{id}/tags | mediaCollection.tags | portfolio.write | C | 内容tag字典；FASHION/LINGERIE等不混入type |
| PUT | /media-collections/{id}/items | mediaCollection.items | portfolio.write | C | READY Asset有序引用；删除关系不删Asset |
| PUT | /people/{id}/translator/language-pairs | translator.languagePairs | records.write | C | TRANSLATOR role下方向明确；不从PersonLanguage猜 |
| PUT | /people/{id}/translator/service-modes | translator.serviceModes | records.write | C | 注册modeCode；TRANSLATOR role限定 |
| GET | /talent-schema | talentSchema.get | records.read或service-principal | Q | schemaVersion、Role/Capability/Field/enum/sensitivity/direct-write规则 |
| GET | /service-principals | servicePrincipal.list | members.manage | Q | 机器身份摘要，无credential原值 |
| POST | /service-principals | servicePrincipal.create | members.manage | SECRET | scope/permissions/defaultMaintainer；credential只返回一次 |
| POST | /service-principals/{id}/rotate | servicePrincipal.rotate | members.manage | SECRET | 旧credential立即失效；新secret一次返回 |
| POST | /service-principals/{id}/revoke | servicePrincipal.revoke | members.manage | C | expectedRevision；立即拒绝新机器请求 |
| POST | /field-proposals | fieldProposal.create | talent.propose或ai.use | C | typed target/注册field/source/baseRevision/schemaVersion；无自由JSON字段 |
| GET | /field-proposals/{id} | fieldProposal.get | 目标域read | Q | 当前可见差异/来源/STALE原因 |
| POST | /field-proposals/{id}/apply | fieldProposal.apply | 目标域write | C | 人类或获准actor；调用目标域命令，不直接改表 |
| POST | /field-proposals/{id}/reject | fieldProposal.reject | 目标域write | C | 终态，不修改事实 |
| POST | /uploads | upload.create | assets.upload | SIGN | sourceId/类型/大小；原子配额+会话；短时staging签名，不进回执 |
| GET | /uploads/{id} | upload.get | assets.upload | Q | 仅本人或有管理资格者，状态与失败原因 |
| POST | /uploads/{id}/renew | upload.renew | assets.upload | SIGN | 未结束、同主体、续签上限、同一预算预留 |
| POST | /uploads/{id}/complete | upload.complete | assets.upload | A | 返回同一处理jobId；不认客户端READY声明 |
| POST | /uploads/{id}/cancel | upload.cancel | assets.upload | C | 置取消并清理/释放；已封存安全对象按生命周期处理 |
| GET | /assets | asset.list | assets.read | Q | 可读元数据及可用预览引用，不自动发原件URL |
| GET | /assets/{id} | asset.get | assets.read | Q | 状态、来源、检查结果的可见部分 |
| POST | /assets/{id}/access | asset.access | assets.read | ACCESS | 用途+renditionId；若取原件还需assets.original.read；鉴权流或短签名 |
| POST | /assets/{id}/quarantine | asset.quarantine | sources.review | C | 原因+expectedRevision；立即阻止新取文件并失效依赖 |
| GET | /works | work.list | records.read | Q | 当前可见列表 |
| GET | /works/{id} | work.get | records.read | Q | 按关联对象当前范围与用途过滤 |
| POST | /works | work.create | portfolio.write | C | 最小字段、来源或说明及所属范围 |
| PATCH | /works/{id} | work.update | portfolio.write | C | 允许字段+expectedRevision，不能改另一领域事实 |
| GET | /projects | project.list | records.read | Q | 当前可见列表 |
| GET | /projects/{id} | project.get | records.read | Q | 按关联对象当前范围与用途过滤 |
| POST | /projects | project.create | projects.write | C | 最小字段、来源或说明及所属范围 |
| PATCH | /projects/{id} | project.update | projects.write | C | 允许字段+expectedRevision，不能改另一领域事实 |
| GET | /shortlists | shortlist.list | records.read | Q | 当前可见列表 |
| GET | /shortlists/{id} | shortlist.get | records.read | Q | 按关联对象当前范围与用途过滤 |
| POST | /shortlists | shortlist.create | shortlists.write | C | 最小字段、来源或说明及所属范围 |
| PATCH | /shortlists/{id} | shortlist.update | shortlists.write | C | 允许字段+expectedRevision，不能改另一领域事实 |
| PUT | /works/{id}/assets | work.assets | portfolio.write | C | 有序资产/封面/图注+expectedRevision；原子替换关系 |
| PUT | /works/{id}/credits | work.credits | portfolio.write | C | 人/机构及真实角色和来源；parent由path推导 |
| PUT | /projects/{id}/participants | project.participants | projects.write | C | 实际/确认/提名+来源；不是订档 |
| PUT | /projects/{id}/works | project.works | projects.write | C | DELIVERABLE/REFERENCE+来源，精确关系 |
| PUT | /projects/{id}/recap | project.recap | projects.write | C | 内部复盘正文/证据+expectedRevision；无公开案例 |
| PUT | /shortlists/{id}/items | shortlist.items | shortlists.write | C | **personId+personRoleId**/作品/素材/顺序/备注+expectedRevision；Role必须属于Person，失效不静默换Role |
| GET | /locale-texts/{id} | locale.get | records.read | Q | 内部语言文本、来源版本、需复核状态 |
| POST | /locale-texts | locale.create | 目标域write | C | 有限subjectRef/locale/text/sourceRefs；非公开稿 |
| PATCH | /locale-texts/{id} | locale.update | 目标域write | C | text+expectedRevision；人工确认依赖更新，不自动覆盖另一语言 |
| POST | /imports/preview | import.preview | records.write | C | 文件或文字、固定字段Schema；暂存预览不写正式人才 |
| GET | /imports/{id} | import.get | 原创建人/records.write | Q | 逐行诊断；私密字段需单独权限 |
| POST | /imports/{id}/commit | import.commit | records.write | A | previewRevision/selectedRows；每行稳定键与事务结果 |
| POST | /people/merge-preview | person.mergePreview | data.merge | QPOST | 零正式写入；双方有权限+版本；输出冲突与影响 |
| POST | /people/merge | person.merge | data.merge | C | 双方版本/冲突选择；不扩大scope/用途、不合并账号 |
| POST | /exports | export.create | data.export | A | fields/selectedIds/usePermissionRefs/format=JSON；预览明确范围 |
| GET | /exports/{id} | export.get | 原申请人/data.export | Q | 状态、摘要和可见清单，不直接给文件URL |
| POST | /exports/{id}/download | export.download | 原申请人/data.export | ACCESS | 逐行/字段/保护版本/用途复查；任一失效拒整件 |
| POST | /deletion-requests/preview | deletion.preview | data.delete | QPOST | 目标/影响/保留决定；零清理效果 |
| POST | /deletion-requests | deletion.create | data.delete | A | 确认目标/依据/版本；先阻断，再后台清理 |
| GET | /deletion-requests/{id} | deletion.get | data.delete | Q | 阻断/清理/有据保留/失败分开报告 |
| POST | /ai-jobs | ai.create | ai.use | A | 四类任务联合Schema；输入清单、来源版本和用途；预留预算 |
| GET | /ai-jobs/{id} | ai.get | 原申请人/ai.use | Q | 状态、证据/成本状态；当前仍有源读取权 |
| POST | /ai-jobs/{id}/cancel | ai.cancel | 原申请人/ai.use | C | 申请取消；在途不保证未执行/免费 |
| GET | /proposals/{id} | proposal.get | 原申请人/ai.use | Q | 差异、来源及当前可见建议；不返回隐藏字段 |
| POST | /proposals/{id}/apply | proposal.apply | 目标域write+ai.use | C | selectedFields/baseRevision；PENDING多选一次原子确认 |
| POST | /proposals/{id}/reject | proposal.reject | 原申请人/ai.use | C | 终止建议，不修改人才/项目事实 |
| GET | /ai-settings | aiSettings.get | config.manage | Q | 非秘密配置、验证指纹与功能开关 |
| PATCH | /ai-settings | aiSettings.update | config.manage | C | 允许的非秘密配置+revision；变更身份使批准失效 |
| POST | /ai-settings/approve | aiSettings.approve | config.manage | C | 配置指纹/测试证据/用途范围/预算；无默认自动批准 |
| GET | /jobs/{id} | job.get | 原业务权限 | Q | 仅状态/原因/重试资格；不返回通用内部payload |
| POST | /jobs/{id}/retry | job.retry | jobs.manage+原业务权限 | C | 只允许注册重试类；AI未决不是通用重试对象 |
| GET | /audit-events | audit.list | audit.read | Q | 范围内事件、分页，无完整敏感diff |
| GET | /health/live | health.live | 受限部署入口 | Q | 不返回秘密 |
| GET | /health/ready | health.ready | 受限部署入口 | Q | 核心DB/Schema可用；无AI/CMS不影响核心ready |

## 5. 创建/更新Schema的关键闭合

person.create 的来源输入改为 `originSourceId` 或 `inlineOriginSource` 之一；它只说明自然人身份最初如何进入系统，不再证明 TalentProfile/Role/Language/Capability 等事实。具体事实走各自 Source/Evidence。创建人才时可以在同一应用命令中创建 TalentProfile + 初始Role，但 Person 本身仍可独立存在。

source创建以后再upload；Asset.sourceId沿UploadSession固定，complete不接受另一个sourceId。work资产和credits的parent沿路径固定；shortlist条目的素材若声明来自某work，必须验证该work_asset的实际归属，不能只有同workspace检查。

机构/品牌CRUD保证可先建客户名称和品牌引用。项目不要求报价/合同；recap就是内部备注。语言文本subjectRef有限且exactly-one；不存在按lang自动复制整个人物的接口。

## 6. AI四类输入

| taskType | 输入 | 输出及约束 |
|---|---|---|
| extract_profile | sourceRefs+expectedRevisions；获准文字/PDF提取文字 | 候选字段+原文定位；缺项UNKNOWN，不生成客户/项目 |
| suggest_tags | work/文字描述ref+版本+有限标签字典 | 标签建议和依据；不补敏感身份 |
| draft_locale | subjectRef+确认事实/选定语言+内部文本目标 | 文本草稿+事实引用；不能包含来源未证明业绩 |
| parse_search | queryText+允许条件Schema | 筛选AST；显示预览后调用原结构化查询，不生成SQL |

提交时对实际文字内容检查最小化/用途；用户自由输入的检索句也可能有私密信息，不能因无sourceId就全量外送。无法自动判定的真实业务信息先提示用户删去非必要信息；外送须显式确认。默认检索解析只发查询句与公共字段字典，不发送候选整库。

AI成功不等于可采纳。Talent R1 的 AIProposal 与通用 FieldProposal 都绑定 schemaVersion/baseRevision/sourceRevision；配置、源、目标或Schema变化后 STALE。未知字段/code拒绝。AI 不得从图片推断 AdultEligibility、国籍、健康或宗教。apply 调用目标域命令一次原子确认，不直接改表。模型输出JSON严格验证并按普通文本渲染。

## 7. 导出与临时读取

内部JSON导出有精确fields与selectedIds，成员列表在生成时冻结。实际执行时重查，下载时再次逐行/字段/依据重查；一项失效整份拒绝。只检查data.export是不够的。需合法剩余内容时重新生成，不原地改旧文件摘要。

导出原件不作为默认功能。JSON可携带受限媒体身份清单但不包含签名URL和无法读取的源内容；实际完整迁移媒体由隔离维护工具另行授权处理。备份不是通过普通导出接口搬密码哈希/密钥。

鉴权流式读取仍需Range边界/大小限制、private/no-store。采用短签名时不超过用途剩余时间；既有URL可能在短窗口有效，不能承诺即时收回。所有派生文件保持私有。

## 8. 本期没有的操作

没有分享会话、客户反馈、公开查询、内容批准发布、站点配置、CMS验证、网页对账/下架、SEO重建。代码生成器不得从旧API清单补回这些路由。当前平台注册事件和权限码也不提前登记未来能力。

## 9. 契约测试

每条写路由至少覆盖合法、无权限、错误scope/parent、未知字段、旧revision和重复key。每条读路径覆盖关联记录/敏感字段/计数同范围。认证类测试会话撤销和CSRF；文件类测试最终对象与Range；AI/导出测试当前资格。

OpenAPI在开发过程中生成并纳入差异检查；不能把本表当作已经存在的OpenAPI或测试通过证据。前端API客户端使用生成契约，不直接导入数据库模型。
