## 2026-10-03：业务流修复（独立工作树，尚未完整验收）

基于 `1dae5e729b3be3a01d8149e4f02bd64bc9436d61`，本轮修复来源核验与团队共享、版本化人才导入及旧记录补齐、本人端拒绝与未知结果恢复、多来源核心资料保存、来源原文页面录入。完整边界、权限矩阵及迁移顺序见 [业务流修复交付](BUSINESS_FLOW_FIXES.md)。新增迁移75，旧1–74未改；迁移75尚未在真实数据库执行，未合并、未部署。

本轮受影响回归 **146/146 CORE_MEMORY_TESTED**，资源生命周期 **24/24 PASS**（Docker故障用例为模拟，不能算真实Docker验收）；核心类型及六个前端入口的局部类型检查、Prisma模型校验、真实客户端生成、299路契约及静态检查通过。完整前端类型检查触及256 MiB堆上限，保留失败；完整后端typecheck、构建、真实PG、浏览器、CI、PROVIDER_VERIFIED及生产迁移均NOT_RUN。共享Mac最后观测Swap7814.06 MiB、内存压力等级2，超过重型验证门槛。当前测试所登记进程已核对ZERO_RESIDUE，不代表历史资源被清理。

证据在 `artifacts/business-flow/core.json`、`checks.json`、`verification.json`；首次失败与修正说明保留。以下是旧版本历史证据，不自动适用于本轮。

## 2026-10-02：PR-04D 同档接手与生命周期总收口（Draft，待代码级复核）

用户已冻结 A–C，C基线 `4e7593c9dbd06ef4355e2a928ebec0c8a1c72efb`。本轮独立 stacked Draft PR35，复用既有 CLAIM / TalentAccount / SELF Grant；Agent正式人物由本人认领后保持同一 Person ID，默认不开放历史资料。人物详情新增逐项 exposure 管理；历史 exact WorkCredit 可经内部明确批准只读，不伪造 Consent，后续 Work维护仍需真实本人 WorkConsent。当前 Source/typed basis/fieldScope、Role、Grant、删除/恢复保护和版本均重新核对。原 MACHINE INTERNAL_REVIEW 保持，新本人维护创建独立 TALENT_CONSENT，不洗来源。

本地全量 Core757/757、PostgreSQL16 145个程序/235项/0失败，原15组+新增D共16/16真实Chrome通过；空库1→74、保留74→74 no-op、混合业务JSON/真实重建CLI、实际pg_dump/restore、完整性、结构化secret guard及既有删除/合并/TTL竞争回归通过。无schema/迁移75，1–74逐字节不变，PR31–34 head不改。证据见 `artifacts/agent-handoff-pr04d/verification.json`；完整交付见 [PR-04D说明](PR04_AGENT_INGESTION_D.md)。首次失败和修正保留。

新 Draft PR35最终SHA与17项exact-head CI另绑定PR描述和交付回复，全部成功后才声明PR-04 A–D DEVELOPMENT COMPLETE；不借用C的CI。继续Draft、未合并、未部署，D待代码级复核冻结，完成后停止，不进入MCP/Skill。PROVIDER_VERIFIED / COS_PROVIDER_VERIFIED / MOBILE_DEVICE_VERIFIED / PRODUCTION_MIGRATION_VERIFIED 全部NOT_RUN，DEPLOYED=false。以下保留历史状态及其原证据。

## 2026-10-02：PR-04C WORK appliedId finalization（Draft，待最终复核）

以665ea7b20a1d0e16d47406f8fd7e814340d37098为基线，只修正 `applyStructures` 将MACHINE WORK `appliedId` 从Credit.id改为Work.id；TALENT既有流程原本即Work.id，保持不变。无新增映射字段/模型、无Work/Credit重构、无迁移75；1–74和PR31/32/33 head不改。

CREATE、LINK exact Credit复用及LINK新Credit均查库确认Work.id，Credit原ID/Source/Note不变，共享Work facts/cover/placements不变；Collection/MEDIA/ROLE映射不变。旧代码新增断言先复现1项失败，修正后专项42/42；全量Core743/743、PG16共131程序221项、原14组加新增Agent Structures共15组真实Browser通过。真实业务JSON重建、CLI、pg_dump/restore、恢复后WORK item、fresh1→74和retained74无改写通过。证据见 `artifacts/agent-structures-pr04c/applied-id-finalization/verification.json`；完整说明见 [PR-04C交付说明](PR04_AGENT_INGESTION_C.md)。

最终SHA及新的exact-head 16项CI结果回填PR34描述和交付回复，不复用665ea7b的36987562732。继续Draft、未合并、未部署；待最终代码级复核确认冻结，停止推进PR-04D。四项生产验证NOT_RUN，DEPLOYED=false。以下保留历史记录。

## 2026-10-02：PR-04C Collection / Work 摄取（独立 Draft，待代码级复核）

基于 PR-04B frozen `379d06dbea9295d47dd7f998a90f76d5d885169a`；PR31/32/33不修改。Agent仅用同批Role/Media stable key提交集合和案例，submit冻结完整依赖；内部明确Collection新建/更新、Work CREATE/LINK，在原有模型和Commands事务内采纳。LINK不改共享Work facts/cover/placements，exact Credit原ID/Source/Note复用；typed INTERNAL_REVIEW重建不伪造TalentConsent。无新数据库字段/迁移，1–74字节不变。

本地Core743/743；PG16全量126程序216项通过，随后最终32个结构专项全部通过，去重覆盖131程序221项；空库1→74、保留74→74无改写、真实pg_dump/restore与实际业务JSON重建/CLI通过。原14组及新增390px Agent Collection/Work真实Chrome旅程通过（真实异步worker与H264），首次失败保留。最终完整16项CI绑定Draft PR #34最终head并回填PR描述，不沿用旧head结果。详见 [PR-04C交付说明](PR04_AGENT_INGESTION_C.md) 与 `artifacts/agent-structures-pr04c/verification.json`。

保持Draft、未合并、未部署，交付后停止等待代码级复核，不进入PR-04D。PROVIDER_VERIFIED / COS_PROVIDER_VERIFIED / MOBILE_DEVICE_VERIFIED / PRODUCTION_MIGRATION_VERIFIED 均为NOT_RUN，DEPLOYED=false。以下为历史记录，不替代本轮证据。

## 2026-10-02：PR-04B 真实媒体摄取（Draft，待代码级复核）

用户正式启动 PR-04B。PR-04A 冻结67f45a57、PR-03冻结aeaf49da及迁移1–72保持不变；独立stacked分支追加迁移73–74，接通MACHINE真实上传/异步worker/STAGED/私有预览与MP4 Range/内部文字媒体原子审核/正式授权转换。七项机器额度显式配置，缺失拒绝；沿用保留、清理、导出与恢复隔离。本地Core711/711、PG16共99个程序/189项、原13组及新增媒体共14组真实Browser通过；空库1→74、保留72→74、实际pg_dump/restore及JSON重建通过，首次失败保留。最终15项CI以Draft PR #33最终head为准。详见 [PR-04B交付说明](PR04_AGENT_INGESTION_B.md)。Draft、未合并、未部署，不进入PR-04C；四项生产验证NOT_RUN，DEPLOYED=false。

以下保留历史记录。

## 2026-10-02：PR-04A finalization（Draft，待最终冻结复核）

本轮仅收口 imported INTERNAL_REVIEW 的完整DB形状约束与结构化secret leak检测。前向迁移72，1–71字节不变；真实历史引用不建立假FK。rebuild与DB校验对齐，TALENT_CONSENT原合同回归通过。原OTP浏览器和Agent摄取复用统一helper；合法UUID/hash/时间/计数不因OTP子串碰撞失败，正文和真实Bearer/receive token、authorization及签名URL仍严格检查，失败不输出秘密。

本地Core689/689，PG80个程序/170项/0失败（14.19），空库1→72、保留71→72及真实pg_dump/restore通过；原12组Browser+新ingestion13/13，真实receive token接入后4条媒体旅程复跑通过。最终PG16/14项CI仅认本轮最终head，回填PR描述和交付回复；首次36926840575 attempt1及旧交付说明保留。详见 [finalization说明](PR04A_FINALIZATION.md)。待本轮代码级复核后正式确认PR-04A FROZEN；PR #32 Draft、未合并、未部署，PR #31不修改，不进入PR-04B。所有生产门NOT_RUN，DEPLOYED=false。

以下保留上一轮交付与历史状态。

## 2026-10-02：PR-04A 主体与文字摄取（Draft，待代码复核）

用户已正式启动 PR-04A，原 DESIGN_ONLY 为历史阶段。基于冻结 PR03 aeaf49da / 设计7017d5ef的独立 stacked 分支实现真实 MACHINE Submission、窄权限与 authorizationEpoch、文字/Role/基础事实、明确 NEW/EXISTING审核、typed INTERNAL_REVIEW及intake→formal转换。迁移69–71前向追加，1–68字节不变；PR #31 head不变、未合并未部署。

本地 Core685/685、PG79个程序/169项及新Nest/Bearer/Chrome审核旅程通过；旧本人文字维护及目录浏览器回归通过。PG16和原12组Browser+新ingestion共14项最终CI以该 Draft PR 最终head为准，不能借用PR31结果。完整实现、生命周期、证据及未验边界见 [PR04_AGENT_INGESTION_A.md](PR04_AGENT_INGESTION_A.md)。PR-04未冻结，B/C/D未开始；供应商/COS/物理手机/生产迁移均NOT_RUN，DEPLOYED=false。

以下保留历史记录。

## 2026-10-02：PR-04 四项设计决策冻结，仍 DESIGN_ONLY

本次文档一致性检查通过：四项冻结模型、I13–I23共11条设计反例及变更文档本地链接均已检查，代码/迁移/冻结规格路径diff为空；MANIFEST按最终文档更新并逐项核对。本次未运行Core、PG、Browser或新增CI，不将设计反例标为已验收。

本轮仅修订 [PR-04设计§4.3–4.6及§10.2](../design/PR04_EXTERNAL_AGENT_INGESTION.md)：MACHINE预审personId=null、proposedPersonId及冻结目标基线；SourceUseBasis按TALENT_CONSENT / INTERNAL_REVIEW作typed XOR/CHECK；ServicePrincipal独立authorizationEpoch（rotate不变、授权边界变化递增）；reviewer双scope审核并转正式Person scope。四项决策FROZEN，整稿继续待复核、未获编码授权；新增I13–I23设计反例，运行测试NOT_RUN。

仍只使用独立 `docs/pr03-freeze-pr04-design` 文档分支。无业务代码、schema或迁移变化，无PR-04业务PR；PR #31 Ready、OPEN、未合并、未部署，head保持aeaf49da7d5346785adac6df4e2d34321f9d92d2。供应商/COS/物理手机/生产迁移均NOT_RUN，DEPLOYED=false。四项无未决模型选择，其他接口草案和阶段计划仍随整稿交回复核；完成本次设计提交后停止。

## 2026-10-02：PR-03 DEVELOPMENT FROZEN ✅

PR-03 **A–E 全部 FROZEN**，冻结SHA `aeaf49da7d5346785adac6df4e2d34321f9d92d2`；PR #31已转Ready for Review，保持该head、未合并、未部署。精确head [CI 36901766784](https://github.com/BA7IEE/once-production-os/actions/runs/36901766784) **13/13 SUCCESS**。Core684/684、PG77个程序/167项、Browser12/12及恢复/迁移证据见 [冻结记录](PR03_DEVELOPMENT_FREEZE.md)。本次仅状态文档和设计，没有新增业务测试或代码。

`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`、`PRODUCTION_MIGRATION_VERIFIED=NOT_RUN`、`DEPLOYED=false`。业务代码、迁移1–68和验收合同不改；冻结文档在独立分支收口，不改变PR #31 head。PR-04仅完成 [外部Agent摄取设计](../design/PR04_EXTERNAL_AGENT_INGESTION.md)，等待复核，尚未编码。

以下保留历史切片状态与证据；旧Draft／待复核文字不代表当前PR状态。

## PR-03E finalization：删除竞争与配置保留期（待复核）

删除权候选窗口收口：Prisma SQL与MemoryStore在LIMIT32之前排除已由显式删除占用、尚无TTL intent的素材；事务内最终归属复查仍保留。新增真实反例以32个被占用素材和独立ENROLL素材验证，不生成占用项的intent，也不会让它们反复占满窗口。最新完整本地回归：Core **684/684**、PostgreSQL **77个程序/167项**、Browser **12/12**（含media-purge），真实pg_dump/restore及空库68迁移通过。证据见本轮 `candidate-window/`；无schema/新迁移，最终新head完整CI另绑定PR与交付回复。

CI 最终预算补充：1a39a05的运行36894916997中，media-purge也因前置下载耗时在浏览器阶段触及20分钟job上限（原始annotation已核对）。单job调整不足以覆盖共同环境瓶颈；现统一12个Browser job总预算为30分钟，数据库job及每个测试命令、断言、浏览器单步超时均不变。证据见本轮 `ci-browser-budget.json`，最终新head仍完整重跑13项。

CI 环境补充：81d4b30 的运行36889529259有12项成功；media-staging两次因Ubuntu镜像下载缓慢，在ffmpeg安装阶段触及20分钟job上限，浏览器未执行。核对日志及annotation后，仅将该job总时限改为30分钟，全部验证步骤和断言不变；失败证据见本轮 `ci-infrastructure.json`。业务源码与已完成本地测试的摘要仍一致，最终新head完整CI另行核实，不沿用前一head成功结果。

基线7016c4d；A–D保持FROZEN。两项阻塞已修复，PR #31继续Draft、未合并、未部署，本轮无schema或新增迁移，迁移1–68逐文件不变。

显式finalization取得租约时，同事务把无有效lease的ELIGIBLE/CLAIMED转SKIPPED，记录EXPLICIT_DELETION_TAKEOVER；有效TTL lease和DELETE_PENDING/UNKNOWN/CONFIRMED必须等待。TTL创建计划前检查显式删除归属，旧ERASED悬空可撤销计划终结且不调用provider，完整性检查拒绝ERASED上的可重试计划。显式provider I/O期间每10秒续租30秒lease，调用前后复核；35秒真实等待反例中第二finalizer不能取得删除权。本人上传改用统一mediaRetention.draft，1天和30天配置均经Portal API与READY全链验证。

本轮Core **683/683**；真实PostgreSQL **76个程序 / 166项**；原11组Browser + media-purge共 **12/12**；真实pg_dump/restore、68次空库迁移、保留库无待迁移且92张表摘要不变；类型、契约、构建、静态检查及额外媒体/验收测试均通过。完整日志及页面证据见 `artifacts/talent-experience-pr03-cleanup-finalization/verification.json`。精确head CI结果另绑定PR描述与交付回复，通过前不声明DEVELOPMENT FROZEN；本轮交回复核，不推进后续业务。Provider/COS/物理手机/生产迁移仍NOT_RUN。

以下为历史记录。

## 2026-10-01：PR-03E 回收与 PR-03 总收口（Draft、未合并、未部署）

CI首轮的PDF备份测试替身接口缺失已修正，Local媒体17/17、surface policy3/3补跑通过；生产实现不变，最终head完整CI另绑定交付记录。

本轮本地 Core **677/677**，完整 PostgreSQL **70个程序 / 160项**，原11组Browser及新增清理Browser均通过，最终68迁移另复跑完整清理旅程；checkpoint17项、静态12项、类型/契约/构建均通过。恢复末次门禁另由真实PG复跑，CI须绑定最终head。

A–D已由用户冻结，基线ff6e10f。本轮接通独立清理计划、逐对象UNKNOWN核对、确认物理删除后归还容量、审核竞争、显式删除交接和恢复隔离。新增前向迁移67–68，1–66未改；67应用后不回写，68补强JSON空值拒绝和对象身份不可变；保留库66→67的91张旧表内容摘要不变。完整合同、40项验收映射及限制见 [PR03E_ACCEPTANCE.md](PR03E_ACCEPTANCE.md)，本轮实测汇总见 `artifacts/talent-experience-pr03-cleanup/verification.json`。最终head CI另绑定PR描述和交付回复，通过前不宣称DEVELOPMENT FROZEN。Provider/COS/物理手机/生产迁移仍NOT_RUN，不进入PR-04等后续业务。下方为历史切片记录。

## 2026-10-01：PR-03D finalization（Draft，待复核）

本轮本地验证：Core 643/643；PostgreSQL 60个测试程序、150项通过，关键反例另行复跑；11组真实Chrome通过，最终页面另复跑 Work/Production 两组。契约260路由、静态12项、checkpoint 17项通过。最终CI以交付回复和PR描述中绑定最终SHA的记录为准。

修复 LINK 不写共享 Work 媒体/事实，新增独立媒体+Work同意版本，支持已有 exact Credit 原样接手及 legacy 内部受控升级。无schema/迁移变化，1–66逐文件不变。当前证据见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-finalization/verification.json`。保持未合并、未部署，Provider未验证，不进入PR-03E。

## 2026-10-01：PR-03D 作品案例（Draft，待复核）

PR-03A/B/C 已冻结。本轮复用 Work/Credit/Asset，增加本人案例草稿、精确职业署名、人工新建/关联、Grant-bound 本人投影及人物主详情卡片；同步导出重建、删除/合并与恢复。新增前向迁移64–66，1–63不改。当前实测证据与明确边界见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-cases/verification.json`。保持 PR #31 Draft、未合并、未部署，Provider/COS/真实手机仍 NOT_RUN；完成本轮后不进入 PR-03E 或后续业务。

## 2026-10-01：PR-03C finalization（Draft待复核，尚未冻结）

本轮最终本地实测：**Core 633/633；真实 PostgreSQL 50组/140项，另6组受影响场景复跑；10组真实Chrome；255条路由合同、类型检查、静态、构建、17项checkpoint通过。** 实际恢复13个文件/92602字节，旧Grant/session及exposure拒绝复活。

本轮完成当前 Grant-bound exposure、Tag 新来源/父集合版本、失效来源退出 current、Collection 类型 identity 五项修正。没有 schema/迁移变化，1–63不改。本人明确获准后可使用内部正式素材，不借 uploader 或开放人物全部内部媒体；新增正式读与既有删除/合并/恢复保护一致。完整实测、反例、失败定位及最终head CI绑定见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-finalization/verification.json`。保持 Draft、未合并、未部署；不进入 PR-03D，Provider/COS/真实手机仍 NOT_RUN。下方内容为历史主体阶段结果。

## 2026-10-01：PR-03C 媒体集合（Draft待复核）

最终本地实测：Core 632/632；真实PG14.19 49组/139项；真实Chrome 10组含360/390/430px；254条合同、类型检查、静态与构建通过。详情与失败修正证据见本轮证据目录。PG16以最终head CI为准。

复用既有 Collection/Item/Tag，迁移63增集合封面、当前版本与标签历史状态；迁移1–62不改。本人服务器集合草稿、跨 Submission 自有 ADOPTED 原件复用、原子审核、内部主详情画廊和逐 Item 来源授权已接入；删除/合并/导出重建/实际备份恢复同步验证。当前实际测试数字与截图见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-collections/verification.json`。PR-03A/03B已复核冻结，PR #31继续Draft、未合并未部署，本轮等待复核，不进入PR-03D。Provider/COS/真实手机均NOT_RUN。下方旧“未进入MediaCollection”是历史状态。

## 2026-10-01：PR-03 ADOPTED 正式媒体授权修正（Draft待复核）

正式媒体改用统一 PersonMedia Person/Role/Source 当前授权，脱离原 Upload/Claim intake scope；STAGED继续严格接收范围。直接媒体、TD2、导出和合并预览一致，旧内部上传语义保留。无schema/迁移变更，1–62不改。A仅intake/B仅正式范围的Core、PG、Chrome图片与MP4 Range反例和本轮完整实测结果见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 及 `artifacts/talent-experience-pr03-formal-auth/verification.json`。PR #31保持Draft、未合并未部署，Provider未验证，尚未进入MediaCollection。

## 2026-10-01：PR-03 媒体归属与暂存底座（Draft待复核）

迁移62新增真实上传主体与PersonMedia关系，READY与STAGED/ADOPTED/RETIRED分离；本人/审核专用读、原子采纳及生命周期已接入。1–61冻结。真实Chrome手机宽度与异步worker/PG、实际私有文件备份恢复已验证；完整当前提交测试及CI绑定见[本轮交付说明](TALENT_EXPERIENCE_PR03.md)和`artifacts/talent-experience-pr03-staging/verification.json`。本分支未合并、未部署，Provider未验证，PR-03整体未完成；不进入集合/作品下一切片。

## 2026-10-01：PR-03 已启动

独立分支先实现内部受控视频播放，PR-03整体尚未完成、保持Draft、未部署；本人多来源媒体及生命周期待继续。当前能力、实际证据和明确剩余见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md)。

## 2026-10-01：PR-02 已合并、开发冻结、未部署

用户复核通过后，PR #30 从 Draft 转 Ready，并以 `9fc2f9295068a16a16e6409b6df1c230bbe055ca` 为 expected head 合并。合并后远端 main 为 `1a297d86ecfeac5d7a3c748322a867c9852a20c9`；[main 完整 CI 36815702669](https://github.com/BA7IEE/once-production-os/actions/runs/36815702669) **9/9 SUCCESS**，已核对精确 SHA，包含 PostgreSQL16 和全部8组浏览器。

**PR-02 已合并、开发冻结、未部署，PROVIDER_VERIFIED=NOT_RUN。** 真实认证发送及生产接管未验证，正式外部入口默认关闭。下方 Draft/待复核内容保留为历史记录，由本节覆盖。PR-03 从该 main 独立分支推进，不修改已合并 PR-02 的迁移1–61。

## 2026-10-01 PR-02b finalization

本轮Core/真实PG共用新增专项，覆盖三个终态的原键/新键/不同决定及主体/摘要隔离、零新增审核审计/回执、ENROLL拒绝审计故障回滚、来源原文保护、普通导出与实际恢复边界。最终实测结果和对应head CI见PR-02交付说明顶部及PR #30，历史结果不得代替本轮验证。

本轮实测：`pnpm verify` 通过，Core **598/598**、零失败/跳过；完整PostgreSQL回归退出0，PR-02b专项 **43项**（本地PG14.19，含实际备份恢复）；全部 **8组真实浏览器套件**通过。类型、transport、236路由合同、静态/存储门禁及构建通过。浏览器首跑暴露审核提交与Portal刷新之间的测试时序竞争；修正为等待该Claim批准的200回执及列表刷新，再于新空库复测通过，没有增加超时或放宽断言。初次失败和成功复测日志均保留。

详情及本轮证据见 [PR-02交付说明](TALENT_EXPERIENCE_PR02.md)。

## 2026-09-30 Talent Experience 首轮增量

本轮核心569/569（MemoryStore）、建档6/6、门禁2/2、类型/transport/199路由合同/静态12项/构建通过。独立PG14.19+Chrome验证同键并发、数据库审计故障回滚、失去响应重放、多职业/联系人、360–1280及只读拒绝；既有交接和图片/PDF/worker浏览器通过。PG16云端待最新HEAD结果；真实邮件短信/COS/手机codec/CMS/性能/生产全部NOT_RUN。失败夹具记录保留且不计通过。

本轮证据与边界见 [TALENT_EXPERIENCE.md](TALENT_EXPERIENCE.md)，PR #28；以下保留历史记录，历史未合并状态不覆盖当前main。

## 未决标记的静态边界

c08a25a的四条浏览器验收通过，核心562/562通过；原静态规则禁止所有sessionStorage，因固定未决标记而拦截，数据库验收尚未执行。现把标记集中到pending-marker.ts，AST仅允许该文件以字面量键once-pending-command读取/删除或写入字面量1；变量值、正文、其他键、别名和其他文件访问仍拒绝。新增反例测试，21项前端/静态边界专项及11项静态检查通过；最终云端结果见PR，失败运行不计全绿。

## 2026-09-29 外部 staging review 核实修复

R1/R2属实：未知提交经4xx拒绝不得释放原键，COMMAND成功响应须验证UUID、revision、状态及replayed。会话失效/退出只暂停身份，不清空内存原请求；同身份登录后显式原样核对，不同身份不能读取或重放；服务端校验可选X-ONCE-Membership绑定，拒绝跨标签页身份变化。刷新只保留无正文的未决标记，先人工核对再开放新命令。新增页面核对入口及浏览器丢失响应→403/429/畸形200→401→重新登录重放用例。

D1新增独立非root ops镜像，包含固定Prisma及PostgreSQL16工具和现有维护脚本，实际空库54次迁移/初始化/备份/隔离空库恢复通过。D2强制staging HTTPS+Secure Cookie。D3/D4为部署/容量边界，未伪报真实COS、模型或性能已验。受影响48项通过，类型/构建及新提交云端结果见PR；54次迁移未改变，未合并部署。执行说明见docs/release/STAGING_EXECUTION.md。

## 2026-09-29 上线前故障修复

修复406827d审查发现的两个P1：安全日志改为内核文件锁，SIGKILL后释放且不破坏日志；媒体单条清理失败延后重试，不阻塞其他清理与新上传。ready检查增加日志完整性和可写/锁状态。本机37项受影响回归、16项真实媒体处理、类型检查与构建通过。新增fs-ext 2.1.1锁定依赖，镜像构建阶段提供编译工具。无数据库迁移；54次迁移冻结。Linux镜像与当前提交云端结果在PR回填，真实COS/模型及系统级媒体隔离仍待验，未合并部署。详见docs/release/PRELAUNCH_REVIEW_FIXES.md。

## 当前媒体删除约束修正

Actions 36479575748 已通过媒体浏览器（含不解析PDF附件）、交接、导入继续；项目浏览器定位到扩展媒体大小约束遗漏ERASED零字节，追加第54次迁移恢复既有删除头约定，同时维持活跃文件按类型限额。前53次已应用的迁移不改写；该运行核心545/545、领域PG25/25（品牌生命周期和AI四故障位置）、52→53有数据升级通过；真实共享媒体删除同样被零字节约束阻断。当前52→54升级、新库安装与真实媒体最终化待最终CI回填PR。

## 当前验收修正

Actions 36478291022：核心545/545、AI四位置真实进程中断通过；恢复与导入继续浏览器通过。媒体浏览器仍使用旧标题，项目删除测试少确认新关联项，已修正测试操作且保留严格待确认数量检查。领域PG定位到数据库导出字段白名单缺失，追加第53次迁移（前52次已应用并冻结），同步扩大三张表白名单；52→53升级保留品牌关联和未决AI费用。完整数据库与页面最终结果待新提交CI，不能将该失败运行标为5/5。

## 2026-09-29 当前收尾：项目主体、媒体与 AI 中断

品牌独立于机构登记，项目可选择客户机构和品牌；维护页面、当前范围/来源检查、审计回滚/原键重试、逐来源导出许可、完整JSON重建、关联清理及恢复检查已接通。仅归档或改名不清空不可见机构。删除品牌来源保留独立客户；删除机构来源解除品牌/项目关联，专业事实引用需先逐项处理。追加第52次迁移；第51次扩展媒体类型，前50次冻结。

PDF按用户决定仅保留私有附件，不解析/OCR；精选MP4封面、COS私有读取/导出/备份恢复/清理已接通。AI真实进程故障包含尝试提交前、HTTP发送前、HTTP已到达、响应入库提交前四个位置。核心受影响80/80、品牌专项7/7、本地媒体16/16、198条契约/类型/构建通过；本批集中云端PG及浏览器结果回填PR #26，不套用旧CI。真实COS及真实模型PROVIDER_VERIFIED=NOT_RUN，未合并、未部署。

## 2026-09-29 媒体补齐与 AI 故障位置收尾

当前功能与未验收边界统一见 docs/release/CURRENT_DELIVERY.md，历史条目的“待实现”不能当作当前状态。PDF按用户最新决定仅保存私有附件，解析/OCR/文字处理交给外部Agent；未引入PDF解析依赖。精选MP4支持受限封面提取，COS接入现有读取/导出/备份/恢复/删除流程。新增第51次迁移仅扩展媒体类型及按类型大小限制，前50次迁移冻结。AI真实进程故障扩展至四个位置，待本批数据库CI。受影响82/82、本地真实媒体16/16、类型/契约/构建通过。真实COS和模型供应商均PROVIDER_VERIFIED=NOT_RUN；未合并部署。

## 2026-09-29 AI 超时一致性与网络中断验证

业务任务与连接测试现在读取已保存的超时时间，修复页面可设120秒、调度器固定60秒的不一致；配置及超时在同一事务读取，发送前继续校验配置身份。新增真实本地HTTP故障测试：超时、半截响应、连接重置、重定向、429、500均仅发送一次并保留结果未知。AI受影响50/50通过（其中6项真实HTTP），完整类型检查与静态检查通过。

真实PostgreSQL新增进程中断用例：服务端收到请求后SIGKILL，先立即启动新进程，再在请求窗口过期后启动新进程，检查一次发送、UNKNOWN与费用预留保留。该新增用例本地未运行，待本批CI确认，不计为DB_TESTED。未覆盖全部AT-16进程故障位置。无新迁移；前50次迁移冻结。前批bf9b0a4已核实Actions36458539220五项通过，核心526/526、领域PostgreSQL24/24、49→50升级和恢复通过。真实供应商PROVIDER_VERIFIED=NOT_RUN；未合并、未部署。详见docs/release/AI_NETWORK_RECOVERY.md。以下保留历史证据。

## 2026-09-29 模型连接与 AI SDK 接入

模型接入已收敛为管理员填写 URL、协议、模型名称及密钥；支持 OpenAI Chat Completions / Responses / Anthropic Messages，无独立网关要求。密钥加密保存、固定短句连接测试、配置批准与后台真实 SDK 调用已接通。业务建议与未知费用分开：返回可用建议仍可人工采纳，缺少金额不记为免费、不自动重发。来源与权限继续逐次复查。

本批43/43 CORE_MEMORY_TESTED；类型、194条契约、静态检查、完整构建、transport PASS；系统 Chrome 的配置保存/响应丢失原键重试/密钥不回显/连接测试/启用及既有建议确认流程通过（MemoryStore 与模拟 HTTP）。第50次追加迁移、49→50保留数据和真实 PostgreSQL SDK链已纳入本次 CI，结果待确认；不沿用旧运行。前49次已应用迁移冻结。PROVIDER_VERIFIED=NOT_RUN，未提供真实端点/密钥、未发生付费调用；未合并、未部署。详见 docs/release/AI_MODEL_CONNECTION.md。以下为历史证据。

## 2026-09-29 本地接入前修正：外送总开关

AI发送、任务预留和启用状态现检查INTERNAL及INTERNAL_APPROVED；外送关闭仍可核对既有费用和停用配置。批准前复用账本配置校验，拒绝无效预算；页面按实际批准状态提供停用按钮。AI受影响33/33 CORE_MEMORY_TESTED，类型检查PASS；本地修正尚未推送，未重复触发完整CI，等待供应商/模型/协议及费用上限确定后与真实接入合并验收。本次无迁移，49次已应用迁移冻结。上一云端79856bf / Actions36449566292最终核心514/514、CI5/5；仅依赖下载超时任务单独重跑过，不替代本地修正验证。

## 2026-09-29 当前进展：AI 后台与费用核对

通用后台执行器、配置批准/停用、人工费用核对、不可改的证据关联和解冻记录及操作页面已接通。并发防重复发送、中断转未知保留费用、审计回滚及原键重试已测；44/44 CORE_MEMORY_TESTED，类型/191条契约/构建及本地测试替身浏览器 PASS。第49次追加迁移的真实 PostgreSQL、48→49保留未决费用和浏览器链待本批 CI，最终结果回填 PR。正式后台仅运行遗留请求隔离，真实适配器/密钥与价格加载/供应商查询仍未实现，普通部署仍关闭外送。未合并、未部署。详见 [AI_OPERATIONS.md](AI_OPERATIONS.md)。

上一批最终提交151efb9 / Actions36445472822已确认核心507/507、五条CI 5/5；此证据不替代本批验证。以下为历史记录。

## 2026-09-28 当前进展：AI 业务服务与页面

补充边界：原文不足时允许零条建议，已确认费用正常结算，不生成待采纳提议；AI专项12/12通过。第48次迁移已在云端应用并冻结，最终提交CI另行确认。

四类文字任务、独立来源许可、原文输入预览、建议差异与一次性多字段采纳、未核验来源证据、关联删除及恢复隔离已接通。AI/费用/恢复/语言受影响43/43 CORE_MEMORY_TESTED；本地浏览器交互通过，使用测试数据库替身；真实 PostgreSQL 和浏览器已接入既有 CI，待新提交结果。生产调用仍关闭，真实供应商/模型、配置审批、实际 Worker 和费用核对尚未完成，不能标记 AI 生产可用或整期完成。详见 [AI_BUSINESS.md](AI_BUSINESS.md)。前47次迁移冻结，本批仅追加第48次；未合并、未部署。

以下为此前批次的历史记录，已完成和剩余以本段及专项文档为准。

## 2026-09-28 AI 调用与费用底层进展

新增供应商无关的持久化预算/发送账本和事务外调度器：防重复发送、未知费用保留、取消不假装免费、超额冻结、配置/恢复批次变化阻断。AI与恢复专项25/25 CORE_MEMORY_TESTED，类型/契约/静态检查 PASS；第47次追加迁移的真实 DB 验收待新提交 CI。没有 AI HTTP/Worker 生产入口，没有真实供应商调用，四类任务、独立许可、提议采纳和页面仍未完成；不能标记 AI 或整期完成。详见 [AI_DISPATCH_LEDGER.md](AI_DISPATCH_LEDGER.md)。上一语言合并最终提交7bf33f7的CI36389831201已5/5通过，不替代本批验证。未合并、未部署。

数据库验收36388534437发现新合并样本的来源依赖由6条变为7条，旧固定数量断言漏更新；现精确校验总数7、合并文本3条依赖、双方来源ID以及完整历史一致，专项6/6通过。原运行四条浏览器通过、数据库失败；修正提交需重新验收，不沿用旧通过记录。

复核时间精度缺陷已复现并修正：同次保存与复核共用一个事件时间，最终语言专项18/18及类型检查通过。第46次迁移已在云端应用并冻结；最终提交的完整CI另行确认。

内部语言文本合并已接通：按语言选择正文、平铺保留双方原文和依据、合并后重新复核；连续合并、受控迁移、恢复检查与关联清理同步覆盖。新增第46次前向迁移，本地未应用或新增测试库；云端应用后冻结。当前受影响27/27 CORE_MEMORY_TESTED，最终复核时间专项及类型/契约检查通过；新提交云端数据库和浏览器结果待确认。AI供应商/模型/配置和费用上限待用户提供，AI业务链路仍未完成。未合并、未部署。见 `docs/release/LOCALE_MERGE.md`；以下为历史记录。

语言资料导出/重建已接通，并按用户明确要求将专业资料迁移收敛为单一 v14 格式，停止兼容开发期 v1～v13 文件；旧文件需重新导出。第45次迁移已应用并冻结。当前受影响迁移66/66、最终专项16/16 CORE_MEMORY_TESTED，完整类型检查 PASS；本轮不新增本地数据库或重复全量验收，云端共享核心检查只执行一次，五条业务验收保留。当前提交云端结果待确认；语言合并、AI与整体验收仍未完成，未合并、未部署。详见 `docs/release/LOCALE_TRANSFER.md`；以下条目为历史证据，不代表当前格式仍兼容。

内部中英文文本已接通人物/作品/项目页面及4条接口：明确来源、当前版本与范围复查、人工复核、未知结果原样重试。普通变化提示复核，安全变化限制正文；四类删除目标的衍生文本清理及审计回滚/重试、真实备份恢复已验。471/471 CORE_MEMORY_TESTED，完整 PostgreSQL + 最终语言专项 DB_TESTED，完整 Chromium BROWSER_TESTED，174条契约/类型/静态/最终构建/transport PASS。追加并冻结第43、44次迁移，42→44既有合成库60张原表内容摘要一致。证据见 `docs/release/INTERNAL_LOCALE_TEXTS.md`、`artifacts/internal-locale-texts-20260928/`。语言合并/导出重建尚未接通，相关旧入口明确阻断以免遗漏；AI、实际旧库过渡及正式环境验收继续。前批 `779d11c` / Actions36363283159为5/5，本批新head另验；未合并、未部署。

专业检索改用事务内关系/依据索引，仍逐次核对当前权限和来源；100/1000人三轮真实PG测试通过，领域SELECT分别固定37/43次。1000人同类合成数据新检索约700ms降至130ms、旧兼容约550ms降至140ms；这是本地对照，不冒充参考服务器性能验收。资质撤销→编号清除→独立依据保留→来源最终删除完整链路及审计回滚/重试已验。464/464 CORE_MEMORY_TESTED，完整 PostgreSQL（领域23/23、规模1/1）DB_TESTED、完整 Chromium BROWSER_TESTED，类型/契约/静态/构建/transport PASS。42次迁移冻结。证据见 `docs/release/TD2_SEARCH_SCALE.md`、`artifacts/td2-search-scale-20260928/`。TD2-T01～18已绑定 `ca833aa` / Actions36362121523的5/5，见指定提交矩阵；本批新head另验。AI、实际旧库过渡和正式环境验收尚未完成，未合并、未部署。

旧身高人工复核与受限资质编号清除已接通：明确不采用不生成量尺且保留旧值；清除编号只移除密文/尾号，保留核验状态和证明关系。463/463 CORE_MEMORY_TESTED，170条契约及类型/静态/构建/transport PASS；完整 PostgreSQL 链、领域/兼容22/22 DB_TESTED；完整 Chromium BROWSER_TESTED。新增操作均有人工作业确认、当前权限/来源版本复查、审计回滚和原键重试。42次迁移冻结。证据见 `docs/release/TD2_MANUAL_MAINTENANCE.md`、`docs/release/TD2_GATE_MATRIX.md` 与 `artifacts/td2-manual-maintenance-20260928/`。前批 `51a62af` / Actions36360806914 已确认5/5；本批head另验。AI与整期交付未完成，未合并、未部署。

旧候选工作台的结构化检索已接入当前专业事实、同作品/对应职业匹配、当前核验与全结果分类计数；纯旧库维持SQL路径，100/1000人实测均20次查询，未放宽既有上限。鞋码等不含身高的量尺确认不再关闭旧身高复核；明确身高确认与审计失败回滚/原键重试一致。462/462 CORE_MEMORY_TESTED，最终受影响11/11；完整 PostgreSQL 链及领域/兼容24/24 DB_TESTED；完整 Chromium BROWSER_TESTED；类型/契约/静态/构建/transport PASS。42次迁移冻结，本批无迁移。见 `docs/release/TD2_STRUCTURED_COMPATIBILITY.md` 和 `artifacts/td2-structured-compatibility-20260928/`。前批 `9abdebd` / Actions36359984803 已确认5/5，本批head另验；人工迁移复核界面和受限编号清除路径继续，未合并、未部署。

升级档案的旧列表/详情已改读当前专业事实；停用或来源不可用不回退显示历史列，旧专业字段写入/核验由服务端阻断，旧编辑页仅维护基本身份。460/460 CORE_MEMORY_TESTED，专项2/2；完整 PostgreSQL 链及领域/兼容19/19 DB_TESTED；真实 Chromium 编辑请求与原关系保留 BROWSER_TESTED；类型/契约/静态检查/构建/transport PASS。无迁移，42次冻结。见 `docs/release/TD2_LEGACY_PROJECTION.md`、`artifacts/td2-legacy-projection-20260928/`。前批 `9e00b53` / Actions36359307865 已确认5/5；本批head另验。旧结构化检索、身高复核及完整迁移收口继续；未合并、未部署。

人才 2.0 新增逐项真实 PostgreSQL 验收：16项领域子用例（含父项17/17）与带旧数据升级1/1通过，完整 PostgreSQL 链 DB_TESTED；保留原人物/作品/项目/原件 UUID，未知身高和多职业候选进入人工复核，不猜数据。类型/契约/静态检查 PASS。本批仅测试与 CI 接线，无生产代码或迁移变更，42次迁移冻结；本地浏览器/构建本批 NOT_RUN。见 `docs/release/TD2_DOMAIN_GATES.md`、`artifacts/td2-domain-gates-20260928/`。前批 `25c58f1` / Actions36358194843 已确认5/5；本批新head另验。Phase C 旧查询与旧写入口兼容问题已确认，继续修复；整体未完成、未合并、未部署。

已独立清理的合并旧身份可衔接后续来源删除：复查当前权限/范围和原清理证据，保留原映射/决定/清理记录，再逐项处理来源剩余资料；v14 重建同时保留原始来源与旧身份的最小 ERASED 头。458/458 CORE_MEMORY_TESTED，最终受影响5/5；完整 PostgreSQL 链与真实双库 CLI/回滚/重试 DB_TESTED，完整 Chromium 分步确认与实际下载 BROWSER_TESTED，类型/契约/静态检查/最终构建 PASS。无迁移，42次既有迁移冻结。见 `docs/release/TD2_SOURCE_HISTORY_CLEARANCE.md`、`artifacts/td2-source-history-clearance-20260928/`。前批 `5bff720` / Actions36357399190 已确认5/5；本批新head另行核对。仍有载荷的 SOURCE 历史组合及 TD2 全量验收继续，未合并、未部署。

合并历史的 PERSON 专用清理和 v14 导出/重建已接通：整个人物或单独旧身份显式确认后清除旧内容，保留原编号映射/原合并决定及追加清理记录；单旧身份清理不改变主档案。455/455 CORE_MEMORY_TESTED；完整 PostgreSQL 链、真实回滚/重试、双库 CLI、已有库升级及实际备份恢复 DB_TESTED；真实 Chromium 旧身份入口→逐项确认→清理→历史显示→v14 下载 BROWSER_TESTED；类型/契约/静态检查/构建 PASS。第42次前向迁移已应用并冻结，两个旧库各59表旧内容摘要未变。见 `docs/release/TD2_MERGE_HISTORY_ERASURE.md`、`artifacts/td2-merge-history-erasure-20260928/`。前批 `89c5a80` / Actions36355302767 已确认5/5；本批新head另行核对。SOURCE 合并历史组合及全量交付继续，未合并、未部署。

来源拥有专业资料并同时提供其他人物身份证据的组合清理已接通：逐项确认具体人物/字段，撤回指定来源证据，保留原身份与独立核验；最终完成重查冻结依据。448/448 CORE_MEMORY_TESTED，最终受影响17/17；完整 PostgreSQL 链与真实事务回滚/重试 DB_TESTED；真实 Chromium 逐项撤回和人物/字段显示 BROWSER_TESTED；类型/契约/静态检查/最终构建 PASS。无新迁移，既有41次保持冻结。见 `docs/release/TD2_SOURCE_OTHER_IDENTITY.md`、`artifacts/td2-source-other-identity-20260928/`。前批 `180eccd` / Actions36354263739 已确认5/5；本批新head另行核对。合并历史清理及整体交付继续，未合并、未部署。

保留身份的许可导出/重建已接通 v13：独立用途依据单列绑定，原始 ERASED 来源仅迁移最小头，完整身份字段及原核验归属保留，普通联系人不自动转人才。444/444 CORE_MEMORY_TESTED；真实双库 CLI、审计回滚/重试、数据库约束及含新许可的备份恢复 DB_TESTED；真实 Chromium 审批与下载 BROWSER_TESTED；类型/契约/静态检查/构建 PASS。新增第41次前向迁移已在新库及两个既有合成库应用，59表旧内容摘要均未变。见 `docs/release/TD2_IDENTITY_ORIGIN_TRANSFER.md` 和 `artifacts/td2-identity-origin-transfer-20260928/`。前批 `5f86a72` / Actions36353019303 已确认5/5；本批新 head 另行核对。合并历史清理及整体交付继续，未合并、未部署。

人物身份已有完整独立字段依据时，可在删除最初来源后保留；原始来源编号、原核验归属不改写。普通联系人、专业事实、独立联系方式/候选和代表关系分别处置，依据失效阻断最终完成；旧重绑计划明确停止。440/440 CORE_MEMORY_TESTED，最终受影响58/58及旧计划3/3；完整 PostgreSQL 链与真实回滚/重试 DB_TESTED，真实 Chromium 逐项保留 BROWSER_TESTED，类型/契约/静态检查/构建 PASS；证据见 `artifacts/td2-identity-retention-20260928/`、`docs/release/TD2_IDENTITY_RETENTION.md`。本批无迁移。前批 `735652f` / Actions36351620769 已确认5/5；本批新head另行核对。保留身份的许可导出/重建、合并历史清理及完整交付继续推进，未合并、未部署。

来源所属人物及整份专业档案已支持显式删除：全部跨来源事实、身份证据、候选和他人代表关系进入冻结图，审计失败整组回滚；本来源原件实际销毁，独立人物和其他来源原件保留。437/437 CORE_MEMORY_TESTED；完整 PostgreSQL 链、真实审计/最终范围回滚与重试 DB_TESTED；真实 Chromium 逐项确认与实际原件销毁 BROWSER_TESTED；类型/契约/静态检查/构建 PASS，无迁移。证据：`artifacts/td2-source-person-erasure-20260928/`，详见 `docs/release/TD2_SOURCE_PERSON_ERASURE.md`。前批 `9c9a947` / Actions36350532055 已确认5/5，本批新head另行核对。人物身份有据保留、合并保留历史清理及整体交付继续推进，未合并、未部署。

已删来源的保留专业资料已支持 v12 许可导出与真实 CLI 重建：只迁移原来源最小 ERASED 头，逐字段独立依据和原核验归属保留，不恢复已删除来源内容、不允许重新激活。436/436 CORE_MEMORY_TESTED，专项4/4；完整 PostgreSQL 链及真实双库 CLI 预览/执行、审计回滚/再次迁移 DB_TESTED；真实 Chromium 逐项许可与 JSON 下载 BROWSER_TESTED；类型/契约/静态检查/构建 PASS，无迁移。证据：`artifacts/td2-retained-origin-transfer-20260928/`，详见 `docs/release/TD2_RETAINED_ORIGIN_TRANSFER.md`。前批 `0d5172d` / Actions36349592454 已确认5/5，本批新head另行核对。人物原始来源、合并保留历史清理及整体交付继续推进，未合并、未部署。

专业事实与来源原件已合并为同一冻结图、同一事务：保留完整独立依据支持的语言/集合，删除所选职业，清理共享原件引用并使资格失效；审计失败整组回滚。最终完成再次检查保留资料范围。432/432 CORE_MEMORY_TESTED，完整 PostgreSQL 链及联合清理、实际文件销毁、范围失效后恢复 DB_TESTED；类型/契约/静态检查/构建 PASS。真实 Chromium 联合保留/删除与延迟响应期间按钮锁定 BROWSER_TESTED，连续决定的旧版本竞态已修复。本批无迁移。证据：`artifacts/td2-source-combined-erasure-20260928/`，详见 `docs/release/TD2_SOURCE_COMBINED_ERASURE.md`。前批 `c9ffcca` / Actions36348422058 已确认5/5；本批新head另行核对。人物原始来源、保留合并历史和已删来源保留事实的迁移继续推进，未合并、未部署。

来源原件已支持整批共享引用清理：同源多张原件一次评估并清除集合/资格引用，其他来源原件与核验历史保留，再实际销毁目标原件/预览。430/430 CORE_MEMORY_TESTED；完整 PostgreSQL 链及多原件审计回滚/重试、实际文件销毁 DB_TESTED；真实 Chromium 多原件来源删除 BROWSER_TESTED；类型/契约/静态检查/构建 PASS，无迁移。证据：`artifacts/td2-source-asset-erasure-20260928/`。前批 `fbf2fa4` / Actions36347558830 已确认5/5；本批新head另行核对。字段事实与原件联合清理、人物原始来源、保留历史及完整交付继续推进，未合并、未部署。

来源专业事实已支持逐项保留/删除：每项保留须有覆盖全部注册字段的独立现成依据，删除上级时关联下级必须明确处置；原候选备注保留，失去职业的候选转待核实。整组修改与审计同事务，原来源/核验归属不重写。428/428 CORE_MEMORY_TESTED；完整 PostgreSQL 链和含“已删来源+保留事实”的真实数据库/媒体备份恢复 DB_TESTED；真实 Chromium 逐项选择 BROWSER_TESTED；类型/契约/静态检查/构建 PASS，无迁移。证据：`artifacts/td2-source-fact-erasure-20260928/`。前批 `fbf14c2` / Actions36346464407 已确认5/5，本批新head待核对。人物原始来源、来源原件、合并保留历史及其他完整交付边界继续推进，未合并、未部署。

独立字段来源删除已接通：已有另一份当前有效、同值依据时，显式确认后清除指定来源的证据与建议，保留事实和其他来源原核验归属。425/425 CORE_MEMORY_TESTED，完整 PostgreSQL 链及审计回滚/重试 DB_TESTED，真实 Chromium 预览→确认→冻结→完成 BROWSER_TESTED；类型/契约/静态检查/构建 PASS，无迁移。证据：`artifacts/td2-source-evidence-erasure-20260928/`。前批字段依据浏览 `8faf105` / Actions36345969123 已确认5/5；本批新head另行核对。来源拥有专业档案、仅存该来源依据、合并保留历史清理及完整交付继续推进，未合并、未部署。

字段依据浏览已接入专业工作台：逐字段分页显示当前依据、旧值、来源状态与版本，以及原环境核验归属；隐藏来源不进入结果和总数，不返回字段摘要或资格密文。421/421 CORE_MEMORY_TESTED，类型/契约/静态检查/构建 PASS；完整 PostgreSQL 链 DB_TESTED；真实 Chromium 新旧依据、来源暂停、身份字段无记录到显式核验、只读隐藏 BROWSER_TESTED。本批无迁移。证据：`artifacts/td2-evidence-history-20260928/`。新 head 云端待核对；此前 `2215759` / Actions36344962579 已确认5/5。SOURCE保留清理、合并历史清理及完整交付仍在推进，未合并、未部署。

共享图片专用删除已接通：人工确认后移出集合引用、撤销资质当前状态、将成年资格置为未知并使待审建议失效；其他原件与历史核验证据保留。419/419 CORE_MEMORY_TESTED，类型/契约/静态检查/构建 PASS；完整真实 PostgreSQL、共享引用审计回滚重试与物理文件删除 DB_TESTED；真实 Chromium 影响→决定→冻结→清理及原件目录检查 BROWSER_TESTED。执行时重新检查发起者当前资格和范围。本批无迁移。证据：`artifacts/td2-shared-asset-erasure-20260928/`。SOURCE多来源保留/删除、合并保留历史及完整交付继续推进，未合并、未部署。

详见 [共享图片清理](TD2_SHARED_ASSET_ERASURE.md)。

云端运行36343700978暴露量尺确认后的浏览器断言竞态：数据库已为CONFIRMED，但测试在提交响应到达后立即检查旧页面。现先等待页面明确显示“已确认”，再断言没有编辑入口；保留数据库与UI两层断言，未加sleep、刷新或扩大超时。修正后整条真实Chromium流程再次通过；新head五条CI需重新确认。

候选职业选择与人工复核已接通：同一人物按不同职业分别入选，作品须匹配本次职业；旧候选升级保留原编号/备注并逐项待核实，不猜职业。416/416 CORE_MEMORY_TESTED，服务/React/core/transport类型、契约、静态检查及构建 PASS；完整 PostgreSQL 链（含原合同67/67、职业上下文/升级的审计回滚重试、真实备份恢复与各版重建）DB_TESTED；真实 Chromium 双职业入选、合并后人工复核、响应丢失原请求回放 BROWSER_TESTED。证据：`artifacts/td2-candidate-context-20260928/`。本批无新迁移；复杂来源/共享媒体/保留历史清理及完整交付仍待继续，未合并、未部署。

详见 [候选职业衔接](TD2_CANDIDATE_CONTEXT.md)。

专业工作台已接通人物建档、基本身份、多职业/语言、量尺与成年资格、翻译方向、能力和机构登记、资质编号、集合素材、字段建议及专业组合检索。412/412 CORE_MEMORY_TESTED；服务/React/core/transport类型、契约、静态检查与构建 PASS。真实 PostgreSQL + Chromium 表单验证通过，覆盖响应丢失后原请求回放、旧版本冲突、只读账号与来源暂停清屏。证据：`artifacts/td2-workbench-20260928/`。本批无数据库迁移；完整人才2.0仍未完成，角色候选衔接、复杂来源/共享媒体/历史清理及全部交付证据继续推进。

详见 [专业工作台](TD2_PROFESSIONAL_WORKBENCH.md)。

职业不明候选碰撞已支持人工选择保留项；两边复核记录的 UUID、原因和状态保留，原候选编号只追加，合并不会代替人工职业核实。412/412 CORE_MEMORY_TESTED，类型、契约、静态检查及完整构建 PASS；真实 PostgreSQL 双向选择、审计回滚/同键重试、SQL 历史保护和完整数据库链 DB_TESTED；真实 Chromium 合并与既有迁移流程 BROWSER_TESTED。40 次前向迁移在新空库通过，两个既有合成库各59表原内容摘要未变，其中一库显式含升级前复核记录；真实备份恢复保留新候选历史。证据：`artifacts/td2-candidate-review-20260928/`。完整人才2.0仍未完成；工作台、复杂来源/媒体清理继续开发，未部署。

详见 [候选复核合并](TD2_CANDIDATE_REVIEW_MERGE.md)。

411/411 CORE_MEMORY_TESTED；服务、React、core、transport 类型、契约、静态检查与构建 PASS。完整 PostgreSQL 链（原合同67/67、新增合并历史双库CLI、审计回滚/重试、SQL 历史保护、含原合并归属的真实数据库与私有媒体恢复）DB_TESTED；真实 Chromium v11 授权与历史/原件组合下载、撤权拦截 BROWSER_TESTED。新空库39迁移通过；两个保留合成库各59表摘要不变，其中一库保有3次真实合并。 证据：`artifacts/td2-merge-history-transfer-20260928/`；当前 head 云端结果另行核对。

当前接续：[合并保留历史迁移](TD2_MERGE_HISTORY_TRANSFER.md)增加 v11；旧身份、原合并决定及操作者、保留主档案与量尺关系一起迁移，目标不伪造新合并。人才 2.0 整体仍未完成。

前批：[身份字段来源证据迁移](TD2_IDENTITY_EVIDENCE_TRANSFER.md)增加 v10；普通联系人无需人才档案即可按独立许可迁移所选身份字段的来源和原核验记录。整体人才 2.0 仍未完成。

408/408 CORE_MEMORY_TESTED（新增6项）；服务、React、core、transport 类型检查、契约与构建 PASS。完整 PostgreSQL 链（原合同67/67）、独立双库身份字段真实CLI CHECK/APPLY、审计回滚/重试和重新导出比对 DB_TESTED。真实 Chromium v10 身份与专业/证明原件组合、原核验归属及证据许可撤销 BROWSER_TESTED。新空库38迁移通过，既有合成库59表摘要不变。 证据见 `artifacts/td2-identity-evidence-20260928/`。

前批：[成年资格与原核验归属迁移](TD2_ADULT_TRANSFER.md)增加 v9；独立许可、原证明和核验证据一起保留，目标不伪造核验人或延长有效期。完整人才 2.0 仍未完成。

**402/402 CORE_MEMORY_TESTED**；服务、React、core、transport 类型检查、构建与契约检查 PASS。完整 PostgreSQL 链（原合同 67/67、新增成年资格双库真实 CLI、审计回滚/重试、SQL 约束、含原核验记录的数据库与私有媒体恢复）DB_TESTED；新空库 37 个迁移通过。真实 Chromium 的 v9 授权、下载、原件摘要和撤权拦截通过。既有合成库 59 表原有记录摘要不变；该旧库成年资格表为空，不将它冒充历史成年资格升级数据覆盖。证据见 `artifacts/td2-adult-20260928/`。

前批：[媒体集合与内容标签迁移](TD2_COLLECTION_TRANSFER.md)增加 v8 白名单；图片顺序、说明、推荐标记及归档状态保留，共享文件只迁移一份。完整人才 2.0 仍待继续验收。

前批：[资质证明原件迁移](TD2_PROOF_MEDIA_TRANSFER.md)已接入独立图片/来源许可、真实文件下载和隔离重建；已核验状态与附件关系保留。完整人才 2.0 尚未完成，证据见该页与当前 head CI。

# 2026-09-27 无附件资质与加密编号迁移验证

基线 `23e0017`。**389/389 CORE_MEMORY_TESTED**（新增7项并扩展原往返）；164请求契约、服务/React/core/transport类型检查、构建及静态检查 PASS。PostgreSQL 原合同67/67、完整数据库/媒体恢复链 DB_TESTED。双库真实CLI CHECK/APPLY恢复19条专业记录（含3条无附件资质、其中2条加密编号）；校验原编号、遮罩、状态/日期和原ID，密文在目标工作空间/目标密钥下重新生成且可解密。错误源密钥时目标人物仍为零；最终审计故障业务/证据全部回滚，正确重试通过。目标非空拒绝规则保持。

新空库34迁移通过；保留合成库应用008后59表原有记录摘要一致，既有证据原核验列仍为空。真实Chrome单独批准资质与编号、下载v6核对密文/遮罩/原工作空间且无编号明文，独立证据许可撤销后拒绝下载，BROWSER_TESTED。另验缺敏感读/写权限、旧actor捕获后权限撤销、编号变更、坏密文/遮罩/上下文、证明附件/VERIFIED资质阻断及私有键文件检查。无编号资质不需敏感许可或键文件；v1-v5保留兼容。

证据 `artifacts/td2-credentials-20260927/`；范围见 [TD2_CREDENTIAL_TRANSFER.md](TD2_CREDENTIAL_TRANSFER.md)。未改旧迁移、未清库、未放宽断言或超时。本轮不把带证明原件的资质算作完成。新源码交付包、正式升级/部署和完整TD2-06 NOT_RUN；最终head五条CI见PR。

---

# 2026-09-27 字段来源证据迁移验证

基线 `936d025`。**382/382 CORE_MEMORY_TESTED**（新增5项并扩展原往返）；164请求契约、服务/React/core/transport类型检查、构建和静态检查 PASS。PostgreSQL 原合同67/67及完整恢复链 DB_TESTED；双库真实CLI check/apply保留16条专业记录及所选字段证据，原核验归属不绑定目标账号，审计失败证据与业务一起回滚，重试成功。数据库约束拒绝不完整原核验归属及原归属/本地核验并存。真实 pg_dump/pg_restore+私有媒体演练加入原核验归属记录，恢复后逐字段完全一致。

新空库33个迁移通过；在保留合成库应用007后，59张表的原有列记录摘要一致，新列全部为空。真实Chrome批准证据独立来源、下载v5、核对原证据ID/来源/摘要/核验人/时间，撤销仅证据来源的许可后下载拒绝，BROWSER_TESTED。证据 `artifacts/td2-field-evidence-20260927/`，范围见 [TD2_FIELD_EVIDENCE_TRANSFER.md](TD2_FIELD_EVIDENCE_TRANSFER.md)。未修改旧迁移、未清库或放宽超时/断言。正式升级、部署、新交付包和完整TD2-06 NOT_RUN；最终head五条CI另以PR记录为准。

初次专项暴露SOURCE许可白名单未接入新证据字段，已修复服务端许可校验及后台/下载的v5重查；没有改测试规避失败。旧源码包检查未重跑，不将历史失败冒称已修复。

---

# 2026-09-27 职业候选合并验证

基线 `1cd4e22`。**377/377 CORE_MEMORY_TESTED**（新增4项）；164请求契约、类型检查、构建与静态检查 PASS。PostgreSQL 16 原合同67/67和完整恢复/重建链 DB_TESTED，最终专项再次验证职业候选原ID/上下文保留、审计失败全事务回滚及原请求键重试。真实 Chrome 在同一作品下合并两个职业候选，核对备注及原选图关联逐条不变，停用职业对应候选保留但不可用，BROWSER_TESTED。

清单范围收回、素材读取权限不足及预览后备注/选图依赖变化均有回归；职业不明且有关联复核的真实碰撞继续阻断。证据 `artifacts/td2-role-candidates-20260927/`，范围见 [TD2_ROLE_CANDIDATE_MERGE.md](TD2_ROLE_CANDIDATE_MERGE.md)。无新迁移，新空库应用现有迁移；未改写旧迁移、未清库、未放宽断言或超时。最终head五条CI以PR记录为准。新交付包、正式升级/部署、完整人才2.0仍为 NOT_RUN。

---

# 2026-09-27 代表关系迁移验证

基线 `2a7d914`。**373/373 CORE_MEMORY_TESTED**（新增4项并扩展原往返）；164请求契约、服务/React/core/transport类型检查、构建和静态检查 PASS。PostgreSQL 16 原合同67/67及完整恢复/重建链 DB_TESTED；双库真实CLI check/apply核对16条专业记录、1条能力定义、1条共享机构及2个人物。独立个人代表原ID和机构/职业/有效期/停用状态保持，审计失败后人物/机构/定义均为零，重试成功。新空库全迁移和保留合成库59表原记录摘要一致；ERASED导出保留。真实Chrome独立批准代表人、选择个人/机构代表关系、下载v4并核对两种关联、撤销关联来源后下载拒绝 BROWSER_TESTED。

证据 `artifacts/td2-representations-20260927/`；范围见 [TD2_REPRESENTATION_TRANSFER.md](TD2_REPRESENTATION_TRANSFER.md)。没有跳过或放宽失败断言、没有改超时。本地通过不替代最终head五条CI；正式迁移/部署、新源码包、完整TD2-06 NOT_RUN。历史包检查未重跑，不冒称已修复。

---

# 2026-09-27 外部标识及机构迁移验证

基线 `148ffac`，最终 **369/369 CORE_MEMORY_TESTED**（新增4项并扩展原往返）；164请求契约、服务/React/core/transport类型检查、构建和静态检查 PASS。真实 PostgreSQL 16 原合同67/67及完整重建/恢复链 DB_TESTED；双库 CLI check/apply逐项核对14条专业记录、1条能力定义和1条独立来源机构，审计失败后人物/定义/机构均为零，重试成功。保留合成库59表原记录摘要一致，保留ERASED导出。真实Chrome批准人物及各来源外部标识分组、下载v3、核对机构原ID/来源及核验状态、撤销机构来源许可后再次下载拒绝 BROWSER_TESTED。新证据 `artifacts/td2-external-20260927/`，范围见 [TD2_EXTERNAL_TRANSFER.md](TD2_EXTERNAL_TRANSFER.md)。正式迁移、部署、新交付包验收和完整TD2-06 NOT_RUN；CI以本次最终head为准。

初次新测试把“机构名称变更后新申请”也误判为必须拒绝；实际规则是旧快照失效、新申请使用新名称。修正为同时验证旧下载/排队任务拒绝、新申请成功。首次启动测试容器后数据库尚未就绪，包装脚本连接失败；确认 pg_isready 成功后才运行迁移和测试，没有清库或改超时。历史源码包检查未在本轮重跑，不冒称已修复。

---

# 2026-09-27 能力与字典迁移验证

基线 `83d9224`。最终 **365/365 CORE_MEMORY_TESTED**（新增 4 项并扩展原往返）；能力专项 8/8。164 请求契约、服务/React/core/transport 类型检查、构建和静态检查 PASS。真实 PostgreSQL 原合同 67/67、恢复链、双库 CLI 预检/重建 DB_TESTED，逐项核对 11 条专业事实与 1 条能力定义，审计故障回滚包含字典。保留合成库 59 表记录摘要不变，含 ERASED 导出。真实 Chrome 人物/双来源许可、能力及字典 JSON 下载、撤销后再次下载拒绝 BROWSER_TESTED。详见 [本轮范围](TD2_CAPABILITY_TRANSFER.md)，证据 `artifacts/td2-capabilities-20260927/`。

额外试跑旧 `review:package` 未通过：该检查面向净源码交付包，本开发目录包含 .git/dist/node_modules，且它比对的是保留的历史 verification 指纹。未修改旧证据或检查规则；新源码包验收不计 PASS。当前文件清单另以 MANIFEST 校验；分类记录见本轮 package-check-boundary.json。

最初全量核心测试 364/364，随后补停用共享定义与空关联验证，最终重新完整运行 365/365；没有跳过、放宽断言或增加超时。正式迁移/部署/完整人才 2.0 为 NOT_RUN；最终五条 CI 以 PR #26 本轮提交为准。

---

# 2026-09-27 专业导出与重建验证

基线 `8e2b80d`。**361/361 CORE_MEMORY_TESTED**；164请求契约、服务/React/core/transport类型检查、构建和静态检查 PASS。原PostgreSQL合同67/67、完整恢复/重建链及新增双库专业往返 DB_TESTED；新格式真实CLI check/apply通过。旧合成库59张业务表原列/记录摘要一致，含1条ERASED导出。真实Chrome双来源许可、下载、撤销后应用再次下载拒绝 BROWSER_TESTED。范围、失败原因与未完成项见 [TD2_TYPED_TRANSFER.md](TD2_TYPED_TRANSFER.md)，新证据 `artifacts/td2-transfer-20260927/`。最终云端以PR #26当前head为准；正式迁移/部署/完整TD2-06 NOT_RUN。

---

# 2026-09-27 专业冲突合并验证

接续 `ad24bd8`，本轮 **357/357 CORE_MEMORY_TESTED**（原 354，加 3 个核心用例并扩展既有断言）。164 请求契约、服务/React/core/transport 类型检查、静态检查和构建 PASS。真实 PostgreSQL 16 空库、保留合成库前向升级、专业冲突/SQL历史不可改/回滚重试、完整原合同 67/67、重建和 DB+私有媒体恢复链均 DB_TESTED。实际恢复演练含已保留的专业历史及其别名。真实 Chrome production 链通过，新增逐项冲突选择与只读历史查看 BROWSER_TESTED。详见 [范围和未完成项](TD2_CONFLICT_MERGE.md)，日志 `artifacts/td2-conflicts-20260927/`。最终远端结果以本次提交的 PR #26 Actions 为准；正式迁移、部署、生产提供方和完整 TD2-06 NOT_RUN。

首次浏览器启动的测试包装脚本预先迁移数据库，被原有“必须空库”断言拒绝；修正包装脚本后使用另一新空库，未清库、未改弱断言。首次新核心断言错误地假定合成资质绑定职业；改为验证实际原绑定完全保留。没有以跳过测试或增加等待时限换取通过。

---

# 2026-09-27 人才 2.0 无冲突专业图合并验证

基线 `e8906b3`；本轮核心回归 **354/354，CORE_MEMORY_TESTED**。完整服务/React 类型检查、163 请求契约、静态检查与构建 PASS。新增共享专业合并断言在真实 PostgreSQL 16 新空库通过，DB_TESTED，覆盖稳定 ID/原来源、候选职业关联、密文解密、审计后回滚、同键重试/重放。完整 PostgreSQL 验收通过：原合同 67/67、T29 重建、恢复检查、DB+media 恢复、TD2 删除/恢复及新增独立合并库全部 PASS；真实 Chrome 的 production 主链与新增逐项确认/职业/语言/集合/素材保留验收通过，BROWSER_TESTED。远端最终 CI 以 PR #26 当前 head 的 Actions 为准。本轮日志在 `artifacts/td2-merge-20260927/`，没有覆盖旧阶段证据。详见 [本轮范围与边界](TD2_MERGE_CONTINUATION.md)。

---

## Talent 2.0 当前验收边界

当前分支PR #26。详见 [TD2_MAINTENANCE_STATUS.md](TD2_MAINTENANCE_STATUS.md)。
本批本地核心347/347；新增真实PG专业图删除/恢复与原DB+media演练中的TD2记录。
最终远端结果按PR当前head核实，不能用下述历史运行作为TD2全Gate通过证据。

# 实际测试与验证记录

## WP7｜DEV-07H / T29 隔离 JSON 重建

详见 [WP7_JSON_REBUILD.md](WP7_JSON_REBUILD.md)。功能冻结 head `feeab369396bf85536c92e3f8812d2bd50d3be9a`，PR #18。

Actions `36220456451` 五项全绿：103 条请求契约；274/274 core/transport；rebuild core 11/11；原 PostgreSQL 合同 67/67；真实 once-export-v1 → fresh once_rebuild_* PostgreSQL 1/1；browser-resume 17/17；原生表单 Chromium 6/6；browser-production / handoff / media 全部 success。

T29 真链路不是手造内存数据：在 source PostgreSQL 通过正式 Application API 创建 10 Person、3 Work、1 Project 与关系，创建 INTERNAL_EXPORT UsePermission，真实 Export Worker 生成 READY payload 与 payloadDigest；随后创建独立 once_rebuild_* PostgreSQL，migrate + bootstrap，CHECK 零写，注入 audit fault 验证 APPLY 整事务回滚，再通过 CLI 使用真实 payloadDigest APPLY，并直接查询 PostgreSQL 验证稳定 UUID、3/2/3 条关系和 Source BASELINE。

CLI 另验证普通 once_test_* URL 拒绝、digest mismatch 在数据库访问前拒绝、APPLY 必须 ALLOW_REBUILD=yes、第二次 APPLY 因目标非空拒绝。不会恢复 Session、Contact、Evidence、Export 或媒体字节；ACTIVE Work / ACTUAL participant 因缺失必要材料拒绝伪造。

对抗审查后额外修复：SourceHistory BASELINE 必须 actorId/decisionReason 均为 null；目标可通过正常 API 预置 Dictionary 而不会被 CommandReceipt 误判为业务污染；同一 Asset 可跨 Work 复用但 identity 必须一致；重建不能绕过正常 API 的重复分类、空白标题、每根关系/媒体上限；rebuild.apply Audit 绑定源 exportId。


## WP6｜DEV-07G 受控 Person merge

详见 [WP6_PERSON_MERGE.md](WP6_PERSON_MERGE.md)。功能冻结 head `1673272979e338ede4ddf09952c941cae7344070`，PR #17。

Actions `36217418690` 五项全绿：103 条请求契约；263/263 core / transport；67/67 PostgreSQL；原生表单 Chromium 6/6；browser-resume / handoff / media / production 全部 success。

browser-production 真实完成“选择 canonical / duplicate → 影响 preview → 字段冲突决定 → execute → PersonMergeDecision + PersonAlias → old ID 详情只读解析 → old ID 写入 409 → normal list/search 不再出现 duplicate”。真实 PostgreSQL 验证 decision/alias 唯一性、append-only/no-chain、身份/来源复合 FK、old ID 只读解析与 SQL talent search 排除。

对抗审查后额外关闭：old-ID scope 探测、Shortlist 身份基线陈旧、无 sensitive.write 时 Contact 数量枚举、不同 Source 的 profile 值被静默重新归因。最后规则是同 Source 可显式采用 duplicate / UNION，不同 Source 的字段冲突只允许 canonical。

Audit 注入失败时整个 merge 回滚，同一 Idempotency-Key 可安全重试；UsePermission / Handoff 撤销而非转移。当前仍未执行正式数据接管。

## DEV-07F 删除专用最终化

功能 head `f3396a6b4585b04896a9e381efac4cc68e968462`，Actions `36112160471` 五项全绿：101 routes、253/253 core、66/66 PostgreSQL、Chromium 表单 6/6，四条 browser 主链 success。

真实验证包括 Project 根 ERASED 最小头与 COMPLETED、local 原件/预览物理 purge、SourceHistory 单向脱敏、伪造 terminal state 被拒、finalization audit rollback + retry。


## WP5｜DEV-07C～07E 删除阻断、保留决定与依赖清理

详见 [WP5_DELETION_CLEANING.md](WP5_DELETION_CLEANING.md)。功能 head `32316937b91c7f66c9ed14a368ac74c2b58eed5b`，PR #14。

Actions 36096878872 五项全绿：101 条请求契约；251/251 核心/传输；63/63 PostgreSQL；原生表单 Chromium 6/6；browser-resume / handoff / media / production 全部 success。

真实 Chromium 完成 DRAFT → BLOCKED_FOR_USE → REVIEW_REQUIRED 人工决定 → planDigest → CLEANING，并证明 ProjectParticipant / ProjectWork 被实际删除、每个 cleanup item 有 cleanupEvidenceDigest，而 Project 根仍在数据库且持续 404。

真实 PostgreSQL 另验证：Contact / FieldEvidence 真删除、UsePermission 真撤销、Export 真收敛为 ERASED 最小头、ExportDependency 真删除；cleanup item 删除后的 audit 写失败会使关系删除整事务回滚，随后 Worker 可安全重试；012 前向迁移封堵 PostgreSQL CHECK 的 NULL/UNKNOWN 绕过。

当前 SourceHistory、媒体物理对象和根实体专用清理仍会停在 WAITING_EXTERNAL / CLEANING，因此 FR-13/T13 未完整完成。

## WP4｜DEV-07B 删除影响预览与 DRAFT 申请

详见 [WP4_DELETION_IMPACT_PREVIEW.md](WP4_DELETION_IMPACT_PREVIEW.md)。功能 head `9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273`，PR #11。

Actions [36019151162](https://github.com/BA7IEE/once-production-os/actions/runs/36019151162) 五个 job 全绿：96 条请求契约；237/237 核心/传输；52/52 PostgreSQL；原生表单 Chromium 6/6；browser-resume / handoff / media / production 均 success。

新增核心测试覆盖：预览零写入；DRAFT 不阻断目标；预览后新增依赖使旧 digest 失效；隐藏 Work 依赖只计 unresolved 且不泄露 ID；可见 Source 下隐藏 scope 子对象同样不被枚举；Source 预览能追到人物/作品/用途许可/旧导出；持久化申请只返回摘要；无 data.delete 成员不能预览或枚举申请。

真实 PostgreSQL 另验证：typed target/source FK；unresolvedCount 不能持久化；DRAFT 冻结具体影响但目标仍存在；DeletionRequest / DeletionItem / Audit / Receipt 四类写后故障整事务回滚。

Chromium 实际通过“删除影响评估 → 选择人才 → 预览作品/项目/Shortlist/旧导出依赖 → 创建 DRAFT”，随后确认人才仍返回 200，页面没有执行删除/清理按钮。

当前没有 BLOCKED_FOR_USE、protectionEpoch 阻断、清理 Worker、ERASED 头、保留决定执行或 Person merge，因此 FR-13/T13 仍未完成。


## WP3｜DEV-07A 内部 JSON 导出与依赖

详见 [WP3_EXPORT_DEPENDENCIES.md](WP3_EXPORT_DEPENDENCIES.md)。功能 head `19585fb4382ac781d9e2688320ec8e1071340c92`，PR #10。

Actions [36005508490](https://github.com/BA7IEE/once-production-os/actions/runs/36005508490) 五个 job 全绿：92 条请求契约；230/230 核心/传输；46/46 PostgreSQL；原生表单 Chromium 6/6；browser-resume / handoff / media / production 均 success。

新增真实验证：精确 INTERNAL_EXPORT 许可、TEMP_ORGANIZE 拒导出、data.export 不扩张 sources.read、冻结字段不含联系人/source原文/秘密、普通内容修改保持旧快照并标 contentChanged、部署 egress 关闭时只读元数据不可下载、来源暂停/许可撤销整件失效、两端显式选择才导出关系。真实 PostgreSQL 另验证错来源 FK、字段白名单 CHECK、权限 CHECK、Worker READY payload 及四类写后故障整体回滚。

Chromium 实际通过“用途审批 → Worker JSON → 浏览器下载”，随后暂停人才来源，旧导出详情显示依赖失效且无下载按钮。首两次失败分别是父 modal 未关闭和测试用未展示 UUID 定位行；均只修测试交互，不放宽业务规则。

当前没有正式资料、生产出口、旧库升级、完整 T29 重建、受控删除/合并或恢复演练。JSON 导出不是备份。


## WP2B｜行业/作品类型与 SQL 查询下推

详见 [WP2B_SEARCH_FACTS_SQL.md](WP2B_SEARCH_FACTS_SQL.md)。功能 head `6a7ad1ab184486adaa57edf4295ba13eef905ef0`，PR #8。

Actions [35995053306](https://github.com/BA7IEE/once-production-os/actions/runs/35995053306) 五个 job 全绿：85 条请求契约；223/223 核心/传输；40/40 PostgreSQL；原生表单 Chromium 6/6；browser-resume / handoff / media / production 均 success。

新增真实验证包括 Work 行业/作品类型字典与数据库 CHECK、私有作品不贡献他人搜索命中、当前可见署名作品驱动行业/类型命中、普通结果分页与 Facets PostgreSQL 聚合、100/1000 人搜索均 16 次 SQL，以及浏览器从作品事实录入到候选工作台筛选的完整链路。

CI 本轮 PG 观察值约 19ms / 16ms，仅用于回归，不等于 4vCPU/8GB 三轮 P95 规格验收。核验时效仍由 core 批量复算 valueDigest/sourceRevision；来源 visible IDs 仍通过 loadVisibility 批量计算，因此不宣告完整 SQL 授权下推。


## WP2｜结构化检索与内部候选清单

详见 [WP2_SEARCH_SHORTLISTS.md](WP2_SEARCH_SHORTLISTS.md)。基线 `c349af4`（PR #5）；功能代码固定 head `3db6b1810ac46423eedf6f8ff91b57f1b766d95f`，PR #7。

GitHub Actions [35985423108](https://github.com/BA7IEE/once-production-os/actions/runs/35985423108) 五项 job 全部实际成功：85 条请求契约；server/web/transport 类型检查与 API/Web 构建通过；核心/传输 **221/221**（MemoryStore）；真实 PostgreSQL **39/39**；原生表单 Chromium **6/6**；browser-resume、browser-handoff、browser-media、browser-production 均 success。

browser-production 使用真实 Nest API、独立 Worker、PostgreSQL、Chromium 和真实 PNG 解码，跑通作品/项目既有链路，并新增“结构化搜索 → 内部清单 → 署名作品 → 作品图 → 协作备注”；暂停被选图片来源后整条候选变不可用占位，不回显姓名/备注；随后作品仍可解绑该图片，派生 shortlist 选图关系被清除而原 MediaAsset 与候选条目保留。

本批新增 6 条 MemoryStore 核心用例和 7 条 PostgreSQL 子测试（含后续 FK 回归修复后的解绑语义）。首轮核验时效用例因 FakeClock 同时使 12 小时会话过期得到 401，改为重新登录后继续验证，不放宽会话。浏览器先后修正错误 locator 和父详情未关闭的测试步骤；随后真实 PG/浏览器发现 Shortlist FK 会阻断旧 WorkAsset 解绑，新增前向迁移修复并重新全链验证。

没有访问用户本机数据库/密钥/真实人才资料，没有正式 COS、旧业务库升级、备份恢复或生产部署。FR-14 的行业/作品类型和 SQL 查询下推/负载仍未完成，不能把本节写成完整 DEV-06/M1 验收。


## WP1｜历史作品/项目切片

详见 [WP1_WORKS_PROJECTS.md](WP1_WORKS_PROJECTS.md)。基线 d775111；新迁移第五条、六张关系表、19条API，总请求契约76条。

编辑环境实际通过：Prisma validate/generate；完整server/web/transport类型检查；核心/传输 **215/215**（原185+新30，MemoryStore）；静态11项；76条请求契约；API/Web构建。首次组合命令受执行时限中断，之后独立运行完整核心脚本并观察 exit=0 和215/215，不以中断日志充当通过。

新增PG/浏览器源码已加入最小CI，在本文件提交前待远端实际运行；最终状态必须绑定当前PR的最终head，而不是本地预测。没有访问用户本机DB/密钥，没有旧库升级、生产部署或完整一期验收。

## 历史记录（以下状态仅对应原提交）

A1/H1/M1后来对应PR的远端验收已完成；下面保留历史开发时未执行/阻挡描述，不能当作最新指令。当前结果用当前PR及上方WP1说明核对。

## 2026-09-23 验收切片 A1（基线 `1ba170e`）

本机环境：Node 22.22.3、pnpm 10.14.0、隔离 PostgreSQL 16、真实 API/Worker、无头 Chrome。测试脚本在新建空 `once_test_browser_*` 库上迁移并创建随机合成账号；故障触发器只作用于该库的合成第二行。测试库保留，未清空旧库。

| 检查 | 实际结果 | 边界与证据 |
|---|---|---|
| `pnpm verify:online` | PASS：冻结安装、Prisma validate/generate、39 条请求契约、完整类型检查、135/135 核心测试、静态检查、API/Web 构建、生产依赖审计 0 个已知漏洞 | [运行日志](../../artifacts/acceptance-online-20260923.txt)；核心测试仍是 MemoryStore |
| `pnpm verify:browser` | BROWSER_TESTED：页面两行预览/提交；第二行真实 SQL 失败时仅第一行入库且显示部分完成；点击继续后响应丢失，原键/原请求体重放只产生一个回执；Worker 只补第二行，最终两行各一条 | [运行日志](../../artifacts/acceptance-browser-20260923.txt)；真实 PostgreSQL、Nest API、独立 Worker、Chrome |
| 三类继续拒绝 | BROWSER_TESTED：来源暂停/版本变化后页面显示拒绝原因且 API 返回 404/409；编辑权限撤销后旧页面点击继续返回 401，任务保持 FAILED、第二行未入库 | 同一浏览器日志；只覆盖指定的三种变化 |
| 最小 GitHub CI | BLOCKED：PR #2 的[首次检查](https://github.com/BA7IEE/once-production-os/actions/runs/35856990647)在启动 Runner 前被 GitHub 拒绝；检查注释称账号付款失败或达到消费上限，步骤数为 0 | 未运行冻结安装、构建或浏览器脚本；账单恢复后必须在最终 PR 提交上重新运行，不把本机通过写成 CI 通过 |

本切片未执行完整浏览器异常/可访问性清单、生产部署、正式数据升级、恢复演练、受控资料交接和后续业务模块。AI 仍在 v0.3 一期范围。下文为 R1 和更早基线的历史结果。

## 2026-09-23 Review R1 本机实测

目标代码基线 `44aac4d93f23bb1f4c69e960a4c82d01b8b0d9dc`；R1 补丁在独立分支应用后验证。环境为 macOS、Node 22.22.3、pnpm 10.14.0、隔离 PostgreSQL 16。包作者随附的离线测试记录仅供审阅；下表是本机重新执行的结果。

| 检查 | 实际结果 | 边界与证据 |
|---|---|---|
| `pnpm verify:online` | PASS：冻结安装、Prisma validate/generate、39 条请求契约、服务端/React/transport 完整类型检查、135/135 核心测试、静态检查、API 与 Web 构建、生产依赖审计 0 个已知漏洞 | [完整日志](../../artifacts/online-run-fix-r1-20260923.txt)；核心测试使用 MemoryStore |
| 既有 `once_local` 升级 | DB_TESTED：升级前本机备份可列出归档内容；追加迁移成功且 Prisma 报 schema up to date；来源 4、人才 5 保持，4 条来源均有当前版本基线，2 条旧暂停记录标记不确定，历史缺口 0 | 本地合成数据；备份保存在忽略目录 `.secrets/backups/`，未纳入交付；不等于正式数据升级/恢复演练 |
| 新空库 `once_test_r1_b9630627` | DB_TESTED：初始和追加迁移成功，13/13 PostgreSQL 断言通过；写后故障整体回滚、同键重试/重放、历史唯一约束/外键/不可改触发器、部分导入继续和双 Worker 所有权均通过 | [测试日志](../../artifacts/postgres-run-fix-r1-20260923.txt)；独立测试角色与合成数据，测试库保留 |
| 100/1,000 人配 100 行预览 | DB_TESTED：两组均记录 20 次数据库查询 | 与该测试数据和当前实现相关；不是吞吐、负载或 SQL 授权分页验收 |
| 已暂停来源的历史页面 | BROWSER_TESTED：本地 API + 无头 Chrome 登录，看到基线历史、旧依据不确定提示；`/health/ready` 为 200，页面脚本错误 0 | [浏览器日志](../../artifacts/browser-run-fix-r1-20260923.txt)；仅验证一个可见的合成来源，不覆盖浏览器导入继续和所有权限拒绝情形 |
| 隔离打包副本检查 | PASS：124 个交付文件、84 个本地文档链接、70 个源码指纹均无问题；逐文件搜索未发现本地密钥或数据库 URL | [包检查结果](../../artifacts/package-check.json)；非完整秘密扫描 |
| `sha256sum -c MANIFEST.sha256` | PASS：重新生成的交付文件清单逐项一致 | 文件指纹不是代码签名；本地密钥、数据库备份、依赖和构建产物未收录 |

本次未执行：正式数据升级、备份恢复演练、浏览器导入继续/网络结果未知/全部权限拒绝、CI、正式镜像与部署、完整一期功能验收。下文保留原基线与首次离线交付的历史记录，不能把其中旧计数套用于 R1。

## 2026-09-23 接力实测

环境：macOS，Node 22.22.3，pnpm 10.14.0，隔离 PostgreSQL 16 容器（镜像 `postgres@sha256:a3b7f434b2dc57ce85a67e171163eb8ab1a1ebcb39d27484661f26b1dfbe30d6`）。本地配置由 `node scripts/init-local.mjs` 生成；密钥和数据库 URL 只保存在忽略目录中。

最终完整验证日志：[online-run-20260923.txt](../../artifacts/online-run-20260923.txt)。

| 检查 | 实际结果 | 边界 |
|---|---|---|
| `pnpm verify:online` | PASS；真实锁文件、冻结安装、Prisma validate/generate、37 条请求契约、完整服务端与 React 类型检查、transport 类型检查、111/111 核心测试、11/11 静态检查、Nest/React/Vite 构建、生产依赖审计 0 个已知漏洞 | 审计是当日已知漏洞快照，不是供应链安全认证；核心测试仍用 MemoryStore |
| `pnpm db:deploy`、`prisma migrate status` | PASS；新建 `once_local` 应用唯一初始迁移，状态为 up to date | 只验证空的本地开发库；未演练升级已有业务数据 |
| 新建 `once_test_eb45122e`、`pnpm verify:postgres` | DB_TESTED；6/6 断言通过，覆盖同键竞争、回滚、跨空间组合外键、并发 CAS、双 Worker 租约 | 独立测试角色；保留合成记录；未做进程崩溃或压力测试 |
| 本地真实 API、Worker 与无头 Chrome | BROWSER_TESTED；登录、开通/激活编辑及审核员、共同范围、编辑建档、来源核验、字段确认、JSON 预览与提交、Worker 完成、来源暂停阻断后续读取、退出全部通过；页面脚本异常 0 | 只跑一条合成主链路；异常响应、网络未知、移动宽度、焦点、联系方式等完整清单未覆盖 |
| `/health/live`、`/health/ready` | PASS，分别返回 `alive`、`ready` | readiness 不证明迁移漂移或备份恢复 |
| 排除 `.env`、`.secrets`、依赖和构建目录的包检查 | PASS；76 个本地文档链接、62 个源码指纹检查无问题 | 检查的是隔离打包副本，不是秘密扫描或生产镜像验收 |
| `sha256sum -c MANIFEST.sha256` | PASS；当前清单覆盖 113 个交付文件 | 文件指纹不是代码签名 |

首次真实 typecheck 发现前端 `Field` 重复 `hint`，已去掉过期的 UTC 日期文案。首次审计发现 Nest 及传递依赖漏洞；将 Nest 三包锁到 11.2.5，并显式覆盖 Multer 2.3.0 与 Prisma 配置依赖 deepmerge-ts 8.0.1 后，全链重跑通过。两个传递依赖覆盖仍需随上游版本持续复核。许可证清单为 MIT 114、Apache-2.0 11、BSD-3-Clause 3、BSD-2-Clause 1、ISC 5、0BSD 1；该清单不等于完成法律审查。

支持周期核查：2026-09-23 时 [Node 22 为 LTS](https://nodejs.org/en/about/previous-releases)，[PostgreSQL 16 仍受支持至 2028-11-09](https://www.postgresql.org/support/versioning/)；[Prisma 6 只收安全补丁至 2026-11-19](https://www.prisma.io/docs/orm/release-status)。因此本次锁定适合继续隔离开发，后续需安排 Prisma 主版本迁移与回归，不作为长期生产版本承诺。

未执行：完整浏览器异常/可访问性清单、CI、正式镜像构建、供应商服务、备份/恢复/删除、生产数据导入和部署。M0/M1/M2/M3 均不能标为完成。

以下第 1–4 节是 2026-09-22 首次离线交付的历史记录；其中当时的 `NOT_RUN` 不覆盖上表的新实测结果。

## 1. 实际执行结果

核心测试汇总：**111 个测试，111 通过，0 失败**，没有跳过项。实际运行命令：

```bash
node scripts/run-core-tests.mjs
```

| 测试文件 | 测试数 | 通过 | 失败 |
|---|---:|---:|---:|
| `client-transport.test.ts` | 6 | 6 | 0 |
| `commands-imports.test.ts` | 22 | 22 | 0 |
| `http-contract.test.ts` | 1 | 1 | 0 |
| `identity.test.ts` | 25 | 25 | 0 |
| `json-validation.test.ts` | 27 | 27 | 0 |
| `local-config.test.ts` | 4 | 4 | 0 |
| `talent.test.ts` | 26 | 26 | 0 |

这些测试是规则、客户端传输与测试专用 HTTP 入口的断言，不是一一对应 FR 的产品验收。并发用例使用串行事务 MemoryStore，不能证明 PostgreSQL 在相同负载下的表现。

`http-contract.test.ts` 确实打开本机回环 HTTP 端口执行 CSRF、登录、建档、读取、重复请求、错误 Origin 和退出链，但它使用 Node HTTP Harness，而不是 Nest/Express，不替代浏览器 cookie/CSP/界面行为验证。

`client-transport.test.ts` 使用受控 fetch 返回模拟超时、500、409、坏 JSON 等响应；验证前端请求模块，不运行 React 页面。

`local-config.test.ts` 实际在临时目录创建随机密钥文件，检查权限与拒绝覆盖，并验证配置/生产 HTTPS 拒绝规则；结束删除的是该测试自己创建的临时目录，不是项目数据或用户文件。

原始结果：[汇总 JSON](../../artifacts/core-test-report.json)，[完整运行日志](../../artifacts/core-run.log)，逐文件 TAP 在 `artifacts/core-tests/`。

## 2. 其他已执行检查

| 检查 | 结果 | 准确边界 |
|---|---|---|
| 请求契约再生成比对 | PASS，37 条路由 | 路径、输入 Schema、Inputs；不是完整响应 Schema |
| 核心 TS strict typecheck | PASS | 本机全局 TS 5.8.3 + 全局 @types/node 25.1.0，不是项目锁定依赖 |
| 客户端 transport/DTO typecheck | PASS | 无 React 依赖的传输部分；不是全部 TSX |
| 静态源码检查 | 11 项通过，0 项失败 | 28 份生产/前端/配置源码语法与有限 AST/契约检查；不是完整 build |
| 数据库测试入口安全拒绝 | PASS（预期退出码 2） | 未给测试许可/URL 时不连接数据库；不是 PostgreSQL 测试通过 |
| 原始文档指纹 | 16/16 保持一致 | 对原文件内容验证，不证明文档全部需求已实现 |

实际命令与源文件摘要在 [verification.json](../../artifacts/verification.json)。在有真实依赖的环境必须重新使用项目自己的 @types/node 和完整 tsconfig 检查。

TAP/JSON 的 generatedAt 使用执行容器的时钟，原样保留为证据；测试数据使用固定 FakeClock，不用它声称实际业务发生时间。

## 3. 未执行 / 被环境阻挡

| 项目 | 状态 | 原因/接力要求 |
|---|---|---|
| pnpm 真实安装与锁文件 | BLOCKED | npm 域名解析失败；[探测日志](../../artifacts/dependency-network.log) |
| Prisma validate/generate | NOT_RUN | 真实 CLI 与依赖不可用 |
| 初始 SQL 执行、迁移一致性、组合 FK | NOT_RUN | 环境没有 PostgreSQL；[专用测试源码](../../tests/postgres/integration.test.ts) |
| NestJS 全部类型/构建/HTTP适配 | NOT_RUN | 依赖未安装，未用假声明绕过 |
| React/Vite 全部类型/构建/浏览器 | NOT_RUN | 无依赖/浏览器应用产物 |
| Docker 镜像和 Compose 启动 | NOT_RUN | 未执行 Docker；文件为候选配置 |
| 依赖漏洞/许可证/镜像检查 | NOT_RUN | 没有真实解析后的供应链清单 |
| 压力测试、私有存储、AI调用 | NOT_RUN | 对应基础设施/模块未实现或未连接 |
| 真实数据导入、备份、恢复、生产部署 | NOT_RUN | 未授权/未准备生产环境；尚不具备试用门槛 |

## 4. 复现纪律

不能把 MemoryStore 改名为 PostgreSQL 来写 DB_TESTED；不能把 AST 语法检查写为完整编译；不能把缺少的程序用 Mock 菜单补齐后标记完成；不能将本包未开发的 AI/媒体改为 DEFERRED 来让验收全绿。

后续先执行 LOCAL_RUN 的在线与真实 DB/浏览器环节，保留新锁文件、测试环境和日志，再更新进度。任何代码修改都要重跑对应测试并更新摘要。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
