## PR-03E finalization：删除竞争与配置保留期（待复核）

基线7016c4d；A–D保持FROZEN。两项阻塞已修复，PR #31继续Draft、未合并、未部署，本轮无schema或新增迁移，迁移1–68逐文件不变。

显式finalization取得租约时，同事务把无有效lease的ELIGIBLE/CLAIMED转SKIPPED，记录EXPLICIT_DELETION_TAKEOVER；有效TTL lease和DELETE_PENDING/UNKNOWN/CONFIRMED必须等待。TTL创建计划前检查显式删除归属，旧ERASED悬空可撤销计划终结且不调用provider，完整性检查拒绝ERASED上的可重试计划。显式provider I/O期间每10秒续租30秒lease，调用前后复核；35秒真实等待反例中第二finalizer不能取得删除权。本人上传改用统一mediaRetention.draft，1天和30天配置均经Portal API与READY全链验证。

本轮Core **683/683**；真实PostgreSQL **76个程序 / 166项**；原11组Browser + media-purge共 **12/12**；真实pg_dump/restore、68次空库迁移、保留库无待迁移且92张表摘要不变；类型、契约、构建、静态检查及额外媒体/验收测试均通过。完整日志及页面证据见 `artifacts/talent-experience-pr03-cleanup-finalization/verification.json`。精确head CI结果另绑定PR描述与交付回复，通过前不声明DEVELOPMENT FROZEN；本轮交回复核，不推进后续业务。Provider/COS/物理手机/生产迁移仍NOT_RUN。

以下为历史记录。

# PR-03E：回收与 PR-03 总验收

基线 `ff6e10f951855831a9b5d0c966623be34b529442`；A–D 已由用户冻结。本轮新增67 `202610010012_media_purge`及68 `202610010013_media_purge_plan_guard`（67应用后发现SQL NULL约束缺口，只以前向68修正），迁移1–66逐文件不变。PR #31 Draft、未合并、未部署；不进入后续业务。

## 清理合同

`MediaPurgeIntent` 保存唯一 Asset/Upload 对、不可变 objectToken、逐对象 part/bytes/hash/state、当前 lease、恢复 epoch、次数、退避时间及 purgedAt。数据库有 workspace/Asset/Upload 复合 FK、每 Asset 唯一、state/lease/purgedAt/对象数组 CHECK、身份不变触发器。复用 Asset、Upload、PersonMedia，不把 READY 改成 FAILED。

状态：`ELIGIBLE → CLAIMED → DELETE_PENDING / DELETE_UNKNOWN → DELETE_CONFIRMED → ERASED`。正式依赖出现时为 `SKIPPED`，记录 `SKIPPED_FORMAL_DEPENDENCY`；暂时阻断则 ELIGIBLE 退避，不永久遗漏。开始 DELETE 的短事务先将业务使用改为 RETIRED，推进保护版本。物理 IO 期间不持数据库事务。审核和最后复查使用既有 PrismaStore 事务互斥；审核先提交，清理放弃；清理先设不可逆保护，审核返回 `MEDIA_PURGE_IN_PROGRESS`。实际对象存在时，每次 DELETE 前再次短事务核对。

调度独立于处理 worker：每分钟，单次最多4项，候选 SQL 最多返回32个 ID；lease60秒，10秒 heartbeat，失败退避5分钟，支持中断和超期接手。保留既有事务锁，并未把它宣称为无锁或行锁并行系统；候选筛选在数据库完成，没有把整个 workspace 数据载入内存。36个对象的真实PG测试检查窗口退避和单轮4项上限。

保留以 PersonMedia.retainUntil 为准：DRAFT90天、SUBMITTED180天、REJECTED/PARTIAL及批准后未采纳项30天、WITHDRAWN7天；到期终态可清理，ADOPTED为null。环境配置四个 `MEDIA_RETENTION_*_DAYS` 只允许1至默认最大值。保存/提交/审核更新暂存期限；正式采纳关系不受草稿TTL影响。终态文字 fork 仍不复制 STAGED；ADOPTED引用仍须当前 Grant/exposure。

正式来源、ADOPTED PersonMedia、CollectionItem/封面、WorkAsset、候选素材、人物封面、资质及成年证明均阻止自动回收。撤回 Source/Consent 是用途阻断，不等于删除原件；移除一个集合或作品引用不擦除仍有正式依据的原件。

## 外部删除与容量

Provider 合同 `statPurgeObject / deleteImmutableObject / purgeOwnedNamespace` 使用固定 uploadId+objectToken+part 与大小/摘要。Local检查根/父目录、只读文件、单链接、sha256，拒绝符号链接与路径越界。COS固定当前私有非版本桶、精确key、SDK不跟随重定向，不返回签名URL；请求异常保持 UNKNOWN，后续先HEAD/下载摘要核对再受控重试。

每 Asset 的 original、preview 独占上传UUID目录；当前无共享衍生物。废弃处理尝试/ingest也只属于该Upload，清理按有界且校验文件名的独占目录处理，未知文件或未决COS发布标记阻断最终确认。以后新增共享rendition必须另立共享关系和引用计数合同，不能套用当前独占删除。

original删除但preview未知，仍不finalize。最后一个对象缺失时还要确认独占目录清理完成。全部确认后，单事务擦除Asset/Upload技术字段、置ERASED、清理PersonMedia正常读取状态，并写purgedAt及审计。Asset沿既有擦除合同无单独purgedAt字段，物理完成时间在Intent、Upload、PersonMedia。quota沿既有 `!upload.purgedAt` 计算，只有finalize成功才清零expectedBytes；UNKNOWN、数据库/审计失败、恢复隔离均不提前释放。

## 删除、恢复与审计

显式DeletionRequest先阻断时，TTL不再新建可重试计划；原有可撤销计划在无有效租约后终结为SKIPPED。TTL先进入不可逆阶段时，显式依赖清理/物理finalizer等待；TTL完成后显式finalizer复用upload.purgedAt，完成自身依赖记录，不再调用provider。两种顺序均在Core和真实PG验证。

恢复准备使旧purge lease失效；UNKNOWN原样保留，隔离环境不运行清理。claim/heartbeat/删除前复查同时拒绝未APPROVED的恢复记录，旧配置worker也不能重新领取。物理备份清单标注已缺失part，仅复制仍存在且摘要正确的字节；不是把缺失伪造为完整原件。pg_dump/restore保留计划和剩余字节，离线状态机核对“仍有preview”和“全缺失”两种UNKNOWN并释放额度。专项离线恢复测试不宣称完成生产恢复审批；完整既有恢复审批链另由全PG回归覆盖。

恢复检查纳入purge行和状态摘要。已ERASED的原件重新出现、缺少私有provider、身份异常、正式关系与不可逆purge共存、UNKNOWN已释放quota、缺失保留期、lease/purgedAt不一致等均fail-closed。业务JSON不包含STAGED/清理计划/授权主体；正式媒体现有导出重建合同不变。

审计记录资格、领取、删除请求、UNKNOWN/确认、跳过、完成和退避。write-ahead失败不开始DELETE；物理副作用后数据库故障保留未决意图。新状态接口不返回objectToken/key、联系方式或secret。

## 页面与验收映射

内部账号设置新增最小状态面板：到期数量、进行中、UNKNOWN、24小时失败、最早到期、待释放原件字节、实际保留配置。`GET /media-purge/status`与`POST /media-purge/reconcile`仅内部members.manage；拒绝Talent/MACHINE。手动请求最多安排4项，原键未知回执走既有核对机制。

| 用户验收项 | 代码级证据 |
|---|---|
| 1–6 保留与采纳 | Core retention matrix；PG lifecycle/partial/rejected；A–D完整回归 |
| 7–10 quota | lifecycle / rollback / partial；390px实际原件删除前后额度 |
| 11–14 并发 | PG lifecycle两worker；review-first / purge-first真实审核命令 |
| 15–19 UNKNOWN、多对象 | provider contract；Core timeout；PG lifecycle/restore |
| 20–24 正式依赖 | Core formalMediaDependency；Collection/Work回归及完整旅程正式素材保留 |
| 25–26 recovery | PG restore实际dump/restore、prepare租约隔离、缺失/存在重新核对 |
| 27 显式删除 | Core+PG deletion-ttl / deletion-explicit |
| 28–30 provider | Local真文件、越界/符号链接、COS受控success/404/timeout/redirect/mismatch |
| 31–34 quota/fault/state | PG rollback/lifecycle；390px异步worker→READY→清理 |
| 35–36 fork引用 | 既有Collection/Work的跨Submission STAGED拒绝、ADOPTED引用；新草稿无已删素材 |
| 37–38 权限 | Core维护权限、Talent拒绝；既有账号切换浏览器回归 |
| 39–40 有界调度 | Core+PG batch36个素材，扫描窗口32/单轮4，受阻窗口退避 |

真实Chrome最终旅程复用Nest、Prisma、PG及异步处理worker：Anna认领→文字→照片/H.264→模卡/Portfolio/Work→审核→本人和内部主详情→第二草稿临时图片→撤回→仅测试进程推进Clock→真实purge worker→原预览拒绝、目录物理缺失、quota精确归还、正式集合/Work/Range仍可用。测试时钟没有新增HTTP入口。

实测还修复三相邻Portal组件相同React key造成重复上传控件的问题；保留浏览器严格唯一元素断言。

## 当前证据与生产边界

新证据集中在 `artifacts/talent-experience-pr03-cleanup/verification.json`，包括本轮完整Core/PG/12组浏览器日志、迁移66→67保留数据摘要、真实页面、restore及失败定位。历史artifact不覆盖、不套用。

最终SHA和exact-head CI记录在PR描述与交付回复。只有最终head完整CI通过，才满足 **PR-03 DEVELOPMENT FROZEN**；仍等待代码级复核，不自动Ready/merge。

`PROVIDER_VERIFIED=NOT_RUN`；`COS_PROVIDER_VERIFIED=NOT_RUN`；`MOBILE_DEVICE_VERIFIED=NOT_RUN`；`PRODUCTION_MIGRATION_VERIFIED=NOT_RUN`；`DEPLOYED=false`。手机宽度Chrome属于浏览器证据，不是物理手机验证；受控COS不是实际供应商验证。
