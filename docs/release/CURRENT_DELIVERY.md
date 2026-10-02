## 2026-10-02：PR-04C WORK appliedId finalization（Draft，待最终复核）

以665ea7b20a1d0e16d47406f8fd7e814340d37098为基线，只修正 `applyStructures` 将MACHINE WORK `appliedId` 从Credit.id改为Work.id；TALENT既有流程原本即Work.id，保持不变。无新增映射字段/模型、无Work/Credit重构、无迁移75；1–74和PR31/32/33 head不改。

CREATE、LINK exact Credit复用及LINK新Credit均查库确认Work.id，Credit原ID/Source/Note不变，共享Work facts/cover/placements不变；Collection/MEDIA/ROLE映射不变。旧代码新增断言先复现1项失败，修正后专项42/42；全量Core743/743、PG16共131程序221项、原14组加新增Agent Structures共15组真实Browser通过。真实业务JSON重建、CLI、pg_dump/restore、恢复后WORK item、fresh1→74和retained74无改写通过。证据见 `artifacts/agent-structures-pr04c/applied-id-finalization/verification.json`；完整说明见 [PR-04C交付说明](PR04_AGENT_INGESTION_C.md)。

最终SHA及新的exact-head 16项CI结果回填PR34描述和交付回复，不复用665ea7b的36987562732。继续Draft、未合并、未部署；待最终代码级复核确认冻结，停止推进PR-04D。四项生产验证NOT_RUN，DEPLOYED=false。以下保留历史记录。

## 2026-10-02：PR-04C Collection / Work 摄取（独立 Draft，待代码级复核）

基于 PR-04B frozen `379d06dbea9295d47dd7f998a90f76d5d885169a`；PR31/32/33不修改。Agent仅用同批Role/Media stable key提交集合和案例，submit冻结完整依赖；内部明确Collection新建/更新、Work CREATE/LINK，在原有模型和Commands事务内采纳。LINK不改共享Work facts/cover/placements，exact Credit原ID/Source/Note复用；typed INTERNAL_REVIEW重建不伪造TalentConsent。无新数据库字段/迁移，1–74字节不变。

本地Core743/743；PG16全量126程序216项通过，随后最终32个结构专项全部通过，去重覆盖131程序221项；空库1→74、保留74→74无改写、真实pg_dump/restore与实际业务JSON重建/CLI通过。原14组及新增390px Agent Collection/Work真实Chrome旅程通过（真实异步worker与H264），首次失败保留。最终完整16项CI绑定Draft PR #34最终head并回填PR描述，不沿用旧head结果。详见 [PR-04C交付说明](PR04_AGENT_INGESTION_C.md) 与 `artifacts/agent-structures-pr04c/verification.json`。

保持Draft、未合并、未部署，交付后停止等待代码级复核，不进入PR-04D。PROVIDER_VERIFIED / COS_PROVIDER_VERIFIED / MOBILE_DEVICE_VERIFIED / PRODUCTION_MIGRATION_VERIFIED 均为NOT_RUN，DEPLOYED=false。以下为历史记录，不替代本轮证据。

## 2026-10-02：PR-04B 独立 stacked Draft

PR-04A 已由用户冻结，PR #32 head不改；当前真实媒体摄取范围与实测见 [PR-04B交付说明](PR04_AGENT_INGESTION_B.md)。迁移1–72不变，只追加73–74；不合并部署，不进入PR-04C。历史阶段记录保留如下。

## 2026-10-02：PR-04A finalization（Draft，待最终冻结复核）

本轮仅收口 imported INTERNAL_REVIEW 的完整DB形状约束与结构化secret leak检测。前向迁移72，1–71字节不变；真实历史引用不建立假FK。rebuild与DB校验对齐，TALENT_CONSENT原合同回归通过。原OTP浏览器和Agent摄取复用统一helper；合法UUID/hash/时间/计数不因OTP子串碰撞失败，正文和真实Bearer/receive token、authorization及签名URL仍严格检查，失败不输出秘密。

本地Core689/689，PG80个程序/170项/0失败（14.19），空库1→72、保留71→72及真实pg_dump/restore通过；原12组Browser+新ingestion13/13，真实receive token接入后4条媒体旅程复跑通过。最终PG16/14项CI仅认本轮最终head，回填PR描述和交付回复；首次36926840575 attempt1及旧交付说明保留。详见 [finalization说明](PR04A_FINALIZATION.md)。待本轮代码级复核后正式确认PR-04A FROZEN；PR #32 Draft、未合并、未部署，PR #31不修改，不进入PR-04B。所有生产门NOT_RUN，DEPLOYED=false。

以下保留上一轮交付与历史状态。

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

## 2026-10-01：PR-03D finalization（Draft，待复核）

修复 LINK 不写共享 Work 媒体/事实，新增独立媒体+Work同意版本，支持已有 exact Credit 原样接手及 legacy 内部受控升级。无schema/迁移变化，1–66逐文件不变。当前证据见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-finalization/verification.json`。保持未合并、未部署，Provider未验证，不进入PR-03E。

## 2026-10-01：PR-03D 作品案例（Draft，待复核）

PR-03A/B/C 已冻结。本轮复用 Work/Credit/Asset，增加本人案例草稿、精确职业署名、人工新建/关联、Grant-bound 本人投影及人物主详情卡片；同步导出重建、删除/合并与恢复。新增前向迁移64–66，1–63不改。当前实测证据与明确边界见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-cases/verification.json`。保持 PR #31 Draft、未合并、未部署，Provider/COS/真实手机仍 NOT_RUN；完成本轮后不进入 PR-03E 或后续业务。

## 2026-10-01：PR-03 媒体归属与暂存底座（Draft待复核）

迁移62新增真实上传主体与PersonMedia关系，READY与STAGED/ADOPTED/RETIRED分离；本人/审核专用读、原子采纳及生命周期已接入。1–61冻结。真实Chrome手机宽度与异步worker/PG、实际私有文件备份恢复已验证；完整当前提交测试及CI绑定见[本轮交付说明](TALENT_EXPERIENCE_PR03.md)和`artifacts/talent-experience-pr03-staging/verification.json`。本分支未合并、未部署，Provider未验证，PR-03整体未完成；不进入集合/作品下一切片。

## 2026-10-01 PR-02a 开发状态

PR-01 已合并冻结、未部署。PR #30 在独立分支实现 PR-02a 的人才账号/认证/真实主体与最小登录页，保持 Draft 待复核；[本包交付与证据](TALENT_EXPERIENCE_PR02.md)。默认外部入口关闭，PROVIDER_VERIFIED=NOT_RUN。PR-02b 及后续功能未开始，PR-02 整包未完成；本轮没有生产迁移或部署。

## 2026-10-01：PR-01 已合并冻结，未部署

[PR #29](https://github.com/BA7IEE/once-production-os/pull/29) 已从 Draft 转为 Ready 并合并。合并前精确核对 head 为 `b74cb79702b517ee1a1ed2125587a9a107ec2801`，没有夹带新改动；合并提交与远端 main 均为 `79e064980fda7df9f90ea6a2fef13d3b3eeccb9f`，合并后的文件树与该 head 一致。

该 main 的 [完整 CI 36755091719](https://github.com/BA7IEE/once-production-os/actions/runs/36755091719) 已完成，7/7 SUCCESS：postgres-contract、browser-resume、browser-production、browser-talent-intake、browser-media、browser-handoff、browser-talent-directory。此处引用合并后的 main 运行，不沿用 PR 运行。核对记录见 `artifacts/talent-experience-pr01b/merge-verification.json`。

PR-01 正式冻结；未执行部署或生产迁移。55 次已有迁移保持不变。PR #27 未合并、未修改。仅在上述 main CI 全部通过后回填本状态；此前 Draft/待复核描述保留为历史记录，不代表当前状态。PR-02 从此 main 建立独立分支，当前进度见 [PR-02 启动记录](TALENT_EXPERIENCE_PR02.md)。Release A/B/C 仍未整体验收。

# 2026-09-30 Talent Experience 开发增量

当前新增范围与验收边界见 [TALENT_EXPERIENCE.md](TALENT_EXPERIENCE.md)。基线 PR #26 已合并；下面保留其历史交付证据，不能用历史“未合并”描述当前 main。人才外部入口尚未实现/开放，A/B/C 均未完成。

# 当前交付与剩余工作

本页按当前代码整理，不叠加旧批次的待办。2026-09-29本批开发状态，云端测试最终结果回填PR #26。

| 范围 | 代码状态 | 验收边界 |
|---|---|---|
| 人才2.0、工作台、合并、来源/共享媒体清理、完整关系导出重建 | 已实现 | 既有PG与浏览器证据见历史专项 |
| 内部中英文本、四类AI任务、人工确认、费用核对 | 已实现 | 真实模型端点NOT_RUN |
| 配置式AI SDK连接 | 已实现，三种协议 | HTTPS；无自动金额估算；真实供应商NOT_RUN |
| AI进程中断 | 四个位置已接入PG测试 | 本批CI待确认；不把旧单位置测试当全通过 |
| 图片、PDF附件、MP4封面 | 已实现 | PDF仅保留附件，明确未解析；不属于系统内OCR/抽取工作 |
| COS私有存储与文件维护 | 已实现 | SDK合同测试通过；真实桶/权限/网络PROVIDER_VERIFIED=NOT_RUN |
| 品牌与项目客户/品牌关联 | 已实现 | 7项核心专项通过；当前PG／浏览器／恢复验收见PR |
| 性能、恢复完整故障与正式接管 | 未整体验收 | 需参考环境和真实业务样本，不能以测试替身替代 |

本批没有新增网站、客户门户或商业流程，没有旧导出格式兼容，没有执行合并或部署。

开发范围收口：已知的品牌、媒体和AI中断实现已补齐。真实COS桶、真实模型端点、参考规模性能和实际业务接管属于待验收，不计为已经通过。机构仍被资质／经纪等专业记录引用时，删除会要求先逐项处理这些记录，不自动抹除专业事实。
