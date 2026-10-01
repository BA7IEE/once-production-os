## PR-03E finalization：删除竞争与配置保留期（待复核）

删除权候选窗口收口：Prisma SQL与MemoryStore在LIMIT32之前排除已由显式删除占用、尚无TTL intent的素材；事务内最终归属复查仍保留。新增真实反例以32个被占用素材和独立ENROLL素材验证，不生成占用项的intent，也不会让它们反复占满窗口。最新完整本地回归：Core **684/684**、PostgreSQL **77个程序/167项**、Browser **12/12**（含media-purge），真实pg_dump/restore及空库68迁移通过。证据见本轮 `candidate-window/`；无schema/新迁移，最终新head完整CI另绑定PR与交付回复。

CI 最终预算补充：1a39a05的运行36894916997中，media-purge也因前置下载耗时在浏览器阶段触及20分钟job上限（原始annotation已核对）。单job调整不足以覆盖共同环境瓶颈；现统一12个Browser job总预算为30分钟，数据库job及每个测试命令、断言、浏览器单步超时均不变。证据见本轮 `ci-browser-budget.json`，最终新head仍完整重跑13项。

CI 环境补充：81d4b30 的运行36889529259有12项成功；media-staging两次因Ubuntu镜像下载缓慢，在ffmpeg安装阶段触及20分钟job上限，浏览器未执行。核对日志及annotation后，仅将该job总时限改为30分钟，全部验证步骤和断言不变；失败证据见本轮 `ci-infrastructure.json`。业务源码与已完成本地测试的摘要仍一致，最终新head完整CI另行核实，不沿用前一head成功结果。

基线7016c4d；A–D保持FROZEN。两项阻塞已修复，PR #31继续Draft、未合并、未部署，本轮无schema或新增迁移，迁移1–68逐文件不变。

显式finalization取得租约时，同事务把无有效lease的ELIGIBLE/CLAIMED转SKIPPED，记录EXPLICIT_DELETION_TAKEOVER；有效TTL lease和DELETE_PENDING/UNKNOWN/CONFIRMED必须等待。TTL创建计划前检查显式删除归属，旧ERASED悬空可撤销计划终结且不调用provider，完整性检查拒绝ERASED上的可重试计划。显式provider I/O期间每10秒续租30秒lease，调用前后复核；35秒真实等待反例中第二finalizer不能取得删除权。本人上传改用统一mediaRetention.draft，1天和30天配置均经Portal API与READY全链验证。

本轮Core **683/683**；真实PostgreSQL **76个程序 / 166项**；原11组Browser + media-purge共 **12/12**；真实pg_dump/restore、68次空库迁移、保留库无待迁移且92张表摘要不变；类型、契约、构建、静态检查及额外媒体/验收测试均通过。完整日志及页面证据见 `artifacts/talent-experience-pr03-cleanup-finalization/verification.json`。精确head CI结果另绑定PR描述与交付回复，通过前不声明DEVELOPMENT FROZEN；本轮交回复核，不推进后续业务。Provider/COS/物理手机/生产迁移仍NOT_RUN。

以下为历史记录。

## 2026-10-01：PR-03E 回收与 PR-03 总收口（Draft、未合并、未部署）

本轮本地 Core **677/677**，完整 PostgreSQL **70个程序 / 160项**，原11组Browser及新增清理Browser均通过，最终68迁移另复跑完整清理旅程；checkpoint17项、静态12项、类型/契约/构建均通过。恢复末次门禁另由真实PG复跑，CI须绑定最终head。

A–D已由用户冻结，基线ff6e10f。本轮接通独立清理计划、逐对象UNKNOWN核对、确认物理删除后归还容量、审核竞争、显式删除交接和恢复隔离。新增前向迁移67–68，1–66未改；67应用后不回写，68补强JSON空值拒绝和对象身份不可变；保留库66→67的91张旧表内容摘要不变。完整合同、40项验收映射及限制见 [PR03E_ACCEPTANCE.md](PR03E_ACCEPTANCE.md)，本轮实测汇总见 `artifacts/talent-experience-pr03-cleanup/verification.json`。最终head CI另绑定PR描述和交付回复，通过前不宣称DEVELOPMENT FROZEN。Provider/COS/物理手机/生产迁移仍NOT_RUN，不进入PR-04等后续业务。下方为历史切片记录。

## PR-03D finalization：LINK 边界、Work 同意与历史署名接手

本轮本地验证：Core 643/643；PostgreSQL 60个测试程序、150项通过，关键反例另行复跑；11组真实Chrome通过，最终页面另复跑 Work/Production 两组。契约260路由、静态12项、checkpoint 17项通过。最终CI以交付回复和PR描述中绑定最终SHA的记录为准。

基线 `280568c36cccf5a724515b1b57f32c1b0347b320`。主体复核通过，本轮仅修三项；PR #31 保持 **Draft、未合并、未部署**，PR-03D 尚未冻结，不进入 PR-03E。

1. **LINK 不编辑共享案例。** LINK_EXISTING 分支在署名处理后直接返回，不进入 WorkAsset 写入、排序或封面逻辑。本批媒体可单独 ADOPTED，但不会挂入目标 Work。CREATE_NEW 仍按本批冻结计划建立素材关系。
2. **独立 Work 同意版本。** 新增 `internal-directory-media-work-2026-10-v1`，明确覆盖媒体及案例标题、简介、时间、地点、行业/类型、品牌展示名、本人署名事实，fieldScope 含 `media` 和 `work`。旧 `internal-directory-media-2026-10-v1` 常量、文案和能力不变，不为历史行追补 work。普通媒体/Collection 接受两种媒体能力版本，Work 保存/提交/审核必须当前 Work capability。Portal 独立勾选并确认，未确认前禁用案例编辑；服务端仍是最终校验。
3. **已有署名接手。** LINK 遇到当前 Person+Role 的 exact Credit 时，不修改 ID、revision、Source、Note，不新增重复署名，只在明确审核后生成当前 Grant 的 workCredit exposure。曝光记录绑定本次 consentId，读取时复查账号、人物、Grant、Consent、来源及删除/恢复保护。撤回新同意立即关闭该 Talent 自助投影，不撤销独立内部来源的旧事实。

legacy Credit 保持 fail-closed：LINK 返回 `WORK_CREDIT_UPGRADE_REQUIRED`。新增内部 `POST /works/{id}/credits/upgrade` COMMAND 和后台“核对并升级旧署名”操作：requires records.write + sources.review，拒绝 MACHINE；明确 creditId、PersonRole、独立内部来源及各对象版本，同一人物/roleCode/当前职业/来源/范围全部核对。保留旧 Credit ID、Note，补 personRoleId/sourceId，推进 Credit/Work revision。原键重放和审计同事务；升级不自动开放本人权限，仍须后续 LINK 审核。已有 exact Credit 不允许重复升级或偷偷改来源。

**无 schema 变化、无迁移67。迁移1–66逐文件保持原样。** 现有 Credit nullable 字段、Consent fieldScope、Grant JSON manifest 可以完整表达；不是省略数据库约束，现有复合 FK/唯一约束继续验证。新 command 沿用统一回执、审计、write-ahead、replay-policy。

普通 JSON 的 Work 使用依据使用 `talent-basis-v2`，加入 work scope；旧 v1 仍可读取，但不能携 work scope 冒充 Work 同意。重建验证新文本版本，不生成 TalentAccount/Grant/Submission。已存在内部 Credit 被接手时，原 Credit Source/归因不改，本次审核与同意只作为新的 exposure 依据。备份恢复沿用既有 Grant 隔离。

本轮 Core/真实PG/11组Browser、页面截图、失败记录及冻结迁移指纹在 `artifacts/talent-experience-pr03-work-finalization/verification.json`。最终 SHA/CI 绑定 PR 描述和交付回复，不沿用基线通过结果。Provider/COS/物理手机/部署仍 NOT_RUN。

## PR-03D Work / 作品案例（Draft，待代码级复核）

PR-03A/B/C 已由用户冻结，基线 `7909fa204de15224ae7f1f7bb43b88a285d37dc9`。本轮只实现作品案例；未合并、未部署，Provider/COS/真实手机验证仍 `NOT_RUN`。不进入 PR-03E 自动回收或 PR-04 Agent 摄取。

### 业务与模型

复用 Work、WorkCredit、WorkAsset、Source、Person、PersonRole 和现有媒体上传/采纳链。Portfolio 仍是独立 MediaCollection；不要求集合素材先创建 Work，不创建 TalentWork 或 Project。本人新案例固定 `EXTERNAL`，不代表 ONCE 承接项目。Work 已有 title/description/industryCode/workTypeCodes/originNote、状态及封面；仅补 `caseDate/datePrecision/location/brandDisplayName`。年份、月份、日期、大致时间和未知分别表达，未知不补日期。品牌采用展示名：已有 ProjectParty 不能冒充 Work 品牌，未扩企业主体或 CRM。

WorkCredit 新增精确 personRoleId 与独立 sourceId，旧署名保留原 ID 和 Work 来源继承语义。当前新署名必须同 workspace、同 Person、同 roleCode，并有正式来源。职业停用只停止当前展示/筛选，不删除历史。Work Source、Credit Source 和素材 PersonMedia Source 分别授权；其中一个失效不删除其他来源的记录或原件。

### 提交和审核

新增严格 `WORK` Submission plan。`CREATE_EXTERNAL_WORK` 新建外部案例；`LINK_EXISTING_WORK` 可提出关联申请，Portal 不开放作品库。本人明确获准的现有案例可带 targetWorkId/expectedWorkRevision 维护自己的 Credit。所有 target/Person/Role/Asset 读取复查当前账号、Claim/Grant 和 exposure。

审核员必须逐项选择 CREATE_NEW / LINK_EXISTING、目标版本与审核依据。新建在同一事务建立 Source/归因/用途依据、Work、本人 Credit、媒体采纳和关系、Grant exposure；审核审计失败全部回滚。ENROLL 草稿不建立假 Person/Role/Work，批准时才按声明职业建立正式角色。关联共享 Work 不覆盖标题、时间、品牌、封面或其他署名；本人的不同声明保留在冻结 Submission。相同命令键精确重放，新的键审核终态返回 SUBMISSION_CLOSED。

LINK 的草稿保存 Work 依赖事实摘要和本人 Credit 版本。审核请求仍带当前 Work revision，非依赖的版本变化允许审核员重新确认；公共事实变化或本人 Credit 被改，返回 WORK_NEEDS_REBASE / WORK_CREDIT_NEEDS_REBASE。不是任何 revision 变化都拒绝，也不无视并发。

### 媒体、自助开放和页面

复用 SUBMISSION_STAGED_ASSET / EXISTING_ADOPTED_ASSET_REFERENCE；只接受本批 READY 暂存素材或当前明确 exposure 的正式素材。案例接受图片与 MP4，PDF 明确拒绝，不 OCR/转码。审核依赖媒体须整组采纳。WorkAsset 只建立引用，同一原件可在多个 Work 与 Collection 复用；移除关系不 RETIRE Asset、不删 PersonMedia/CollectionItem/源字节。

封面使用已有 coverEntryId，必须本 Work 的图片。删除封面后清空，不自动改选下一张；无静态图片不伪造封面。自助开放使用 grant-bound `workCredit/OWN_WORK_CASE`，摘要绑定当前 Grant/Account/Person 保护版本、Work 明确事实和本人 Credit；媒体另外要求自己的精确 exposure。不会暴露其他 Credit、人物、客户、Project、来源原文或内部备注。

Portal 提供服务器案例草稿、职业/行业/类型、时间精度、照片视频选择、排序和封面，刷新可继续。审核界面呈现业务字段和明确新建/关联动作。人物主详情提供封面、标题、品牌、时间、本人角色和照片/视频数量的案例卡片及详情。

### 数据库和生命周期

- 64 `202610010009_work_cases`：Work 缺失字段、Credit 精确职业/来源 FK、唯一约束、WORK 冻结插入守卫。
- 65 `202610010010_work_optional_cover`：首次保留的合成库实跑发现旧 ACTIVE 强制封面约束，前向移除；原同 Work 封面 FK 保留。
- 66 `202610010011_work_export_fields`：PG 实测发现旧导出字段白名单，前向增加四个案例字段；已有许可不会自动扩权。
- 迁移 1–63 未改写，64/65 实跑后也以新迁移修正，未 db push 或清库。

Person 删除阻断本人案例/素材，Work 删除仅处理关系；Source 删除纳入独立 Credit，Work 擦除同步清空新字段。普通旧 Credit 合并沿用现有映射；精确 Role 不可安全映射时 fail-closed，暂存 Submission 不跟随迁移。恢复完整性摘要纳入 Work/Credit/WorkAsset/SubmissionItem，检查精确职业、来源、封面和唯一关系。

普通 JSON 仅导出获准正式事实、署名和原件；精确署名要求随同迁移 PersonRole/独立来源。共享原件只生成一条合并字段的导出依赖，重建可恢复 WorkAsset 和图片封面，不能用身份元数据伪造文件。JSON 不重建 TalentAccount/Grant/Submission。物理 pg_dump/restore 保留完整关系，恢复隔离仍撤销 session/grant/exposure、隔离原件，不复活旧授权。

### 验证与剩余

最终本地结果、反例清单、页面截图、原始日志及迁移指纹记录在 `artifacts/talent-experience-pr03-work-cases/verification.json`。Core、真实 PG、全部浏览器及最终 head CI 逐项记录，旧通过记录不代替本轮结果。完整验收映射见 `PR03D_ACCEPTANCE.md`。

本轮不宣称 PR-03 整体完成；停止在 PR-03D，等待代码级复核。真实 Provider/COS/物理手机、生产升级与部署未执行；PR-03E、PR-04、分享/官网/报价/排期均未实施。

# PR-03C finalization：本人开放权限与集合一致性（Draft，待复核）

基线 `d8e59f7ab70fdb5f55ea0aead0a2f54cef020579`。主体复核已通过，但本轮尚未冻结。PR #31 继续 **Draft、未合并、未部署**，不进入 PR-03D Work。

本轮五项修正：

1. 正式本人媒体与集合统一核对当前 TalentAccount、Claim/Grant/Person、selfExposureManifest 的具体版本/来源摘要，以及当前 Source/Role/用途、删除与恢复保护。本人投稿审核在同事务生成 exposure；内部来源须通过 `talent.grant.mediaExposure` 明确批准。该内部 COMMAND 采用既有最小回执、审计、write-ahead、CAS、原键重放，审计失败整个授权回滚。集合开放不隐含开放全部 Item；归因不再充当权限。模拟未来 Agent 来源只模拟已采纳正式关系，保留真实上传人，不开放机器上传。
2. 已归档标签重新启用、现有标签再次确认，均使用本次正式 Source；追加 FieldEvidence，保留此前来源证据。
3. generic Tag create/patch 及字段建议落地推进父 Collection revision。本人保存并提交后，内部 Tag 改动使旧审核返回版本冲突，不覆盖后台修改。
4. 新 current 审核可将过期/SUSPENDED 旧来源的集合退出 current；仍检查旧 scope/删除保护，false 使用本次有效审核依据。隐藏旧 scope 全事务拒绝。
5. Collection type 与 Role 同为 identity。Portal draft、内部 save、generic patch 原地换类型统一 `409 COLLECTION_IDENTITY_CONFLICT`，字段建议也拒绝。页面锁定已有类型，换类型新建集合。

浏览器额外定位并修复同页并行编辑竞态：命令回执到达后继续锁定其他编辑区，直到服务器最新版本读回，避免媒体同意更新与集合保存之间使用旧版本。受控阻塞刷新请求的反例验证按钮保持禁用，然后正常保存；不靠延时或自动重试。

**没有 schema 变更、没有新增迁移；迁移1–63逐文件不变。** 既有 JSONB manifest 支持本次严格版本化 exposure。正式素材来源 B 的开放与 Person 主来源 A 分开检查，A 撤回不误杀仍合法的 B。

本轮最终本地实测：**Core 633/633；真实 PostgreSQL 50组/140项，另6组受影响场景复跑；10组真实Chrome；255条路由合同、类型检查、静态、构建、17项checkpoint通过。** 实际恢复13个文件/92602字节，旧Grant/session及exposure拒绝复活。

本轮真实结果和原始日志见 [实测汇总](../../artifacts/talent-experience-pr03-finalization/verification.json)、[验收映射](../../artifacts/talent-experience-pr03-finalization/acceptance-matrix.md)。CI 必须绑定最终 head，链接回填 PR #31 描述及交付回复，不借用基线 head 的通过记录。

生命周期沿用现有 Grant 清理：撤权、停用、合并、人物删除、恢复隔离均拒绝旧 exposure。来源撤回后本人原件/预览/每次 MP4 Range 立即重查；业务 JSON 导出/重建不包含账号/Grant/manifest；真实 pg_dump/restore + 私有字节恢复检查 manifest 清空、Grant/session 失效。

`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`。本轮没有 Work、客户分享、官网、机器摄取或完整暂存回收调度。下面保留主体阶段与更早切片的历史证据，不以其数字替代本轮实测。

---

# PR-03C：媒体集合（Draft，待复核）

PR-03A/03B 已由用户复核冻结，基线 `2c29e6819b3a1bcced4bd172777050415230c684`。本轮复用现有 MediaCollection / MediaCollectionItem / MediaCollectionTag，PR #31 继续 **Draft、未合并、未部署**；PR-03整体未完成。不进入 PR-03D Work。

## 模型与规则

追加 **迁移63 `202610010008_media_collections`**：原模型没有独立集合封面和当前版本，故只增 `coverAssetId`、`isCurrent`；标签增加 ACTIVE/ARCHIVED 以保留移除历史。没有重建集合表，迁移1–62不改。cover 通过延期复合 FK 指向本集合 Item 的 assetId；旧 FK 继续约束 workspace/Person/Role，原唯一约束限制重复 Asset/orderIndex。部分唯一索引保证每个 Person + 可空 Role + 类型仅一个当前版本；新版本把旧版本取消当前，保留历史。

正式 Item 只能使用 READY + ADOPTED 的同一 Person 素材。Person 通用素材可进入精确 Role 集合；精确 Role 素材只能进入同一 Role，不能借给另一职业或无 Role 集合。新本人素材检查 PersonMedia、当前 Source/用途、Role、删除与恢复保护；旧 INTERNAL_SOURCE 的精确 Person 归属兼容，旧独立来源文件首次加入集合建立显式 PersonMedia 关联，不改原上传归属。删除人物不会因此误删独立来源原件。

MODEL_CARD 接受照片/PDF；PDF 为受控私有附件，不解析/OCR/生成封面。POLAROIDS 只收照片；PORTFOLIO/OTHER 可照片和 MP4；SHOWREEL/INTRO_VIDEO 为 MP4，复用现有 Range 播放。封面必须明确选本集合图片，不改人物总封面，不复制字节。完整 ordered items 一次提交，CAS + Commands 幂等；移出 Item 不退休/删除 Asset。内容标签仍为原8个 code，版本化目录检查重复、未知和停用新增值，历史标签保留。

## 本人草稿、审核与正式读取

`TalentSubmissionItem.kind=COLLECTION` 保存服务器集合方案：目标集合与 expectedCollectionRevision、Role、类型、名称、current、cover、tags、完整顺序/caption/featured。引用明确区分 `SUBMISSION_STAGED_ASSET` 与 `EXISTING_ADOPTED_ASSET_REFERENCE`。前者只允许本次 Submission 新文件；后者必须当前 TalentAccount + 活跃 Grant/Claim + grant-bound selfExposureManifest 的明确版本 + 同 Person/兼容 Role + 正式 Source/用途有效，跨 Submission 复用同一 Asset ID/hash，不重新上传。未绑定 ENROLL 仍只能选择自己本次新素材。

DRAFT 可修改，SUBMITTED 冻结；集合依赖的新媒体条目必须一起批准。批准事务写正式来源/归因/用途依据，采纳媒体、集合、排序、标签、封面、当前版本和审核回执。任何审计或业务失败全部回滚。审核页显示文件名、新增/移出、旧新顺序、封面和标签差异，非 JSON diff。本人无正式集合直接写入口。

后台人才主详情提供媒体集合画廊和整理入口；Portal 支持保存、刷新继续、选择已明确开放的正式原件、调整顺序/封面/标签、提交和看正式结果。所有 Portal Person 读取继续核对当前账号和 Grant/Claim；切换账号后拒绝旧页读写。

集合投影逐 Item 复查正式授权：素材 Source A 撤回只隐藏 A，独立 Source B 素材仍保留；集合自身 Source 失效才使整集合不可用。封面失效返回空，不自动认定第一张为封面。

## 生命周期

- merge：安全的普通集合/Item/正式媒体关系迁到 canonical Person；未明确处理的精确 Role 冲突及 current 冲突拒绝合并，不转移 STAGED 草稿。
- deletion：预览与执行涵盖集合/标签/封面，人物保护立即阻断正式与本人读取；移出关系不删原件，物理删除仍走原依赖决定。全量旧来源删除回归保留独立来源原件。
- Source/Consent 撤回：逐项动态过滤；正式本人媒体读取不借原 intake scope，STAGED 仍严格审核接收范围。
- JSON export/rebuild：扩展原白名单，保留正式集合、顺序、cover/current、标签和来源关系；不带服务器草稿、账号、Grant。完整证据导出沿用原合同：不可读必需来源阻止该完整包，不伪造来源或悄悄导出草稿。
- 真实 pg_dump/restore + 私有原件恢复：保持集合/Item/Asset/Source、顺序封面与状态；恢复隔离撤销旧 session/Grant，原授权不复活。完整性检查增加封面归属、连续排序、重复原件、唯一当前版本及 Person/Role 兼容检查。

## 本轮实测与证据

本地最终结果：**Core 632/632、PostgreSQL 49组程序/139项、10组真实Chrome流程全部通过**；254路由合同、core/server/web/transport类型检查、静态检查、构建与17项checkpoint通过。实际恢复11个私有文件（73631字节），集合/顺序/封面/current完整，旧授权拒绝。

结果汇总见 `artifacts/talent-experience-pr03-collections/verification.json`，Core/PG/Browser 原始日志及截图同目录；不引用下方旧切片通过数字替代本轮。真实流程为 Nest + PostgreSQL + 异步媒体 worker + Chrome，360/390/430px 完成登录、上传、模卡排序与封面、保存刷新、审核、本人及主详情查看；额外覆盖 PDF 附件、素颜照多图、Portfolio 照片+视频、Showreel/介绍视频 H.264 播放和 seek。截图均为合成资料，不包含真实人才身份。

## 明确边界

`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`。浏览器手机宽度不等于真实手机验收。认证使用受控测试发送端；没有真实 COS 上线。STAGED 跨 Submission 继续 fail-closed，完整暂存回收调度仍属后续；不新增 Work 案例、客户分享、官网、机器摄取、HEIC/MOV、PDF OCR 或转码服务。

最终 commit / 精确 head CI 见 PR #31 描述及本次交付回复。以下内容保留旧切片历史证据，旧“尚未进入集合”范围已被本轮授权替代。

---

# PR-03：模卡、照片、视频、作品案例和本人多来源媒体维护

## 当前修正：ADOPTED 正式媒体授权

本轮只修复正式媒体依赖历史 intake scope 的问题。PR #31 **继续 Draft、未合并、未部署**，不进入 MediaCollection。修正基线为 `87ec47160a90680b97269f251a5f16668d34abf4`；**没有 schema、迁移、HTTP 请求或 DTO 变化，迁移1–62逐字节不改**。

- `formalRelationReadable` 是事务内共用判断：ADOPTED 的 PersonMedia 必须属于当前工作空间，正式 Person 可见且未删除/合并，指定 Role 属于该 Person、当前有效且来源可用，正式 Source 有当前用途依据与范围权限，Asset/关系未退休或删除。技术 READY 仍由预览、播放、图和导出消费者检查。
- 接线 `assetFor/listAssets/preview/playback`、TD2 `assetReadable`、作品/候选依赖、导出准备/执行/下载和合并预览。正式关系的 Person/Source 优先于不可变上传来源；原 Upload/Claim intake scope 既不额外限制 ADOPTED，也不能授予正式读取权限。
- STAGED 保留原 Submission/Upload intake scope、当前账号/Grant/Claim/Submission、人物保护和审核权限。旧 INTERNAL_SOURCE 没有显式正式关系时，保留原资产范围、来源和主来源一致性规则。
- 合并仍把全部申请历史纳入预览摘要并撤销外部授权；已终结邀请/Claim/Submission 的历史范围不再阻断正式媒体。当前申请、打开的 Submission、ACTIVE 邀请，以及任一合并根的 STAGED 文件仍检查接收范围。精确 Role 媒体迁移仍明确阻断，不自动换职业。

### 本轮反例与证据

Core/真实 PostgreSQL 共用三组：已绑定、未绑定 ENROLL、精确 Role。A 仅具 intake，B 仅具正式 Person/Source 范围；均为 ADMIN 以证明角色没有范围豁免。B 在 STAGED 阶段不可读，ADOPTED 后可读、导出、预览合并；A 不能仅凭历史 intake 读正式媒体。正式 Person/Source 收紧、Role 停用后同步拒绝直接读、列表、预览和 TD2 图。

真实 Chrome 360/390/430 使用独立内部会话与 Talent 会话，上传图片及 H.264 MP4，经真实异步 worker 生成 READY/STAGED 后审核。额外 ENROLL 同批两文件验证 A 可在专用审核路径看 STAGED 图片与 MP4 Range，正式采纳并配置 Person/Source 范围后，B 正常读取而 A 被拒绝；Range 核对206、Content-Range及原始字节。下一次请求重新检查正式 Source 范围。实际 pg_dump/restore 和私有文件恢复继续验证授权不复活。

本地完整 Core **625/625**、PG **43个TAP程序/133项**、最终新增共享场景 **3/3**、全部 **9组Chrome流程** 通过；typecheck/core/transport、248路由合同、静态检查及构建通过。实际备份恢复 **6个文件、46744字节**。最终结果、命令与统计见 `artifacts/talent-experience-pr03-formal-auth/verification.json`；截图、PG/Core/browser日志在同目录。最终 head 对应 CI run 回填 PR #31 描述，不引用旧 head 的通过记录。下文622项等数字是已复核底座历史证据，不能代替本轮结果。

首次CI `36831884657`（`6b60681`）的媒体、PG及其余浏览器通过，但生产流程末段AI用例的受控发送次数为0：同库真实worker仍在轮询AI任务，与受控SDK worker竞争。验收脚本现于真实媒体/导出/删除检查全部结束后等待后台worker退出，再运行受控AI用例；不修改业务AI、不取消断言、不增加重试或超时。单独保留首次失败证据，并以新head的完整CI作为最终结果。

**Provider 未验证**：`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`。MediaCollection/模卡/素颜照/Portfolio/介绍视频、完整暂存回收调度仍未开始，等待此修正复核。

## 已复核底座：媒体归属与暂存（87ec471）

PR #31 保持 **Draft、未合并、未部署**。本轮接续已复核视频切片 `2fb01a713b62fce9513bd15d5ed289e80adb4453`，实现 spec/15 §10.2–10.8 的媒体归属与暂存底座；PR-03整体尚未完成。PR-02已合并、开发冻结、未部署，真实认证 `PROVIDER_VERIFIED=NOT_RUN`。

### 数据与授权

- 新增 **迁移62 `202610010007_media_ownership`**；1–61不改。MediaUpload 的真实主体为 Membership 或 TalentAccount，数据库FK/XOR/CHECK验证归属。UploadContext区分INTERNAL_SOURCE/TALENT_SUBMISSION；AGENT_SUBMISSION只有保留类型及ServicePrincipal FK字段，数据库拒绝该分支，不存在机器摄取入口。
- PersonMedia记录personId、可选personRoleId、assetId、正式sourceId或submissionId、用途、usageState、revision/protectionEpoch、保留/退休/物理清理时间。本人新上传保留null原始sourceId，绝不创建假Source/Membership。
- 技术READY与业务STAGED正交。普通资产/TD2/目录/作品/候选/导出拒绝STAGED；本人和具备申请接收范围、档案范围及审核权限的员工使用专用路径。审核批准同事务创建Source、SourceAttribution/SourceUseBasis和ADOPTED关系，原Asset ID/hash/uploader不变。
- 内部ADOPTED读取通过正式Person/Role/Source关系授权；旧INTERNAL_SOURCE仍要求原主来源一致。普通Asset DTO的sourceId/personId指正式关系，originSourceId明确原始来源，保留旧内部DTO值，导出许可选择器可继续使用正式sourceId。
- 创建、接收、complete、worker claim/lease/heartbeat/finish逐阶段检查账号/Grant/Claim/Submission、DRAFT、媒体同意、recoveryEpoch、scope、删除保护与容量。账号切换后URL中的accountId和实际Talent Cookie不符即拒绝。

### 请求及页面边界

- `POST /portal/submissions/{id}/media-consent`：独立版本 `internal-directory-media-2026-10-v1`，不复用只包含文字的旧同意记录。
- `POST /portal/uploads`：`context={kind:TALENT_SUBMISSION,submissionId,personRoleId?}`、expectedSubmissionRevision、新文件元数据；account、Person、Grant、scope由服务端推导。旧内部`POST /uploads`兼容原合同及显式INTERNAL_SOURCE。unknown-fields reject不变；ENROLL不能传既有assetId。
- `GET /portal/uploads/{id}`、`PUT .../content`、`POST .../complete|cancel`、`POST /portal/assets/{id}/retire`。DRAFT可增删，SUBMITTED不得追加；单批最多100文件，处理全部结束后才可提交。
- 本人 `GET /portal/accounts/{accountId}/assets/{id}/preview|playback`；审核 `GET /talent-staged-assets/{id}/preview|playback`。复用既有私有provider和Range/stream，不生成公开URL、不扩大播放器。
- 仅在既有服务器草稿和审核页面嵌入最小上传/查看/采纳操作，用于验证链路；没有新媒体集合、作品或延期模块菜单。弱网传输结果未知先查询原uploadId，complete可继续原文件。

### 生命周期

| 路径 | 当前行为 |
|---|---|
| 保留状态 | DRAFT90天、SUBMITTED180天、拒绝/部分未采纳30天、撤回7天；ADOPTED无草稿TTL；有效保存同步关系到期时间 |
| 主动退休 | DRAFT素材变RETIRED，立即拒绝读；技术READY不伪改FAILED；真实物理清理前不释放容量 |
| 删除 | Person删除阻断本人暂存原件；正式Source/Person关系进入删除依赖；物理清理确认后才写ERASED/purgedAt |
| 合并 | 只移动已ADOPTED正式关系，保留上传原归属；STAGED不转给主档，旧Grant撤销；精确Role被上传引用时预览明确阻断职业迁移，不能静默丢弃Role |
| 业务JSON | STAGED不导出；ADOPTED带正式来源/关系和必要历史归因，重建不产生TalentAccount/Claim/Grant/Session |
| 备份恢复 | 实际pg_dump/restore及私有原件/预览恢复保留usageState/hash/uploader；恢复prepare隔离技术读取、撤销会话/Grant，旧授权不复活 |
| 完整性 | 新关系进入PrismaStore/MemoryStore、完整性检查及恢复摘要；无半采纳提交；旧上传/资产源字段不可变 |

容量配置集中校验、仅允许收紧：本人2GB、ENROLL200MB，保持既有workspace2GB、活动1GB、并发3/20、每小时100。配置名与细节见 `.env.example` 和 spec/16 本轮合同；不代表扩大旧部署容量。

### 验证与证据

本轮证据目录：`artifacts/talent-experience-pr03-staging/`。Core覆盖15个新增媒体归属场景；真实PostgreSQL验证FK/XOR、并发、同事务采纳回滚、导出重建和迁移61→62；真实Chrome360/390/430通过本人图片/H.264上传→异步worker READY/STAGED→本人查看→审核ADOPTED，包含未绑定ENROLL。实际恢复5个文件、32174字节，原件与预览hash一致，恢复隔离拒绝旧Portal和暂存访问。

本地完整Core **622/622**、PG **40个TAP程序/130项全部通过**（另含最终职业归属/重建专项及实际恢复）、**9组Chrome流程**、原生媒体 **17/17**、surface策略 **20/20**；248路由合同、typecheck/transport、静态12项及构建通过。实际统计、命令和最终head绑定CI在本目录verification.json及当前PR描述记录；下方视频切片历史结果不作为本轮结果。真实PG14本地和GitHub PG16分开记录，合成认证网关/COS协议不替代真实供应商。

### 尚未完成，等待本切片复核后推进

1. MediaCollection、模卡/素颜/作品集/介绍视频的上传、排序、封面与作品案例表单。
2. 完整暂存自动回收计划、到期提醒和物理清理调度；本轮只建立保留/退休/占用状态，不借既有FAILED清理器删除READY文件。
3. 跨Submission复用媒体的显式引用；当前fork仅复制文字，新批需重新上传。精确Role媒体依赖的进一步人工合并处理仍受预览阻断。
4. 真实邮件/短信 `PROVIDER_VERIFIED=NOT_RUN`、实际COS `COS_PROVIDER_VERIFIED=NOT_RUN`、真实iOS/Android/微信 `MOBILE_DEVICE_VERIFIED=NOT_RUN`。

不进入客户分享、官网或PR-04 Agent摄取业务。完成本轮后继续Draft，等待复核。

## 历史切片：内部受控视频播放（2fb01a7）

- 新增 `GET /api/v1/assets/{id}/playback`，BINARY、`assets.read`。沿用当前内部会话、原生scope、人物、来源、删除保护、恢复隔离和READY判定；Talent Cookie不替代内部会话，机器Bearer拒绝。没有借用导出链接或生成公开对象URL。
- 无Range返回200，单个闭合/开放/后缀Range返回206，不可满足范围416；多Range和未知单位按HTTP允许方式忽略并完整200。Content-Length、Content-Range、Accept-Ranges正确；HEAD不实现，返回405。
- Local/COS增加服务器内部 `statImmutableObject` / `openByteStream`。本地固定不可写文件、验证文件身份后从同一描述符读取；COS使用已配置桶的HTTPS签名请求和If-Match，严格校验206/ETag/Content-Range/长度，拒绝忽略Range、重定向和内容编码。签名URL/对象key不返回浏览器。缓冲64KiB，背压、AbortSignal、长度边界贯穿流，不为每个Range下载全文件；全量SHA仍在接收/封存阶段校验，不把片段校验当全量摘要。
- 短事务鉴权→事务外打开流并校验对象→首字节前再次短事务核对身份/来源/资产并写读取审计→发送。审计失败不发送视频；发现对象身份或长度异常则隔离精确资产并写SYSTEM审计与write-ahead；安全日志失败不修改资产也不放行字节。每5秒尝试复查进行中的流，失败取消；单连接绝对上限默认15分钟。数据库复查卡住时仍受绝对连接时限约束，已发字节无法追回。
- 私有素材与人物详情的既有媒体面板显示原生video控件，支持播放和seek；图片/PDF入口保留。CSP明确 `media-src 'self'`。新MP4处理仅接受H.264 yuv420p及AAC/无音频；不支持格式明确提示转换。旧已封存文件及历史ID不改写，旧不兼容文件播放失败给出格式/权限核对提示。
- 播放限制统一配置：每主体2路、当前工作空间10路、每连接900秒，每主体120请求/分钟和600MB声明字节/分钟；环境变量只允许收紧。请求失败也占本窗口的请求/声明字节预算，结束/取消释放并发槽。配置见 `.env.example` 的 `MEDIA_PLAY_*`。

并发/短期播放预算由当前单API进程维护，按workspace＋Membership计数，不按Session绕过；不宣称支持多副本全局额度。未来扩展多副本须先提供共享租约/配额实现和验收，不能直接增加副本绕过限制。

本切片无schema变化，无新增迁移；1–61逐文件冻结，保留旧素材source/hash/objectToken。新增读取路由和最小读取审计不改变业务JSON载荷、删除图或恢复实体。恢复隔离仍拒绝播放；物理清理与隔离后后续请求不可读。

### 视频切片原始实测记录

本地完整 `pnpm verify` 通过：Core **607/607**、零失败/跳过，类型、237路由合同、静态/存储门禁和构建通过；追加修改后的播放/COS专项 **13/13**、类型和transport通过。原生处理 **17/17**，真实PG/Chrome媒体链路通过。最终head的全量CI结果独立回填PR，不沿用main或PR-02结果。

本轮结果与截图保存在 `artifacts/talent-experience-pr03/`，最终提交及CI绑定结果在当前PR描述记录。

- Core新增9个测试：Range边界、额度/取消、真实本地有界流、实际loopback HTTP协议、首字节前撤权、审计失败、异常隔离；COS协议测试使用受控loopback HTTP，**不是实际COS验证**。
- 真实文件处理17项：图片/PDF原有回归、H.264文件处理、拒绝MPEG-4 Part 2及伪造MP4。
- 真实Nest/Prisma/PostgreSQL/Chrome媒体流程：图片、PDF、H.264/AAC上传与异步worker、原生播放/末尾seek、精确Range字节比对、原生scope拒绝、审计触发器失败不泄露视频、正式角色授权后的隔离。首跑测试错误使用无审核权编辑员隔离而403；修正为先断言拒绝、正式授权REVIEWER并重新登录后隔离，保留反例和复测日志，没有放宽权限或超时。

真实邮件/短信 `PROVIDER_VERIFIED=NOT_RUN`；实际COS凭证与Range服务验证 `COS_PROVIDER_VERIFIED=NOT_RUN`；真实iOS/Android/微信浏览器播放 `MOBILE_DEVICE_VERIFIED=NOT_RUN`。Chrome及合成协议通过不替代这些验收。
