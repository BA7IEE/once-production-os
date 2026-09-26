# ONCE Production OS｜开发任务、追踪与内部验收

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 新增能力未实现；历史实现状态以 release 证据为准

## 1. 当前开发节奏

DEV-00～DEV-11保留既有追踪编号。v0.5 对 TD2-01～06 做 R1 重定义，不增加第二套人才项目。规格状态不覆盖既有 release/CI 证据；TD2 R1 新增能力均为 NOT_IMPLEMENTED / NOT_RUN。

M1验收包含DEV-07和DEV-09，因此内部试用前有必要维护/导出/恢复；M2仍是明确的内部AI，不是官网阶段。**v0.5 继续要求：先完成 DEV-09 当前恢复链，再通过 TD2-01～06 / TD2-T01～18 Gate，之后启动 DEV-08。**没有任何站点调查或公开发布任务。

## 2. 既有12个工作包与TD2升级线

| ID | 里程碑 | 交付 | 依赖 | 改动面 | 完成断言 | 状态 |
|---|---|---|---|---|---|---|
| DEV-00 | M0 | 独立工程骨架与版本锁定 | 无 | 工程、CI、配置Schema | 空库能启动；api/worker/admin独立入口；无SRVF运行依赖 | NOT_STARTED |
| DEV-01 | M0 | 内部身份、范围与事务审计 | DEV-00 | identity/access/audit | 空库bootstrap、停用、重置、跨范围和敏感字段拒绝 | NOT_STARTED |
| DEV-02 | M0 | 命令幂等与后台任务机制 | DEV-01 | commands/jobs/worker | 同键重放在CAS之前；任务竞争、崩溃、过期租约 | NOT_STARTED |
| DEV-03 | M1 | 人才、机构、来源、字典与导入预览 | DEV-01, DEV-02 | talent/sources/catalog/admin | 最少字段建档；来源可先无文件；无公开许可也可有据内部整理 | NOT_STARTED |
| DEV-04 | M1 | 私有文件、封存、检查与预览 | DEV-02, DEV-03 | media/storage/worker/admin | 最终字节一致；资源预算；衍生文件同范围；暂停/到期拒读 | NOT_STARTED |
| DEV-05 | M1 | 作品、轻量项目与内部双语文本 | DEV-03, DEV-04 | works/projects/locale/admin | 署名正确；参考不计制作；内部复盘；中英修改不互相覆盖 | NOT_STARTED |
| DEV-06 | M1 | 查询、内部候选清单与日常工作台 | DEV-05 | queries/shortlists/admin | 列表与统计同权限；候选清单不生成分享链接/预订/网站内容 | NOT_STARTED |
| DEV-07 | M1 | 维护、内部导出、合并删除及依赖失效 | DEV-02, DEV-05, DEV-06 | maintenance/exports/use-policy | 旧导出逐依赖复查；JSON重建；删除不因快照不可变而失败 | NOT_STARTED |
| DEV-08 | M2 | 有界 AI、建议采纳与成本控制 | DEV-02, DEV-05, DEV-06, DEV-07, TD2-06 | ai-assist/provider/admin | 四种任务；使用版本化Talent Schema；发送前Attempt落库；未知不重发；原子多选采纳 | NOT_STARTED |
| DEV-09 | M1 | 部署、备份、恢复隔离与运行手册 | DEV-02, DEV-04, DEV-07 | ops/monitoring/runbooks | 无CMS配置启动；旧库恢复先隔离；账号停用/删除不自动复活 | NOT_STARTED |
| DEV-10 | M3 | 端到端、故障与范围回归 | DEV-08, DEV-09, TD2-06 | tests/evidence | 22组当前FR + TD2-T01～18 + 内部风险用例；关闭AI仍可完整人工Talent R1工作 | NOT_STARTED |
| DEV-11 | M3 | 真实样本试点、接管与文档交付 | DEV-10 | docs/release/measurement | 净用时实测；维护人能接管；无外部发布验收项 | NOT_STARTED |

### Talent Domain 2.0 R1 必做切片

| ID | 阶段 | 交付 | 依赖 | 完成断言 | 状态 |
|---|---|---|---|---|---|
| TD2-01 | M1扩展 | **Identity & Actor Foundation**：Person≠Talent、originSource、TalentProfile optional、ExternalRef、ServicePrincipal/ActorRef、前向迁移骨架 | DEV-07, DEV-09 | 普通联系人无需Talent；exact ref解析；Machine Actor不冒充人；稳定ID不变 | NOT_IMPLEMENTED |
| TD2-02 | M1扩展 | **Role & Common Facts**：PersonRole、CapabilityDefinition/Capability、PersonLanguage、TalentLocation、AdultEligibility、Credential | TD2-01 | Role/Capability分离；语言等级/地点/资格有来源和时间；unknown code fail closed | NOT_IMPLEMENTED |
| TD2-03 | M1扩展 | **Casting & Representation**：CastingProfile、MeasurementSet、size system、Representation | TD2-01, TD2-02 | MODEL/ACTOR/KOL共享casting事实；尺寸保留历史；代表关系可按Role/territory | NOT_IMPLEMENTED |
| TD2-04 | M1扩展 | **Media & Role Context**：Collection type/tag、Shortlist.personRoleId、Translator语言对/服务模式、Crew组合模型 | TD2-02, TD2-03, DEV-04 | type/tag不混；Shortlist不丢Role；Translator可筛；不做一职业一表 | NOT_IMPLEMENTED |
| TD2-05 | M1扩展 | **Search & Maintenance Wiring**：Search 2.0、Merge/Delete/Export/Rebuild/Recovery全接线 | TD2-02, TD2-03, TD2-04 | Role+Capability+Language+Location+Work+Collection查询；维护/恢复无盲区 | NOT_IMPLEMENTED |
| TD2-06 | AI前置门 | **Schema & Agent Contract Gate**：Schema Registry、FieldProposal、Agent API/MCP契约、完整R1 Gate | TD2-05 | schemaVersion固定；unknown field/code拒绝；冲突不静默覆盖；TD2-T01～18全通过 | NOT_IMPLEMENTED |

每项交付前端动作、后端契约、迁移/索引、权限/审计和失败路径；不得只交CRUD截图。责任为产品/全栈/测试/维护职责，不代表已指定人员或承诺固定工期。

回滚原则：骨架可撤销；认证/权限不能回退到无鉴权；文件回滚不能全桶删除；业务关系用前滚修正；已删/受限状态不能被旧库恢复；AI停止新请求但保留未知费用。精确迁移回滚须每个PR附实际方案。

## 2.1 TD2 R1 Gate 追加验收

TD2 不复用旧 T01/T04/T14 冒充通过。R1 实现必须追加：

- **TD2-T01｜Person ≠ Talent**：普通经纪人/客户联系人可有 Person 无 TalentProfile；创建Role前必须有TalentProfile。
- **TD2-T02｜一人多Role**：MODEL+ACTOR+KOL始终一个Person；重复有效Role受约束。
- **TD2-T03｜多来源与冲突**：originSource不是字段主来源；同值可多Evidence；冲突进入Proposal而非覆盖。
- **TD2-T04｜ExternalRef**：exact ref唯一解析；姓名/头像不自动merge；冲突/撤回可处理。
- **TD2-T05｜Machine Actor**：ServicePrincipal受scope/permission/default maintainer限制；revoke/rotate立即失效；审计显示机器身份。
- **TD2-T06｜Capability Registry**：unknown capability/stale schema拒绝；GENERAL skill迁移不猜Role。
- **TD2-T07｜Language / Location**：旧languageCodes不猜熟练度；BASE/SERVICE有来源与时间。
- **TD2-T08｜Casting / Measurement**：Model/Actor共享CastingProfile；MeasurementSet保留历史；鞋/服装尺寸有system；旧height不反推MODEL。
- **TD2-T09｜AdultEligibility**：UNKNOWN不满足成人限定；不从照片推断；最小证据不要求完整身份证/生日。
- **TD2-T10｜Representation**：可按PersonRole+territory表达；历史不覆盖；Agent Person不自动变Talent。
- **TD2-T11｜MediaCollection**：type与tag分离；Asset跨Collection/Work/Shortlist复用；删Collection不删Asset。
- **TD2-T12｜Shortlist Role Context**：ShortlistItem保存personRoleId；多Role不猜；Role失效不静默切换。
- **TD2-T13｜Translator / Crew**：Translator可按语言对/服务模式筛；摄影/剪辑等无需一职业一表。
- **TD2-T14｜Credential**：Capability与Credential分离；过期不删历史；敏感编号不泄露普通DTO。
- **TD2-T15｜Search 2.0**：Role+Capability+Language level+Location+Work+Collection组合查询；facet/计数/结果权限一致。
- **TD2-T16｜Maintenance**：Merge/Delete/Export覆盖全部新关系，有真实PG preview/execute/rollback证据。
- **TD2-T17｜Rebuild / Recovery**：旧库升级、新空库、T29 rebuild、DEV-09 DB+media backup/restore包含新模型。
- **TD2-T18｜Agent Schema / Proposal**：unknown field/code/schemaVersion拒绝；无直写权只能proposal；source/target/schema变化使proposal stale。

只有 TD2-T01～18 在指定实现 commit 上有真实证据，TD2-06 才可标记 Gate PASS。

## 3. FR与当前验收完整追踪

DEFERRED行无当前DEV/T执行要求；IN_SCOPE全部NOT_RUN。一个T号是测试组，不是一条断言。

| FR | 当前主题 | 范围 | 业务目标 | 用户任务 | 工作包 | 测试组 | 产品执行 |
|---|---|---|---|---|---|---|---|
| FR-01 | 快速建档与多角色 | IN_SCOPE | B01/B02 | J01 | DEV-03 | T01 | NOT_RUN |
| FR-02 | 来源、接收依据与字段核验 | IN_SCOPE | B02/B03 | J01/J04 | DEV-03 | T02 | NOT_RUN |
| FR-03 | 导入预览、去重与受控合并 | IN_SCOPE | B01/B02 | J01 | DEV-03/DEV-07 | T03 | NOT_RUN |
| FR-04 | 字典、状态与资料新鲜度 | IN_SCOPE | B02 | J02 | DEV-03 | T04 | NOT_RUN |
| FR-05 | 外部人才自助更新 | DEFERRED | — | — | — | T05 | DEFERRED |
| FR-06 | 私有上传与文件一致性 | IN_SCOPE | B02/B03 | J01 | DEV-04 | T06 | NOT_RUN |
| FR-07 | 内部预览与安全衍生文件 | IN_SCOPE | B03 | J01/J04 | DEV-04 | T07 | NOT_RUN |
| FR-08 | 作品集与真实署名 | IN_SCOPE | B02 | J04 | DEV-05 | T08 | NOT_RUN |
| FR-09 | 轻量项目、参与事实与内部复盘 | IN_SCOPE | B02/B04 | J04 | DEV-05 | T09 | NOT_RUN |
| FR-10 | 独立对外案例与商业展示 | DEFERRED | — | — | — | T10 | DEFERRED |
| FR-11 | 内部用途、额外使用许可与限制 | IN_SCOPE | B03 | J01/J05/J06 | DEV-03/DEV-07/DEV-08 | T11 | NOT_RUN |
| FR-12 | 内部停用、期限与依赖失效 | IN_SCOPE | B03 | J06 | DEV-04/DEV-07/DEV-08 | T12 | NOT_RUN |
| FR-13 | 归档、保留与受控删除 | IN_SCOPE | B03/B05 | J06/J07 | DEV-07 | T13 | NOT_RUN |
| FR-14 | 结构化检索与证据解释 | IN_SCOPE | B01/B04 | J02 | DEV-06 | T14 | NOT_RUN |
| FR-15 | 内部候选清单与协作备注 | IN_SCOPE | B01/B04 | J03 | DEV-06 | T15 | NOT_RUN |
| FR-16 | 客户外部访问及受控分享链接 | DEFERRED | — | — | — | T16 | DEFERRED |
| FR-17 | 客户在线反馈 | DEFERRED | — | — | — | T17 | DEFERRED |
| FR-18 | 四类有界 AI 辅助任务 | IN_SCOPE | B01/B06 | J01/J02/J05 | DEV-08 | T18 | NOT_RUN |
| FR-19 | 有证据的 AI 建议与一次原子采纳 | IN_SCOPE | B02/B06 | J05 | DEV-08 | T19 | NOT_RUN |
| FR-20 | AI 数据、配置、预算及未知请求 | IN_SCOPE | B03/B06 | J05/J07 | DEV-08 | T20 | NOT_RUN |
| FR-21 | 官网公开投影与发布审核 | DEFERRED | — | — | — | T21 | DEFERRED |
| FR-22 | 内部中英文本及来源版本 | IN_SCOPE | B02/B06 | J05 | DEV-05/DEV-08 | T22 | NOT_RUN |
| FR-23 | AnqiCMS 自动同步与发布 | DEFERRED | — | — | — | T23 | DEFERRED |
| FR-24 | 官网下架、缓存与远端对账 | DEFERRED | — | — | — | T24 | DEFERRED |
| FR-25 | SEO/GEO 页面与搜索标记 | DEFERRED | — | — | — | T25 | DEFERRED |
| FR-26 | 内部账号、权限及运行主体 | IN_SCOPE | B03/B05 | J07 | DEV-01 | T26 | NOT_RUN |
| FR-27 | 审计、敏感读取与变更记录 | IN_SCOPE | B02/B03 | J06/J07 | DEV-01 | T27 | NOT_RUN |
| FR-28 | 本地幂等与持久任务 | IN_SCOPE | B05 | J01/J05/J07 | DEV-02 | T28 | NOT_RUN |
| FR-29 | 内部 JSON 导出、重建与迁移 | IN_SCOPE | B05 | J07 | DEV-07 | T29 | NOT_RUN |
| FR-30 | 部署、备份、恢复及维护交接 | IN_SCOPE | B05 | J07 | DEV-09/DEV-10/DEV-11 | T30 | NOT_RUN |

## 4. 当前24项重点内部故障/对抗用例

这些是原审查回填后的实现验收，不代表本轮运行过。涉及云端/AI的实测在隔离获准环境执行；Local或Mock通过不能写成供应商通过。

| ID | 情景 | 必须断言 | 工作包 | 测试组 | 状态 |
|---|---|---|---|---|---|
| AT-01 | 回执顺序、请求摘要和CAS | 同key同请求重放；改payload冲突；新key旧revision冲突；JCS向量一致 | DEV-02 | T28 | NOT_RUN |
| AT-02 | 权限撤销后旧回执 | 停用/收窄权限后不能借回执拿历史敏感结果；已删对象仅获准处置头 | DEV-01/DEV-02 | T26/T28 | NOT_RUN |
| AT-03 | 错误父子和关联 | 同空间但属于另一个作品/清单的子项被拒；路径parent不可被body覆盖 | DEV-05/DEV-06 | T08/T15 | NOT_RUN |
| AT-04 | staging重放覆盖 | 最终对象已检后改staging，READY字节与摘要不变 | DEV-04 | T06 | NOT_RUN |
| AT-05 | 并发上传配额 | 并发超数量/字节准入时拒绝；续签不加额度；取消/失败释放一次 | DEV-04 | T06 | NOT_RUN |
| AT-06 | 声明与实际大小不符 | 实际超大对象不得进入复制/昂贵解析；云端能否硬限另记PROVIDER_NOT_RUN | DEV-04 | T06 | NOT_RUN |
| AT-07 | 取消/暂停后晚到文件 | 迟到封存只形成私有待清理物，不变READY、无匿名地址 | DEV-04 | T06/T12 | NOT_RUN |
| AT-08 | 缩略图/原件/Range越权 | 每条字节路径同范围；下载原件需额外权限；不把签名存日志 | DEV-04 | T07/T26 | NOT_RUN |
| AT-09 | 停Worker跨用途截止时间 | 到期后读取/导出/AI按时钟拒绝，不等待定时状态变更 | DEV-03/DEV-07/DEV-08 | T11/T12 | NOT_RUN |
| AT-10 | 非许可安全变化 | 隔离、范围收窄、源暂停的epoch影响语言文本/清单/导出/AI | DEV-04/DEV-07 | T12 | NOT_RUN |
| AT-11 | 旧导出失去行或字段权限 | 生成后收窄scope/sensitive权限，旧文件整件拒下载；另建新导出 | DEV-07 | T29 | NOT_RUN |
| AT-12 | 导出/AI发起者停用 | 代表人处理的任务拒继续；删除/清理不因原申请人停用而停止 | DEV-07/DEV-08 | T12/T29 | NOT_RUN |
| AT-13 | 删除不可变或衍生内容 | JSON/AI/语言文本/预览/索引都受处置；payload可ERASED，不保留无依据原文 | DEV-07 | T13 | NOT_RUN |
| AT-14 | 空安装和首次完整录入 | 仅空库bootstrap；无文件source→inline建人→上传→作品；正常重置旧会话失效 | DEV-01/DEV-03/DEV-04 | T01/T02/T26 | NOT_RUN |
| AT-15 | 最小用途和条件执行 | 无公开许可不挡内部草稿；无AI许可不发模型；禁止裁切/署名约束按计划执行 | DEV-03/DEV-04/DEV-08 | T11 | NOT_RUN |
| AT-16 | AI发送边界故障 | 在Attempt提交前/后、HTTP到达后、结果落库前逐点杀Worker；未知不另起发送 | DEV-08 | T20 | NOT_RUN |
| AT-17 | AI预算并发和未知费用 | 仅够一任务额度时并发预留不透支；UNKNOWN/取消不盲释放；收费异常如实记账并停发 | DEV-08 | T20 | NOT_RUN |
| AT-18 | Provider/存储配置变化 | 新Provider配置使批准失效；旧AI不改发；存储老locator不改到新桶 | DEV-04/DEV-08 | T06/T20 | NOT_RUN |
| AT-19 | 提示注入与多余字段 | 恶意来源只当数据；模型无工具/SQL权；额外敏感字段及无来源事实不能采纳 | DEV-08 | T18/T19 | NOT_RUN |
| AT-20 | 建议一次采纳与并发 | 多选一次APPLIED，余项discarded；第二新key拒；源revision改变则STALE | DEV-08 | T19 | NOT_RUN |
| AT-21 | 内部语言版本 | 事实/中文改动不会静默覆盖英文；安全限制会阻断依赖文本 | DEV-05/DEV-08 | T22 | NOT_RUN |
| AT-22 | 合并不会扩权 | 同名/同电话不自动合并；账号/许可/受限范围不合并；无法证明冲突则不执行 | DEV-07 | T03 | NOT_RUN |
| AT-23 | 恢复缺口 | 旧库含已停用成员、已删除材料、旧AI任务；入口隔离、会话失效、未知区间重新核实 | DEV-09 | T30 | NOT_RUN |
| AT-24 | 纯内部范围与无AI人工闭环 | 无CMS/分享域/公开桶配置仍启动；无公开API/菜单；关闭AI可建档找人记项目；无CSV下载 | DEV-10 | T01/T09/T14/T26/T30 | NOT_RUN |

## 5. 必跑内部旅程

J-OS-01：空安装→ADMIN→编辑激活→有据来源/草稿→上传→作品→项目→检索/内部清单，关闭AI也能完成。

J-OS-02：两个不同范围的内部账号，交叉检查人物/作品/源文/预览/计数/旧导出，任何关联不扩大可见范围。

J-OS-03：四类AI→来源对照→多选一次接受；包含源变化、注入、计费未知和配置变化。

J-OS-04：删除/隔离源→相关语言文本/AI缓存/导出受限→旧备份恢复→会话无效/未知缺口重核。

J-OS-05：JSON导出10人才/3作品/1项目在隔离空间重建；稳定关系与来源可解释；没有商业/网站表仍可工作。

## 6. 旧开发任务退出映射

旧D编号仅追踪历史，不再是Agent执行指令。

| 旧任务 | v0.3处理 |
|---|---|
| D00 | DEV-00 |
| D01 | DEV-01 |
| D02 | DEV-02 |
| D03 | DEV-04 |
| D04 | DEV-03 |
| D05 | DEV-05 |
| D06 | 收窄为DEV-03/07/08的内部依据/额外用途；无全球权利清点 |
| D07 | DEV-06 |
| D08 | 收窄为DEV-06内部清单；客户不可变版本延期 |
| D09 | 客户分享延期，无当前工作包 |
| D10 | 客户在线反馈延期，无当前工作包 |
| D11 | 替换为M1人工内部旅程及DEV-10总体测试；不含客户侧 |
| D12 | 内部语言文本归DEV-05；CaseStudy/公开审核延期 |
| D13 | DEV-08，四类内部AI仍在一期 |
| D14 | CMS调查/适配延期 |
| D15 | 官网发布/公开媒体/互链延期 |
| D16 | 官网撤回延期；内部停用失效归DEV-07/08 |
| D17 | DEV-07；JSON迁移保留，客户PDF/CSV下载延期 |
| D18 | DEV-09，仅内部与AI/导出恢复 |
| D19 | DEV-10；全部官网/客户断言退出当前验收 |
| D20 | DEV-11；不要求流量或页面数 |

## 7. 更早52项验收的归属

保留原编号和关注点。`PARTIAL_INTERNAL`指仅适用内部的部分进入当前测试；原外部子条款延期，不将其伪装已验收。`DEFERRED`无本期执行要求。全部保留测试仍NOT_RUN。

| 历史ID | 原关注点 | 本版归属 | 当前对照 |
|---|---|---|---|
| LEGACY-AC-01 | Person不等于登录账号 | INTERNAL_NOT_RUN | T01/T26 |
| LEGACY-AC-02 | 同人多角色 | INTERNAL_NOT_RUN | T01 |
| LEGACY-AC-03 | 同名不自动合并 | INTERNAL_NOT_RUN | T03 |
| LEGACY-AC-04 | 内部草稿允许缺字段 | INTERNAL_NOT_RUN | T01 |
| LEGACY-AC-05 | 私密联系信息拒绝访问 | INTERNAL_NOT_RUN | T26 |
| LEGACY-AC-06 | 停用后旧会话失效 | INTERNAL_NOT_RUN | T26 |
| LEGACY-AC-07 | 跨空间对象ID | INTERNAL_NOT_RUN | T26/T19 |
| LEGACY-AC-08 | expectedRevision冲突 | INTERNAL_NOT_RUN | T01/T28 |
| LEGACY-AC-09 | 导入同键幂等 | INTERNAL_NOT_RUN | T03 |
| LEGACY-AC-10 | 批次部分失败可处理 | INTERNAL_NOT_RUN | T03 |
| LEGACY-AC-11 | MIME伪装拒绝 | INTERNAL_NOT_RUN | T06 |
| LEGACY-AC-12 | 大小及恶意文件限制 | INTERNAL_NOT_RUN | T06/T07 |
| LEGACY-AC-13 | 同文件不同来源授权 | INTERNAL_NOT_RUN | T06/T11 |
| LEGACY-AC-14 | 多作者真实署名 | INTERNAL_NOT_RUN | T08 |
| LEGACY-AC-15 | 外部品牌不算ONCE客户 | PARTIAL_INTERNAL | T08/T09；公开案例延期 |
| LEGACY-AC-16 | 历史项目完成证据 | PARTIAL_INTERNAL | T09；公开案例延期 |
| LEGACY-AC-17 | 仅内部用途不可公开 | PARTIAL_INTERNAL | T11/AT-24；公开输出延期 |
| LEGACY-AC-18 | 缺第三方必要许可 | PARTIAL_INTERNAL | T11/AT-15；完整公开权利方核查延期 |
| LEGACY-AC-19 | 到期不依赖定时任务 | INTERNAL_NOT_RUN | T11/T12 |
| LEGACY-AC-20 | 检索和统计同范围 | INTERNAL_NOT_RUN | T14/T19 |
| LEGACY-AC-21 | 未知预算与档期不伪匹配 | INTERNAL_NOT_RUN | T14 |
| LEGACY-AC-22 | 受邀人才不能读别人 | DEFERRED | — |
| LEGACY-AC-23 | 外部提交先待审 | DEFERRED | — |
| LEGACY-AC-24 | 分享到期和撤销 | DEFERRED | — |
| LEGACY-AC-25 | 口令限流与日志无秘密 | PARTIAL_INTERNAL | T27；客户口令延期 |
| LEGACY-AC-26 | 反馈不生成订单 | DEFERRED | — |
| LEGACY-AC-27 | 反馈固定版本 | DEFERRED | — |
| LEGACY-AC-28 | AI建议有证据 | INTERNAL_NOT_RUN | T18/T19 |
| LEGACY-AC-29 | 提示注入无执行权 | INTERNAL_NOT_RUN | T18/T20 |
| LEGACY-AC-30 | 预算超时可手工继续 | INTERNAL_NOT_RUN | T20 |
| LEGACY-AC-31 | 过期AI建议不得覆盖 | INTERNAL_NOT_RUN | T19 |
| LEGACY-AC-32 | 禁止照片猜身份国籍 | INTERNAL_NOT_RUN | T18/T20 |
| LEGACY-AC-33 | 不允许AI处理则不发出 | INTERNAL_NOT_RUN | T11/T20 |
| LEGACY-AC-34 | 新增字段不自动泄露 | PARTIAL_INTERNAL | T26/T20/T29；公共DTO延期 |
| LEGACY-AC-35 | 中英分别审核 | PARTIAL_INTERNAL | T22/AT-21；公开批准延期 |
| LEGACY-AC-36 | 内部变化不静默改已发 | PARTIAL_INTERNAL | T29；已发客户版本延期 |
| LEGACY-AC-37 | 中英远端ID分离 | DEFERRED | — |
| LEGACY-AC-38 | 远端已建响应丢失 | DEFERRED | — |
| LEGACY-AC-39 | 重复发布不多建 | DEFERRED | — |
| LEGACY-AC-40 | 撤回后旧任务不能覆盖 | PARTIAL_INTERNAL | T12/T28；CMS乱序/墓碑延期 |
| LEGACY-AC-41 | CMS及缓存失败可见 | DEFERRED | — |
| LEGACY-AC-42 | 元数据与像素隐私 | PARTIAL_INTERNAL | T07；公众像素隐私发布审查延期 |
| LEGACY-AC-43 | CMS人工改动漂移 | DEFERRED | — |
| LEGACY-AC-44 | 合并删除影响追踪 | INTERNAL_NOT_RUN | T03/T13/T29 |
| LEGACY-AC-45 | 无AI完整业务旅程 | INTERNAL_NOT_RUN | T18/T30 |
| LEGACY-AC-46 | Worker崩溃恢复 | INTERNAL_NOT_RUN | T28 |
| LEGACY-AC-47 | 旧库恢复不复活撤回 | INTERNAL_NOT_RUN | T30/T15 |
| LEGACY-AC-48 | 公开双语SEO规则 | DEFERRED | — |
| LEGACY-AC-49 | 日志无敏感秘密 | INTERNAL_NOT_RUN | T27 |
| LEGACY-AC-50 | 性能测量环境约定 | INTERNAL_NOT_RUN | T30；按12新负载目标，不继承旧SLA |
| LEGACY-AC-51 | 开放导出关系且无秘密 | INTERNAL_NOT_RUN | T29 |
| LEGACY-AC-52 | 新系统不依赖SRVF业务 | INTERNAL_NOT_RUN | T26/T28/T30 |

## 8. 旧26条RT的迁移

| 历史ID | 当前处理/测试 |
|---|---|
| RT01 | AT-09；客户分享部分延期 |
| RT02 | 对外多方许可流程延期；内部用途边界AT-15 |
| RT03 | AI用途AT-15；全球发布地域判断延期 |
| RT04 | 内部依赖AT-10/13；两个语言页面/客户包撤回延期 |
| RT05 | 公开批准与CMS失败延期 |
| RT06 | 内部版本T19/T22；公开审核摘要延期 |
| RT07 | CMS旧generation晚到延期 |
| RT08 | CMS创建未知结果延期；不拿AI用例冒充已测CMS |
| RT09 | AT-04 |
| RT10 | T07/AT-15；公开像素审查延期 |
| RT11 | 内部下载AT-08/11；客户快照过滤延期 |
| RT12 | 认证秘密一次呈现T26；分享签发延期 |
| RT13 | T26内部Origin/CSRF仍测；分享越权延期 |
| RT14 | AT-22 |
| RT15 | AT-23 |
| RT16 | T26/T30与DEV-00来源边界检查 |
| RT17 | AT-20 |
| RT18 | AT-16/17 |
| RT19 | AT-03/08/11与T14 |
| RT20 | T28本地回执/202；CMS外部效果延期 |
| RT21 | T28/DEV-09内部清理/租约；官网撤回队列延期 |
| RT22 | DEV-10/11证据纪律；文档检查不是产品通过 |
| RT23 | CMS漂移和语言互链延期 |
| RT24 | AT-08/11当前私有访问余寿；客户/官网副本延期 |
| RT25 | AT-24；反馈部分延期 |
| RT26 | AT-19和T27/T29当前DTO；公共/客户序列化延期 |

## 9. 执行证据格式

每条记录testId、commit、环境/依赖、测试文件、执行命令、输入类型（合成/脱敏/获准）、结果、日志证据、未覆盖范围。NOT_RUN、MOCK_ONLY、DB_TESTED、PROVIDER_VERIFIED不能互相替代。不允许“未实现但预留”记PASS。

M1的内部试用可先于AI完成；完整一期声称完成需M2/M3当前需求也验收。外部网页功能DEFERRED不作为失败项；以后恢复需求时新建对应阶段和测试，不复用本轮内部测试来给它背书。
