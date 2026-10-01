## 2026-10-02：PR-04A 主体与文字摄取（Draft，待代码复核）

用户已正式启动 PR-04A，原 DESIGN_ONLY 为历史阶段。基于冻结 PR03 aeaf49da / 设计7017d5ef的独立 stacked 分支实现真实 MACHINE Submission、窄权限与 authorizationEpoch、文字/Role/基础事实、明确 NEW/EXISTING审核、typed INTERNAL_REVIEW及intake→formal转换。迁移69–71前向追加，1–68字节不变；PR #31 head不变、未合并未部署。

本地 Core685/685、PG79个程序/169项及新Nest/Bearer/Chrome审核旅程通过；旧本人文字维护及目录浏览器回归通过。PG16和原12组Browser+新ingestion共14项最终CI以该 Draft PR 最终head为准，不能借用PR31结果。完整实现、生命周期、证据及未验边界见 [PR04_AGENT_INGESTION_A.md](PR04_AGENT_INGESTION_A.md)。PR-04未冻结，B/C/D未开始；供应商/COS/物理手机/生产迁移均NOT_RUN，DEPLOYED=false。

以下保留历史记录。

## 2026-10-02：PR-04 四项设计决策冻结，仍 DESIGN_ONLY

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

A–D已由用户冻结，基线ff6e10f。本轮接通独立清理计划、逐对象UNKNOWN核对、确认物理删除后归还容量、审核竞争、显式删除交接和恢复隔离。新增前向迁移67–68，1–66未改；67应用后不回写，68补强JSON空值拒绝和对象身份不可变；保留库66→67的91张旧表内容摘要不变。完整合同、40项验收映射及限制见 [PR03E_ACCEPTANCE.md](PR03E_ACCEPTANCE.md)，本轮实测汇总见 `artifacts/talent-experience-pr03-cleanup/verification.json`。最终head CI另绑定PR描述和交付回复，通过前不宣称DEVELOPMENT FROZEN。Provider/COS/物理手机/生产迁移仍NOT_RUN，不进入PR-04等后续业务。下方为历史切片记录。

## 2026-10-01：PR-03D finalization（Draft，待复核）

修复 LINK 不写共享 Work 媒体/事实，新增独立媒体+Work同意版本，支持已有 exact Credit 原样接手及 legacy 内部受控升级。无schema/迁移变化，1–66逐文件不变。当前证据见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-finalization/verification.json`。保持未合并、未部署，Provider未验证，不进入PR-03E。

## 2026-10-01：PR-03D 作品案例（Draft，待复核）

PR-03A/B/C 已冻结。本轮复用 Work/Credit/Asset，增加本人案例草稿、精确职业署名、人工新建/关联、Grant-bound 本人投影及人物主详情卡片；同步导出重建、删除/合并与恢复。新增前向迁移64–66，1–63不改。当前实测证据与明确边界见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-cases/verification.json`。保持 PR #31 Draft、未合并、未部署，Provider/COS/真实手机仍 NOT_RUN；完成本轮后不进入 PR-03E 或后续业务。

## 2026-10-01：PR-03C finalization（Draft待复核，尚未冻结）

本轮完成当前 Grant-bound exposure、Tag 新来源/父集合版本、失效来源退出 current、Collection 类型 identity 五项修正。没有 schema/迁移变化，1–63不改。本人明确获准后可使用内部正式素材，不借 uploader 或开放人物全部内部媒体；新增正式读与既有删除/合并/恢复保护一致。完整实测、反例、失败定位及最终head CI绑定见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-finalization/verification.json`。保持 Draft、未合并、未部署；不进入 PR-03D，Provider/COS/真实手机仍 NOT_RUN。下方内容为历史主体阶段结果。

## 2026-10-01：PR-03C 媒体集合（Draft待复核）

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

PR-02b主体复核通过、尚未冻结。本轮在PR #30修正终态审核只允许Commands原键重放、ENROLL全拒绝完整终结Claim及本人来源textPayload写保护。无schema/迁移变化，1–61冻结；继续Draft、未合并未部署，PROVIDER_VERIFIED=NOT_RUN。不进入PR-03。

详情及本轮证据见 [PR-02交付说明](TALENT_EXPERIENCE_PR02.md)。

## 2026-09-30 Talent Experience 首轮增量

本次已新增唯一人才建档入口和内部组合命令，姓名即可建立默认model草稿，支持多职业和普通联系人。无来源时为当前员工7天限定临时整理；结果未知显式原样核对。合同/ADR/迁移计划已回填，目录业务字段、未知量尺日期2.1、邀请/门户/投稿、多来源媒体/摄取、价格/分享/官网尚未完成；当前仍不向真实外部用户开放。

本轮证据与边界见 [TALENT_EXPERIENCE.md](TALENT_EXPERIENCE.md)，PR #28；以下保留历史记录，历史未合并状态不覆盖当前main。

# 当前实现状态

以 [当前交付清单](CURRENT_DELIVERY.md) 的代码能力与验收边界为准。

- 人才2.0、受控合并/迁移/清理、工作台、内部语言文本已接通。
- 四类文字AI、配置式SDK连接、人工采纳和费用核对已接通。
- 图片/不解析PDF附件/精选MP4封面、私有COS与本地存储、原件导出备份恢复已接通。
- 正式云供应商、性能参考环境、生产部署与接管不由合成测试代替，尚未验收。
- 品牌实体、所属机构和项目客户／品牌关联已接通，含权限、导出重建、删除与恢复；当前提交数据库／浏览器结果在 PR 回填。

本批证据、数据库升级与CI状态见 [媒体交付说明](MEDIA_COMPLETION.md) 及PR #26；历史逐批证据保留在 [历史实现记录](IMPLEMENTATION_HISTORY.md)，不再把旧的“AI未启动”等状态当作当前待办。

上线前两项运行故障已修复，定向回归通过；边界见[修复说明](PRELAUNCH_REVIEW_FIXES.md)，当前提交CI结果见PR。

外部staging审查R1/R2已修复，独立ops执行镜像和staging安全约束已补齐，参见[staging执行说明](STAGING_EXECUTION.md)。新提交验证见PR。

未决标记持久化限制为专用模块的固定单比特；静态规则继续拒绝业务正文及其他浏览器持久化访问。
