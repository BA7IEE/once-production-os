# ONCE Production OS｜范围修复与对抗审查回填报告

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 对抗审查已回填，新增实现未执行

## 0. Talent Domain 2.0 R1 对抗审查回填

2026-09-27 对 PR #24 的 R0 冻结稿做全局第一性原理复核，发现并回填以下结构问题；这些是规格修订，不是产品已实现：

| 编号 | R0问题 | R1处置 |
|---|---|---|
| TD-R1-01 | Person 被默认等同 Talent | TalentProfile 改 0..1；普通经纪人/联系人可只有Person |
| TD-R1-02 | Person.source 容易继续被当“整个人才主来源” | 收窄为 originSource；字段/关系事实各自 Evidence |
| TD-R1-03 | 外部Agent没有稳定人物映射 | 新增 PersonExternalRef；exact ref解析，模糊不自动merge |
| TD-R1-04 | Agent会冒充人类账号 | 新增 ServicePrincipal/Machine Actor 与 actor exactly-one |
| TD-R1-05 | ModelProfile 复制跨角色身体事实 | 取消大而全ModelProfile；改CastingProfile+MeasurementSet组合视图 |
| TD-R1-06 | 尺寸缺历史和尺码体系 | MeasurementSet时间快照；shoe/clothing value+system |
| TD-R1-07 | MediaCollection把资料形式和内容类型混在一起 | collectionType 与 tag 分离 |
| TD-R1-08 | Representation无法表达不同职业/地区 | 增加 personRoleId/territory/validity |
| TD-R1-09 | Shortlist多职业上下文会丢 | ShortlistItem强制personRoleId |
| TD-R1-10 | languageCodes无法表达商务可用程度 | PersonLanguage听说读写级别，旧数据不猜等级 |
| TD-R1-11 | 成人场景资格没有最小事实位置 | AdultEligibility；UNKNOWN fail closed；不靠图片推断 |
| TD-R1-12 | Capability可能演变自由标签垃圾场 | CapabilityDefinition + Schema Registry |
| TD-R1-13 | Capability和资格证混淆 | PersonCredential独立；敏感编号加密/掩码 |
| TD-R1-14 | Agent冲突写入缺少中间态 | FieldProposal；source/target/schema变化STALE |
| TD-R1-15 | 时间变化事实表达不足 | Location/Language/Measurement/Representation/Credential均可带validity/source |

R1 Gate 扩展为 TD2-T01～18；开发顺序仍为 DEV-09 → TD2-01～06 → DEV-08 AI。

## 1. 本轮纠偏

用户确认现阶段主要做OS，官网发布可以暂不考虑。因此不再把上一轮发布风险补丁全部纳入当前开发；**修复范围本身，再修当前范围内的契约**。

修订了整套活动文档，而不是在v0.2后再加一份“暂不做官网”的附录。当前12个工作包全部围绕内部OS和AI；旧官网/客户功能编号保留但DEFERRED，不进入验收统计。

## 2. 整套文档的主要变化

BRD删除当前获客目标；MRD改内部任务；PRD逐需求标注内外拆分；复用X3不再模拟CMS；开发结构删客户/发布应用；模型删公开/客户专用表；API删匿名业务与发布路由；09改内部工作流；任务表重排M1/M2/M3；运维删除网站域名/凭证/公开桶/缓存对账；参数/门名和Agent入口全部同步。

长期方向没有被否定：以后可择机对外展示。当前只留稳定ID、领域接口、版本和输出必须另审的原则，不创建将来才用的公开投影引擎。

## 3. 审查发现逐项处置

状态说明：SPEC_UPDATED是主文档已回填；SPEC_SIMPLIFIED是采用更窄的可实现规则；SPLIT是保留内部适用部分并延期外部部分；DEFERRED_WEB/FORMAT是相关能力本期不实现，**不是漏洞已经修好或测试通过**。

| R1编号 | 原问题 | 本版处理 | 实际变更 | 主条款 | 验收定位 |
|---|---|---|---|---|---|
| A01 | 官网自然到期 | SPLIT | 内部读/AI/导出实时期限写入09；官网到期传播延期 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-09 |
| A02 | 晚到公开媒体 | DEFERRED_WEB | 不产生任何公开媒体；不建其协议。当前私有迟到上传按取消/隔离处理 | [04_PRD.md](04_PRD.md) | AT-07/AT-24 |
| A03 | 旧导出下载复核 | SPEC_UPDATED | 精确记录/字段/保护版本清单；执行与下载重查；失效拒整件 | [07_DATA_MODEL.md](07_DATA_MODEL.md) | AT-11/AT-12 |
| A04 | 非许可安全变化 | SPEC_UPDATED | 源暂停、范围收窄、隔离、删除用保护版本及当前判断；非全站撤回 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-10 |
| A05 | AI发送后崩溃 | SPEC_UPDATED | 发送前Attempt持久化MAY_HAVE_EXECUTED；未知占预算，不重发 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-16/AT-17 |
| A06 | CMS人工改稿竞态 | DEFERRED_WEB | 不接CMS，删除当前工作包与验收；未来启用时重新评审 | [04_PRD.md](04_PRD.md) | AT-24 |
| A07 | 旧库恢复与远端状态 | SPLIT | 内部恢复隔离及已删/停用核对保留；远端枚举/暂停全部延期 | [11_OPERATIONS.md](11_OPERATIONS.md) | AT-23 |
| A08 | 复杂许可未落实 | SPEC_SIMPLIFIED | 内部依据+有限额外用途/变换清单；未知条件拒相关动作；不做全球权利图谱 | [07_DATA_MODEL.md](07_DATA_MODEL.md) | AT-15 |
| A09 | CAS与幂等顺序 | SPEC_UPDATED | 已有安全回执先重放；仅新命令检查expectedRevision；当前访问仍复查 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-01/AT-02 |
| A10 | 摘要排序协议 | SPEC_UPDATED | 统一once-jcs-v1，DEV-02测试兼容；不复制多个手工canonical变体 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-01 |
| A11 | 父子与客户反馈归属 | SPLIT | 内部作品/资产/清单父子组合约束；客户反馈表/验收延期 | [07_DATA_MODEL.md](07_DATA_MODEL.md) | AT-03 |
| A12 | 局部隐藏依赖不清 | SPEC_SIMPLIFIED | 内部清单动态授权；导出及不确定衍生件整件阻断，不做任意内容节点图 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-10/AT-13 |
| A13 | 最小录入旅程缺口 | SPEC_UPDATED | 空库bootstrap、账号重置、无文件来源、内联来源建人、再上传全部写闭合 | [08_API_PERMISSIONS.md](08_API_PERMISSIONS.md) | AT-14 |
| A14 | 验证未绑定配置 | SPLIT | AI配置身份/版本、存储历史locator仍保留；CMS验证配置全部延期 | [11_OPERATIONS.md](11_OPERATIONS.md) | AT-18 |
| A15 | 不可变与删除冲突 | SPEC_UPDATED | 删除可销毁敏感payload留下ERASED最小头；覆盖语言/AI/导出/索引 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-13/AT-23 |
| A16 | 逐项采纳终态矛盾 | SPEC_UPDATED | PENDING多选，一次原子采纳，余项丢弃；后续须新提议 | [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | AT-20 |
| A17 | 阶段门重名与交叉 | SPEC_UPDATED | M0～M3里程碑和ENABLE-*条件分开；不沿用P0-A/B或G0～G5 | [12_DECISIONS_CHANGELOG.md](12_DECISIONS_CHANGELOG.md) | AT-24 |
| A18 | 上传整体配额 | SPEC_UPDATED | 数量/暂存预算/解析上限/孤儿期限；明确云端字节硬限制仍需实测 | [12_DECISIONS_CHANGELOG.md](12_DECISIONS_CHANGELOG.md) | AT-05/AT-06 |
| A19 | CSV公式注入 | DEFERRED_FORMAT | 当前只导出有Schema JSON；CSV下载不实现，未来需目标软件验证 | [04_PRD.md](04_PRD.md) | AT-24 |

## 4. 仍然保留的底线

内部系统仍有联系方式、作品原件、AI输入、批量导出和数据库备份，因此不能以“只内部用”为由取消认证/字段权限、用途说明、私有访问、重复操作保护和恢复隔离。这些是当前动作的最低实现边界，不是要求另建一套合规平台。

资料一开始能有据暂存，公开许可不作为建档门槛。复杂条件无法落实时只禁受影响动作，手工录入、元信息和其他合法资料仍可用。默认不要求两人审批或先建设完整组织树。

## 5. 旧计划怎么退出

v0.2的21个D编号停作当前工作指令；10保留每项映射。原30项FR和52项LEGACY-AC有新归属/延期记录。不能继续按旧D14先做CMS调查，也不能以旧D11包含客户反馈来阻塞人工内部试用。

旧19项审查候选不再与当前文档并行。未来重启官网时需要重新评估当时CMS、授权、缓存和对外可见性；不把本次延期视为永久免责或可直接启用。

## 6. 本轮没有完成的事情

没有运行ONCE代码、SRVF构建、数据库迁移、真实存储/AI调用或恢复演练。新的合同/状态规则写入主文档，相关产品测试全部NOT_RUN。14只报告本次实际文件检查，旧审查的有限模型执行结果不转记为本轮产品证据。
