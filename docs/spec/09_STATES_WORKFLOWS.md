# ONCE Production OS｜内部状态与工作流｜不含网站发布

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 SPEC_FROZEN，尚未实现

## 1. 范围与状态分层

状态只服务当前内部业务。没有公开审批、PublicationTarget、CMS generation、撤回墓碑、客户ShareGrant。数据未来可被选择性输出，不意味着现在要创建整套外部状态机。

| 对象 | 当前状态/语义 |
|---|---|
| Person / TalentProfile / 作品 | Person与Talent分层；DRAFT/ACTIVE/ARCHIVED/ERASED；Talent ACTIVE不表示公开、可预订或有档期 |
| 来源依据 | RECEIVED/CONFIRMED/SUSPENDED/ERASED；时间失效实时计算 |
| 上传 | CREATED/SEALING/INSPECTING/READY/FAILED/CANCELLED/EXPIRED |
| 资产 | PROCESSING/READY/QUARANTINED/ARCHIVED/ERASED |
| 项目 | DRAFT/ACTIVE/COMPLETED/CANCELLED/ARCHIVED；不触发财务 |
| 内部清单 | 可变草稿/归档，revision保护；每个条目固定 personRoleId；Role失效后不可用而不自动切换 |
| AIJob | QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELLED/UNKNOWN |
| AIProposal / FieldProposal | PENDING/APPLIED/REJECTED/STALE/ERASED；source/target/schema变化可STALE |
| Export | QUEUED/BUILDING/READY/FAILED/STALE/REVOKED/ERASED；EXPIRED实时计算 |
| 删除请求 | BLOCKED_FOR_USE/CLEANING/COMPLETED/RETAINED_WITH_BASIS/FAILED |
| PersonRole | ACTIVE/INACTIVE/ARCHIVED；有效期另算；停用不删除历史Work/Project |
| PersonExternalRef | OBSERVED/VERIFIED/REVOKED；REVOKED不删除Person |
| MeasurementSet | DRAFT/CONFIRMED/SUPERSEDED；CONFIRMED历史不静默覆盖 |
| AdultEligibility | UNKNOWN/SELF_DECLARED_ADULT/VERIFIED_ADULT/RESTRICTED；UNKNOWN fail closed |
| Credential | ACTIVE/EXPIRED/REVOKED/ARCHIVED；到期实时计算 |
| ServicePrincipal | ACTIVE/PAUSED/REVOKED；credential rotate/revoke立即生效 |

任务运行状态与业务可用状态分开。Worker显示SUCCEEDED不允许越过Asset检查或AIProposal采纳条件。

## 2. 用途判断的最小实现

INTERNAL：当前成员有动作、scope和字段权限；相关source具有适用于这次动作的当前内部依据；对象没有被隔离/删除阻断。TEMP_ORGANIZE只允许有限整理，不进入导出/AI。

INTERNAL_EXPORT：除上述条件，还要导出权限与实际记录/字段/原件范围允许；本次UseManifest满足全部限制，尤其不能把“内部导出”写成对外发送许可。

AI_PROCESS：独立许可、具体供应商/configRevision、数据类别、来源范围和期限；不包含默认禁止的联系人/凭证/合同原件/非必要客户资料。适用明确禁止优先；不知道条件含义则NEEDS_REVIEW。

有效区间为 `validFrom <= now < validUntil`；null有效期仅在有明确长期依据与复核计划的配置允许，不默认无限。每次读/处理检查当前时钟，即使Worker停止也不得越过期限。定时清理用于节省空间/提醒，不是访问鉴权的前置。

UseManifest保存精确字段和变换：禁止裁切的图不得裁切，要求署名的预览不得悄悄丢署名。没有简单可执行方案则用元数据占位/人工整理，不建设自由规则引擎。

## 3. sourceRevision与protectionEpoch

正常姓名/城市/简介修改升revision，依赖文本提示陈旧；不把每次修字都当成安全事件。范围收窄、来源依据暂停、资产隔离、删除限制和额外许可撤回升protectionEpoch并记录失效任务。

导出/AI输入同时保存两种版本：内容是否过时与用途是否仍成立分别判断。已生成导出内容本来是过去快照，普通后续修字不必修改旧文件；但安全版本变了则必须拒绝新下载。内部清单本身是动态引用，不在后台偷偷保留无权的旧字节。

### 3.1 Talent R1 的时间事实与冲突

Person.originSource 只说明身份进入系统的来源。Role、Capability、Language、Location、Measurement、Representation、Credential 等保存自己的 source/version/validity；新来源与当前值冲突时不直接覆盖。

MeasurementSet 的 CONFIRMED 记录作为历史快照；新测量建立新记录并切 currentMeasurementSet 指针。Representation/Location/Credential 到期不删除历史。PersonLanguage 级别未知保持 null。

AdultEligibility 只按明确状态工作；UNKNOWN 不因“看起来成年”自动变化。

## 4. 命令幂等的唯一顺序

```text
请求Schema、当前身份/成员、动作和资源范围初检
  → 确定稳定actor、operation及请求digest（包括expectedRevision）
  → 短事务按workspace+actor+operation+key取锁
  → 有回执：摘要不同则409；相同则authorizeReplay后返回安全回执
  → 无回执：锁业务根/必要依据，重查当前用途、状态与expectedRevision
  → 写事实 + 最小审计 + 新回执 + 必要job，同事务提交
```

`authorizeReplay` 对人类 Membership 与 ServicePrincipal 使用各自当前资格：人类检查会话/成员/权限；机器检查 principal status/scope/permission/credential epoch。对已删对象仅返回有权看到的处置头；不重放旧敏感payload。任何停用账号或 REVOKED ServicePrincipal 不因有旧回执被放行。

SECRET类创建只存安全身份，响应丢失须显式轮换，旧秘密无效。SIGN/ACCESS现签现验；登录/激活/重置不应用通用业务回执保存口令或会话。

摘要实现统一命名once-jcs-v1，按RFC8785兼容实现验证排序、数字和转义；reject重复对象键/非法Unicode/非有限数，超安全整数和精确小数使用明确字符串。业务归一化在构造Schema前完成并记录，不在hash阶段擅自trim/NFC或改换行。内部服务和浏览器无需各写一份手工canonical函数。[H-JCS，见13]

## 5. 上传与当前私有文件

先原子预留actor活动上传数、workspace活动数/暂存字节，再发staging凭证。complete只enqueue同一个处理任务。Worker校验实际大小 → 全新final封存 → 检查final → 生成允许预览 → 同事务登记对象/Asset/释放预留/审计 → staging清理。

同一source由会话创建时固定；final的具体locator及hash不可与当前存储配置混淆。改变存储bucket不把旧文件重新指向新bucket。迟到处理若source已经暂停/删除或会话取消，只能留下私有待清理对象，不能ACK成业务可用资产。

失败/取消/到期路径有幂等释放；释放预计字节不代表供应商对象已删除，物理清理有独立状态和告警。超大实际对象在昂贵解析前拒绝；是否由云端阻止超额PUT需真实实测。

## 6. 内部导出：冻结内容，但不冻结读取权

```text
选当前允许字段/记录 → 确认内部用途 → 冻结精确依赖清单
→ 入队 → 执行前逐依赖复查 → 生成私有JSON/摘要 → READY
→ 下载时复查申请者+每行字段/来源/保护版本/有效期
```

依赖有任何一项不再可用时，整个旧导出STALE/REVOKED，不对旧文件“隐藏一行继续下载”。需要剩余材料则新建导出。已发出的字节不可召回；短签名窗口的剩余风险按12记录。

CSV下载延期，只提供有Schema的JSON及媒体清单。今后提供Excel/WPS可打开CSV时，必须单独测试公式注入与显示转换，不以一般CSV双引号转义视为解决。[H-CSV，见13]

## 7. AI请求与未决Attempt

初次提交：当前资格/最小输入/Provider配置验证 → 原子预算预留+AIJob+排队任务 → Worker再查资格/源版本/预算 → 短事务创建唯一未决Attempt=MAY_HAVE_EXECUTED → 提交后才可发送HTTP。

这是一条保守边界：在Attempt提交后、HTTP开始前崩溃，也当成可能已执行。未知时禁止第二次盲发，不以lease过期推断未执行。

| 情况 | 本地处理 | 是否可自动再发 |
|---|---|---|
| 可证明尚未发送且Attempt未跨发送许可边界 | 保留/重排任务 | 在上限内 |
| Provider明确确认未执行 | 记录NOT_EXECUTED证据 | 在上限内新Attempt |
| 已获确认成功响应 | 保存输出、用量/估算或实际标记、生成建议 | 不重发 |
| 请求已发但响应未知、进程退出或计费不明 | UNKNOWN，保留预留额，待核对 | 不允许，除非已实测同键幂等/查询机制 |
| 用户取消时已在途 | cancelRequested，停止后续业务采纳 | 仍需记录可能费用，不假装免费 |
| Provider配置/身份变化 | CONFIG_CHANGED，停止旧任务 | 不把旧任务直接发新模型 |

预算上界基于已验证的输入/输出限制、当前配置费率和可能收费类别计算；无法给出合理上界则不发。供应商实际收费超预估时记录真实差额、冻结继续调用并核对，不能为了不超预算伪造费用。并发额度只承诺本地预留账的一致性，不宣称对供应商收费拥有绝对控制。

本期不提供自动多供应商fallback。同job最多一条未决Attempt；供应商幂等key保持该Attempt身份，不每重试换UUID。实际成本未知不能在Job变FAILED/CANCELLED时自动释放预留。费用字段注明估算/返回用量/人工核对，不冒充对账单。

## 8. Proposal：冲突建议与 AI 建议都只采纳一次

Talent R1 的 FieldProposal 与 AIProposal 共用核心状态：PENDING → APPLIED / REJECTED / STALE / ERASED。

Proposal 必须绑定 typed target、fieldPath、sourceRevision、baseRevision、schemaVersion 与真实 actor。fieldPath/code 必须在 Talent Schema 注册；不能用自由 JSON 绕过字段契约。

以下情况必须进入 Proposal，而不是静默覆盖：

- ServicePrincipal 只有 `talent.propose` 没有直写权限；
- 新来源与当前受保护事实冲突；
- AI 输出；
- 迁移/导入需要人工选择的多Role、ExternalRef冲突等。

apply 事务锁 Proposal 与目标根/来源，重查 scope、permission、Schema、source/target revision；通过后调用目标领域命令，Proposal 整体 APPLIED。source/target/schema 已变化则 STALE。

不允许第二个新 key 在 APPLIED 后继续采纳剩余字段；需要后续建议则创建新 Proposal。parse_search 只输出受限AST，draft_locale只写内部草稿。

## 9. 删除、派生文本与不可变载荷

先阻断目标使用；预览影响并作保留决定；清理source正文、联系值、Asset/Rendition、locale文本、工作备注中相关内容、AI输入/提议、Export和搜索索引。普通业务删除不允许编辑审计，但可按独立保留策略销毁敏感payload，保留最小ERASED头。

清理索引必须覆盖这些实际类型；缺少完整位置映射时保守隐藏整项/整件，不只移除图片却继续返回相关文字。不能证明所保留材料有独立依据则保持受限，人工决定后另存新修订。

删除安全任务独立于最初申请者当前是否在岗，不因为其账号停用而停止清理；AI/导出是代表人的处理，执行时必须重查发起者资格。

## 10. Worker与恢复

租约、续租、代次只约束本地claim/ACK。网络、文件解析不进长事务；退出停止新claim，受限时间排空后留下可恢复状态。普通重试不能调用有未决Attempt的AI任务。

恢复按11先隔离普通访问和AI/下载，生成新运行恢复批次。撤销旧session/激活令牌；ServicePrincipal credential/keyVersion 也进入恢复一致性检查与必要轮换；旧AI任务不自动发，旧导出不直接下载。Talent R1 新关系（Role/ExternalRef/Language/Location/Measurement/Representation/Credential/Collection/Proposal）缺失或关系不一致时 restore-check 阻断放行。

## 11. 故障验收的最小集合

同键重放但原revision已变；同键异载荷；错误父对象；staging覆盖；final丢失；上传预算竞争；源暂停后旧导出；未决AI恢复；建议二次采纳；配置更改；删除覆盖衍生文本；恢复旧权限和旧许可。

这些是待运行产品用例，不因文档中时序完整就宣称测试已过。详见10。
