# PR-04C：External Agent Collection / Work Ingestion

独立 stacked 分支 `codex/external-agent-collection-work-pr04c`，base `codex/external-agent-media-ingestion-pr04b`。PR-04A frozen `67f45a57801cdef9e419803139775e15dd329839`，PR-04B frozen `379d06dbea9295d47dd7f998a90f76d5d885169a`；PR31/32/33 head 不修改。本轮完成后保持 Draft、未合并、未部署，等待代码级复核；不进入 PR-04D。

当前实测结果及最终提交/CI 由下文证据和 Draft PR #34 描述绑定。历史 A/B 首次失败及测试资料保留，不用其通过记录替代本轮结果。

## 数据与合同

没有新增实体或数据库字段；**无新迁移，仍为74**。既有 TalentSubmissionItem 已支持 COLLECTION/WORK，`baseline` JSON 可承载私有冻结依赖，已有正式 Collection/Item/Tag、Work/Credit/Asset、Source/Attribution/typed basis 及 FK/唯一/延迟约束继续使用。迁移1–74字节不变；不 `db push`，不清库。

`POST /ingestion/submissions/{id}/items` 增加严格 COLLECTION、WORK 判别分支。COLLECTION 支持六种冻结类型、标题、current、封面候选键、标签、排序/caption/featured；WORK 支持标题、描述、时间精度、地点、品牌展示名、行业、作品类型和署名说明。只引用同批 `roleCandidateKey` / `mediaCandidateKey`，MEDIA 候选仍由真实 worker 创建；客户端不能提交 MEDIA、Asset/Role/Source/Collection/Work 正式ID、正式scope或URL。UNKNOWN 时间必须null，不从文件推断事实。结构键最多64字符，每批仍最多50条，结构限20集合/10案例；职业/标签/类型去重和未知代码拒绝。

集合和案例的 `dependsOn` 必须恰好包含本批 ROLE 与全部 placement MEDIA；媒体声明的职业键也须相同。MODEL_CARD/POLAROIDS 只允许模特职业；图片/PDF模卡附件、纯图片素颜照、MP4 Showreel/介绍及 Portfolio 图片/MP4规则复用冻结方法。PDF不OCR、不作为封面、不进入Work。Collection 同键职业/类型身份不可改，换身份用新候选键；同批重复身份拒绝。

## 提交冻结和内部选择

submit 在同一事务冻结完整 item/graph、既有 Person/Role/Source/evidence 基线和结构私有基线，并纳入 payloadDigest。已有 A/B 不含结构的冻结 payload 继续使用原 digest 语义。

COLLECTION 按提议 Person、同批 Role code解析出的 exact Role、类型冻结所有有效正式版本，以及 source/basis、tags、placements、cover、asset/正式关系。审核必须明确现有 ID + revision；已有身份不可悄悄新建重复集合。排序/封面/标签/来源/版本或新增同身份冲突返回 `409 COLLECTION_REBASE_REQUIRED` / `COLLECTION_IDENTITY_EXISTS`，不采用最新状态。

Agent 不允许传正式 Work ID，而 Work 的 CREATE/LINK 决定必须由内部审核做。因此 submit 私有冻结当前 ACTIVE Work 候选目录的 **ID→依赖digest**：包含 Work facts/revision/scope、source/basis、cover、全部 placements、素材正式来源/关系、credits/exactRole及删除保护。最多1000个，超限fail-closed，不截断。只是不可变依赖快照，不是第二套Work或Agent查询接口。MACHINE DTO 不返回目录、baseline、内部审核选项；内部 DTO 的选项再次按当前 Work/Source scope过滤。LINK 只能选择提交时已冻结且现在完全一致的目标，不能关联后来新建或悄悄改动的作品。变化返回 `409 WORK_REBASE_REQUIRED`；目标 Person/Role变化继续 `TARGET_REBASE_REQUIRED`。

内部 review 增加 `collectionDecisions[]`、`workDecisions[]`，必须与本次采纳的结构一一对应，拒绝缺漏/重复/多余决定。每个 Work 明确 `CREATE_EXTERNAL_WORK` 或 `LINK_EXISTING_WORK`，后者仅内部可传目标ID/revision。逐项真实依据与选择完整记录到 typed SourceUseBasis.reviewBasis；Source 展示依据限2000字符，Machine Work 的来源说明指向正式Source，避免合法长说明超出导出合同。不创建假 Consent。fork不复制原批媒体及依赖它们的结构，须在新批重传并重新明确结构，不复活旧上传。

## 采纳、权限与生命周期

审核先复查 MACHINE授权、负责人、intake/recovery、Person/Role/Collection/Work基线、STAGED/READY素材和依赖闭合；在同一 Commands事务创建正式 Source/Attribution/INTERNAL_REVIEW basis（含media/collection/work fieldScope），处理Person/Role、ADOPT同一Asset，再调用冻结的 `applyCollection` / `applyWorkCase`，最后写item、Submission、Receipt、Audit。任一步故障全部回滚。

Collection placement 移除不删 Asset；current 切换、旧 Source 的可见scope检查、Tag 的本次 Source 支持和父revision全部复用PR-03C。已有集合更新会换为本次合法来源，并保留源文件/hash/uploader。CREATE Work为EXTERNAL/ACTIVE，不创建Project或ACTUAL，不按标题自动合并。LINK完全不改 Work facts、cover、WorkAsset数量/顺序；本批新素材可独立采纳，但不挂共享Work。exact Credit以审核后同Person/Role/currentSource绑定；既有ID/Source/Note原样复用，legacy仍返回 `WORK_CREDIT_UPGRADE_REQUIRED`，走现有内部upgrade动作后重新提交。

正式 Collection/Work/Media 使用当前正式Person/Role/Source/basis与删除保护，不依赖原intake或SP仍ACTIVE。Agent revoke不撤销合法正式关系；Source/basis撤回立即使对应投影失效。本人接手、Grant/exposure及真实TalentConsent保持原合同，本轮不自动生成授权，不进入PR-04D。

业务JSON只导出正式ADOPTED及合法来源/关系，不含STAGED、私有依赖或认证主体。Work重建区分合法INTERNAL_REVIEW与真实Talent WorkConsent，保留严格typed imported shape，不伪造同意。重建不建ServicePrincipal/Submission/Grant；现有关系重建ID规则不改，精确Person/Role/Work/Source/Note保留。实际删除阻断本人/机器暂存和正式读取；exact WorkRole合并冲突fail-closed，不转未经审核材料。pg_dump/restore保留Collection/cover/Work/Credit及STAGED/ADOPTED，恢复隔离使旧主体/草稿失效。容量/TTL继续PR-03E，ADOPTED不按原草稿清理。

## 验收记录

本轮结果见 `artifacts/agent-structures-pr04c/verification.json`、Core/PG专项、浏览器证据及首次失败记录。原14组Browser和新增Agent Collection/Work各自完整运行，新增390px真实Chrome旅程：Bearer文字/Role → 实际JPEG/PNG/WebP/PDF/H264与异步worker → Portfolio/Showreel/外部案例候选 →逐项内部审核 → 正式人物详情集合/案例/媒体。intake-only正式读拒绝，formal-only无intake正常读与MP4 Range；撤SP不影响已采纳，撤Source立即拒绝。

首次错误保留于 `first-failures.json` 及首次浏览器/回归截图：新增adapter类型假设、测试导出路径/重建关系ID假设已按真实合同修正；实际Work重建拒绝合法MACHINE basis已修复；专用PG重启端口和并行构建替换dist导致浏览器刷新ENOENT均定位后在独立新库完整重跑。没有删除断言或用等待/刷新绕过业务失败。

`PROVIDER_VERIFIED=NOT_RUN`
`COS_PROVIDER_VERIFIED=NOT_RUN`
`MOBILE_DEVICE_VERIFIED=NOT_RUN`
`PRODUCTION_MIGRATION_VERIFIED=NOT_RUN`
`DEPLOYED=false`

Chrome手机viewport不代表物理手机，Local Provider/PG16恢复不代表COS或生产迁移。PR-04C交付后停止，待代码复核冻结，不进入PR-04D。

## 本轮结果与反例映射

- Core全量743/743、0失败；新增结构专项32项，真实类型检查、transport、合同生成检查、静态检查和完整构建通过。
- PostgreSQL16.15全量126程序/216项通过；最终32项结构专项含最大依据长度实际重建均通过。去重覆盖131程序/221项，0失败。最终CI重新执行当前完整脚本，而非沿用早期运行。
- fresh1→74、retained74→74无改写，实际pg_dump/restore、恢复隔离、业务JSON重建及真实CLI通过。无迁移75。
- 原14组Browser全量与新增Agent结构旅程通过。Collection旧组首次ENOENT环境失败保留，构建结束后在新库按原断言完整重跑通过；新增旅程最后一次在最终业务代码构建后通过。

| 用户反例 | 本轮证据 |
|---|---|
| 1–2 任意正式ID/Scope | Core/PG asset-id / role-id / source-id / collection-id / work-id / scope-id + Browser |
| 3–4 READY/STAGED与Role依赖 | missing-media / not-ready / role-key / partial / graph |
| 5–8 Collection身份/重复/版本/来源 | type / duplicate / tag / order / collection-cover / source；base明确更新 |
| 9–13 CREATE/LINK/cover/同标题 | base + Browser；共享Work完整序列化前后一致，新素材仅独立采纳 |
| 14–15 exact/legacy Credit | base原ID/Source/Note不变；legacy fail-closed + 原内部升级回归 |
| 16–17 Role/Work变化 | role / work-facts / work-assets / cover / credit |
| 18–21 原子/partial/隔离/间接采纳 | base审计与回执故障全状态回滚；partial-valid / partial / Agent B denied；普通STAGED不可见 |
| 22 Source/basis撤销 | formal-basis + Browser图片与MP4 Range立即拒绝 |
| 23–24 导出/合并/删除/恢复 | lifecycle / long-basis / PERSON / MERGE；verified bytes JSON重建及真实PG16 dump/restore |

审计/回执原键重放与新键SUBMISSION_CLOSED继续回归；最大2000字符批次依据及2000字符Work依据实际导出/重建通过。最终SHA、exact-head CI run与全部job结果在Draft PR #34描述和本轮交付回复绑定，避免文档提交自指SHA或引用上一提交结果。
