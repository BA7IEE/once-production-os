# ONCE Production OS｜范围决策、阶段门与唯一参数｜v0.5

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 重新冻结候选，新增实现未执行

## 1. 用户确认与本版实现默认分开

已确认：ONCE Production OS方向；一期先内部OS；AI需要接入；CRM/财务/合同/排期/报价暂不做但底座可扩展。Talent Domain 2.0 R1 冻结为：**Person 是自然人且不等于 Talent；一个现实人物一个 Person；TalentProfile 可选；Role、Capability、时间化事实、Evidence、ExternalRef、Machine Actor 分层。**

本版为此选取的实现默认：客户外部分享/反馈、自助门户继续延期；内部清单和JSON迁移保留；AI仍保留四种有界任务，但正式人才提取/标签/搜索契约必须等 Talent Domain 2.0 R1 Gate。当前恢复链先完成，再做 TD2-01～06，再启动 DEV-08。

技术/阈值是文档设计默认，不是用户已逐项批准或云端已实测值。变更必须更新相应PRD/API/测试，不能把一句默认当作法律结论或供应商保证。

## 2. 唯一里程碑

| ID | 含义 | 完成范围 |
|---|---|---|
| M0 | 可开发的内部工程底座 | DEV-00/01/02；合成资料、身份/回执/任务 |
| M1 | 无AI也可使用的内部闭环 | DEV-03～07及DEV-09；人才/素材/作品/项目/清单/维护/恢复 |
| M2 | 明确的内部AI能力 | TD2-01～06 且 TD2-T01～18 Gate 通过后执行 DEV-08；四类任务、来源/采纳/配置/费用 |
| M3 | 当前一期回归、试点和交接 | DEV-10/11；M1和M2全部当前验收 |

M1可以先内部试用；M2仍属于一期，不永久拖后。M0～M3都没有官网/CMS/SEO前提。旧G0～G5、P0-A/P0-B不再用作当前完成定义。

## 3. 动作资格条件：不与里程碑重名

| 条件 | 只约束什么 | 不约束什么 | 目前证据 |
|---|---|---|---|
| ENABLE-CODE | 实际复制SRVF来源代码的授权/许可与文件清单 | 原创骨架、合成模型、没有复制的研究 | 本轮未抽取；移植时登记已有适用授权 |
| ENABLE-DATA | 真实资料接收依据/必要范围/保留、内部安全测试 | 合成资料开发；不要求全球公开许可 | 待真实试点确认 |
| ENABLE-STORAGE | 所选真实存储的私有权限、封存、大小/读取链测试 | Local Provider、其他领域 | NOT_RUN |
| ENABLE-AI | 实际第三方输入允许、配置、预算与安全测试 | 人工流程、Mock Provider、其余OS | NOT_RUN |
| ENABLE-INTERNAL | 内部生产入口、会话/权限、备份恢复与维护责任 | 可逆本地开发 | NOT_RUN |

只有实际触发相关动作时才检查其条件，不必第一行代码前全部通过。负责人/投入确认由项目实际安排，不把未定官网负责人写成任何门。

## 4. 默认参数（唯一数值来源）

所有量均为待验证默认/目标，非既有性能和能力。D03等旧编号不再使用；调参在相应DEV工作包记录。

| 参数 | 当前默认/目标 | 说明 |
|---|---|---|
| 空间/用户范围 | 单ONCE工作空间，仅内部成员 | 无SaaS开通或客户账号 |
| 人才范围 | 首批合作人才以成人为范围 | 不看脸推断年龄；不默认收身份证/护照；疑似不符合先受限核实 |
| 试点样本 | 最多30人才/20作品/3项目 | 不足按实际，不凑数 |
| 净效率实验 | 目标各10个可比手工/系统任务 | 小样本不是统计性结论 |
| 图片/PDF/精选MP4 | 30MB / 50MB / 200MB | MB=1,000,000字节；非云服务上限；不接原片 |
| 允许类型 | JPEG/PNG/WebP、PDF、MP4 | 无SVG/HTML/可执行文件/压缩包 |
| 解码/解析 | 60MP图像、100页PDF；单解析256MB、60秒初始限额 | 这些上限不保证同时极值可成功；超限拒绝/人工预处理；DEV-04实测合理阈值 |
| actor未结束上传 | 3个 | 预留包括未过期/未完成，不靠前端计数 |
| workspace活动上传 | 20个 | 原子预留；终态幂等释放 |
| workspace暂存声明预算 | 1,000MB | 应用准入而非未经实测的供应商计费硬封顶 |
| 待解析任务 | 50个 | 超限排队/明确拒绝，不无界解析 |
| 上传签名/续签 | 5分钟/每会话最多2次 | 同一预算预留，用途截止更早则截断 |
| staging孤儿清理 | 24小时 | 未结束或在用不得误删；仅清登记的对象 |
| 临时接收期限 | 7天 | 已说明依据的整理期；非法律通用期限；不能反复无据延长 |
| 资料复核提醒 | 90天 | 不是档期/合作资格自动过期 |
| 默认分页 | 20，最大100 | 统一权限过滤和稳定排序 |
| 人类会话 | 空闲30分钟/最长12小时 | 停用/改权可更早失效 |
| 激活凭证 | 24小时/单次 | 无响应秘密需受控重置，不GET回原值 |
| 可选私有读取签名 | 最长60秒 | 不超过任何适用用途截止；优先鉴权流；非即时召回 |
| 内部候选清单 | 最多30人 | 大清单拆分；不是客户包限制 |
| JSON导出文件期限 | 24小时 | 下载逐依赖复查；可更早作废 |
| 命令回执 | 30天 | 过期后不承诺同key永久重放；关键唯一约束/批次记录仍保护领域 |
| AI并发/单请求 | 2 / 60秒 | 网络/解析限额分别处理 |
| AI自动重试 | 最多2次，且必须可证明未执行或供应商同键去重已验 | UNKNOWN不盲发、保留预留额 |
| AI输入 | 每任务最多30,000字符，最多10个来源 | 用户确认必要字段；不发全库；token上限在Provider配置另锁定 |
| AI输入/建议临时payload | 默认7天 | 依据更短则更短；删除/保护变化可提前清理；已采纳事实不依赖建议存活 |
| AI预算/费率 | 无默认金额，须明确配置 | 未配置即不发外部计费请求 |
| 普通Worker并发/清理 | 普通初始2；预留1个受限清理槽 | 不需独立消息平台；资源按实测调 |
| 租约/续租/排空 | 30秒/10秒/最长30秒排空 | 超时安全退出留下未决态；不等于撤销外部HTTP |
| 负载样本 | 1,000人才/3,000作品/30,000资产元数据/5并发 | 收敛到内部规模；合成样本，不存同量大视频 |
| 性能目标 | 普通API P95<800ms；结构化查询P95<1.5s | 约定4vCPU/8GB参考环境，至少3轮；上传/模型耗时单列 |
| 业务恢复目标 | RPO≤24h / RTO≤4h | 待演练；不允许因此忘记最新删除/停用 |
| 备份策略 | 每日；7份日+4份周 | 产品初始提案，最终保留按依据确认并到期清理 |

## 5. 当前架构决策

OS-ADR-01：独立仓库/数据/secret，选择性来源复用。OS-ADR-02：模块化单体与Worker，普通关系数据库。OS-ADR-03：人/账号/品牌/机构/作品/项目分离。

OS-ADR-04：只用有限内部角色与scope，新增字段默认不外送。OS-ADR-05：来源可先无文件；内部依据与额外导出/AI用途分开，无全球权利图谱。

OS-ADR-06：新final封存再检查；全部存储私有。OS-ADR-07：内部清单可变引用，无客户快照。OS-ADR-08：本地回执先于新命令CAS，统一摘要实现。

OS-ADR-09：AI发送前持久Attempt，未知费用不自动释放；一次原子采纳。OS-ADR-10：导出逐依赖检查，删除可清敏感payload。OS-ADR-11：恢复先隔离内部访问，缺口重核。

OS-ADR-12：官网/客户门户/商业模块只留连接原则，不建运行时骨架。

OS-ADR-13：**Person ≠ Talent。** Person 是自然人唯一主身份；TalentProfile 是 0..1 制作人才扩展。经纪人/客户联系人可只有 Person；一个现实人物多职业不复制 Person。

OS-ADR-14：**Role、Capability 与时间化事实分层。** PersonRole 表达职业；CapabilityDefinition/PersonCapability 表达能力；Language、Location、Measurement、Representation、Credential 等以可带来源/时间的关系表达。不得无限扩张 Role 字典。

OS-ADR-15：**R1 不建“大而全 ModelProfile”。** Model UI 由 MODEL Role + CastingProfile + MeasurementSet + Capability + MediaCollection + Work + Representation 组合；Actor/KOL 可复用 casting facts。Translator 用语言对/服务模式组合视图；Crew 默认复用通用模型。

OS-ADR-16：**多来源事实优先于主来源。** Person 的来源收窄为 originSource；具体事实允许多 Evidence。新来源冲突不得自动覆盖，进入受 Schema 约束的 FieldProposal。

OS-ADR-17：**ExternalRef 解决机器身份映射，不解决自动合并。** exact provider/namespace/externalKey 可定位 Person；姓名/头像/模糊相似度不得自动 merge。

OS-ADR-18：**Agent 是独立 Machine Actor。** ServicePrincipal 与 User/Membership 分开；scope、permission、credential、default human maintainer、audit actor 分离；默认无 admin/merge/delete/批准等高危权限。

OS-ADR-19：**媒体形式与内容标签分离。** Asset 是文件，MediaCollection type 是资料形式，MediaCollectionTag 是内容/风格，Work 是真实作品；同一 Asset 可复用而不复制物理对象。

OS-ADR-20：**Shortlist 保留 Role Context。** ShortlistItem 必须持久化 personRoleId；多Role人物不得在候选中丢失职业上下文或静默切换Role。

OS-ADR-21：**资格与敏感事实最小化。** AdultEligibility 不靠图片推断年龄；需要成年资格时 UNKNOWN fail closed；默认不长期保存完整身份证/生日。Credential 与 Capability 分离，敏感编号加密/掩码。

OS-ADR-22：**Agent/AI 服从版本化 Talent Schema。** Role/Capability/Field/Collection/Credential 等 code 均来自 Schema Registry；未知字段/code/stale schema fail closed。无直写权限或事实冲突走 Proposal。

OS-ADR-23：**Talent 2.0 R1 只做前向兼容迁移。** Person/Work/Project/Asset UUID 不变；roles[]/skillCodes[]/languageCodes[]/cityCode/heightCm 等先回填与双读验证，再切新写，最后另一个 migration 删除旧列；不得改写已应用 migration。

所有更改均需更新相应FR/T/DEV与相邻契约，不用新附录覆盖主文档。

## 6. v0.4 → v0.5 / Talent Domain 2.0 R1 变化摘要

R1 对 R0 做结构纠偏：Person 与 TalentProfile 分离；Person.source 收窄为 originSource；新增 PersonExternalRef、ServicePrincipal/Machine Actor、PersonLanguage、TalentLocation、CastingProfile/MeasurementSet、AdultEligibility、Credential、FieldProposal；取消数据库层“大而全 ModelProfile”。

媒体改为 Collection Type + Tag 两维；Representation 支持 PersonRole/territory；ShortlistItem 必须保存 personRoleId；CapabilityDefinition 进入 Schema Registry；Agent 只能按版本化 Schema 直写或提交 Proposal。

开发顺序保持：**完成当前 DEV-09 恢复链 → TD2-01～06 → DEV-08 AI → 后续总体验收**。TD2-01～06 内容按 R1 重定义。

R1 Gate 扩展为 TD2-T01～18；不得用旧 T01/T04/T14、R0 文档或历史 CI 冒充 R1 已通过。完整冻结规格见 `15_TALENT_DOMAIN_2.md`。

## 7. v0.2 → v0.3变化摘要

一期从“内部+客户+官网”收窄到“内部OS+AI”。6角色收敛为4模板+敏感权限；RightsCase多方公开权利模型收窄为来源依据/有限额外用途；Board/Share/Publication相关模型和API退出。保留内部版本、权限、文件、任务、恢复与AI未知请求的安全契约。

D00～D20改为12个DEV工作包；A01～A19逐项处置；52项LEGACY及26项旧RT记录内部/延期映射。内部语言版本保留，SEO语言互链不做。当前导出以JSON完成，CSV下载延期。

这是一轮范围修订和规格修复，不是生产漏洞修复。当前可以开始DEV-00，未来模块或供应商门不阻止可逆的内部开发。
