内部语言文本合并已接通：按语言选择正文、平铺保留双方原文和依据、合并后重新复核；连续合并、受控迁移、恢复检查与关联清理同步覆盖。新增第46次前向迁移，本地未应用或新增测试库；云端应用后冻结。当前受影响27/27 CORE_MEMORY_TESTED，最终复核时间专项及类型/契约检查通过；新提交云端数据库和浏览器结果待确认。AI供应商/模型/配置和费用上限待用户提供，AI业务链路仍未完成。未合并、未部署。见 `docs/release/LOCALE_MERGE.md`；以下为历史记录。

语言资料导出/重建已接通，并按用户明确要求将专业资料迁移收敛为单一 v14 格式，停止兼容开发期 v1～v13 文件；旧文件需重新导出。第45次迁移已应用并冻结。当前受影响迁移66/66、最终专项16/16 CORE_MEMORY_TESTED，完整类型检查 PASS；本轮不新增本地数据库或重复全量验收，云端共享核心检查只执行一次，五条业务验收保留。当前提交云端结果待确认；语言合并、AI与整体验收仍未完成，未合并、未部署。详见 `docs/release/LOCALE_TRANSFER.md`；以下条目为历史证据，不代表当前格式仍兼容。

内部中英文文本已接通人物/作品/项目页面及4条接口：明确来源、当前版本与范围复查、人工复核、未知结果原样重试。普通变化提示复核，安全变化限制正文；四类删除目标的衍生文本清理及审计回滚/重试、真实备份恢复已验。471/471 CORE_MEMORY_TESTED，完整 PostgreSQL + 最终语言专项 DB_TESTED，完整 Chromium BROWSER_TESTED，174条契约/类型/静态/最终构建/transport PASS。追加并冻结第43、44次迁移，42→44既有合成库60张原表内容摘要一致。证据见 `docs/release/INTERNAL_LOCALE_TEXTS.md`、`artifacts/internal-locale-texts-20260928/`。语言合并/导出重建尚未接通，相关旧入口明确阻断以免遗漏；AI、实际旧库过渡及正式环境验收继续。前批 `779d11c` / Actions36363283159为5/5，本批新head另验；未合并、未部署。

专业检索改用事务内关系/依据索引，仍逐次核对当前权限和来源；100/1000人三轮真实PG测试通过，领域SELECT分别固定37/43次。1000人同类合成数据新检索约700ms降至130ms、旧兼容约550ms降至140ms；这是本地对照，不冒充参考服务器性能验收。资质撤销→编号清除→独立依据保留→来源最终删除完整链路及审计回滚/重试已验。464/464 CORE_MEMORY_TESTED，完整 PostgreSQL（领域23/23、规模1/1）DB_TESTED、完整 Chromium BROWSER_TESTED，类型/契约/静态/构建/transport PASS。42次迁移冻结。证据见 `docs/release/TD2_SEARCH_SCALE.md`、`artifacts/td2-search-scale-20260928/`。TD2-T01～18已绑定 `ca833aa` / Actions36362121523的5/5，见指定提交矩阵；本批新head另验。AI、实际旧库过渡和正式环境验收尚未完成，未合并、未部署。

旧身高人工复核与受限资质编号清除已接通：明确不采用不生成量尺且保留旧值；清除编号只移除密文/尾号，保留核验状态和证明关系。463/463 CORE_MEMORY_TESTED，170条契约及类型/静态/构建/transport PASS；完整 PostgreSQL 链、领域/兼容22/22 DB_TESTED；完整 Chromium BROWSER_TESTED。新增操作均有人工作业确认、当前权限/来源版本复查、审计回滚和原键重试。42次迁移冻结。证据见 `docs/release/TD2_MANUAL_MAINTENANCE.md`、`docs/release/TD2_GATE_MATRIX.md` 与 `artifacts/td2-manual-maintenance-20260928/`。前批 `51a62af` / Actions36360806914 已确认5/5；本批head另验。AI与整期交付未完成，未合并、未部署。

旧候选工作台的结构化检索已接入当前专业事实、同作品/对应职业匹配、当前核验与全结果分类计数；纯旧库维持SQL路径，100/1000人实测均20次查询，未放宽既有上限。鞋码等不含身高的量尺确认不再关闭旧身高复核；明确身高确认与审计失败回滚/原键重试一致。462/462 CORE_MEMORY_TESTED，最终受影响11/11；完整 PostgreSQL 链及领域/兼容21/21 DB_TESTED；完整 Chromium BROWSER_TESTED；类型/契约/静态/构建/transport PASS。42次迁移冻结，本批无迁移。见 `docs/release/TD2_STRUCTURED_COMPATIBILITY.md` 和 `artifacts/td2-structured-compatibility-20260928/`。前批 `9abdebd` / Actions36359984803 已确认5/5，本批head另验；人工迁移复核界面和受限编号清除路径继续，未合并、未部署。

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

云端运行36343700978暴露量尺确认后的浏览器断言竞态：数据库已为CONFIRMED，但测试在提交响应到达后立即检查旧页面。现先等待页面明确显示“已确认”，再断言没有编辑入口；保留数据库与UI两层断言，未加sleep、刷新或扩大超时。修正后整条真实Chromium流程再次通过；新head五条CI需重新确认。

# ONCE Production OS — 后续 Agent 工作入口

## 当前事实

分支 `feat/talent-domain-2`，PR #26，基于恢复分支 PR #25。
先读 `docs/release/TD2_MAINTENANCE_STATUS.md` → 当前 PR/head 对应 Actions → 代码，再读 PR #24 的 Talent Domain 2.0 R1 冻结规格。
规格提交：`54166a6f0f6753863d17f083a533b2cad5a9b3c2`。

Talent 2.0 已有类型化模型/前向迁移/业务接口/机器身份/建议/角色化候选清单，不再是 SPEC_ONLY。
**总体尚未完成，不能标记TD2-06 PASS；main未包含整条开发链，禁止正式资料接管。**

## 本批已推进

- 检索：职业关联、同一作品组合匹配、分页总数与facet可见性。
- Person删除：显式评估专业档案整体图，同事务清理、故障回滚、重试、最终化前防遗漏。
- 恢复：全部TD2表/类型关系入摘要，机器凭证撤销，未处理建议失效，资格密文解密校验，陈旧审批拒绝。
- 真PostgreSQL与真DB+media恢复新增TD2记录的测试，不用旧用例冒充新能力。
- 前批本地核心回归347/347；本轮新增合并验收见 TD2_MERGE_CONTINUATION，远端证据须绑定当前 head。

## 继续开发顺序

1. typed merge 已支持无冲突迁移和主档案历史保留、成人资格/重叠有效期显式决定，见 `docs/release/TD2_CONFLICT_MERGE.md`；不同职业候选已可逐项确认后分别保留，见 `docs/release/TD2_ROLE_CANDIDATE_MERGE.md`；职业不明且关联复核的真实碰撞已支持显式保留与原候选历史追加，见 `docs/release/TD2_CANDIDATE_REVIEW_MERGE.md`；历史删除仍阻断。
2. 十一类专业资料（含能力字典、外部标识、代表关系及所用机构）已实现双层许可导出与真实 CLI 重建，见 `docs/release/TD2_REPRESENTATION_TRANSFER.md`；旧 v1/v2/v3 格式兼容。字段级多来源证据已可单独批准后以 v5 迁移，见 `docs/release/TD2_FIELD_EVIDENCE_TRANSFER.md`，原核验归属不冒充目标账号/批准。无附件未核验/已撤销资质及独立授权的加密编号已可按目标密钥重建，见 `docs/release/TD2_CREDENTIAL_TRANSFER.md`；资质证明原件与已核验资质已支持独立媒体许可、v7 文件下载及隔离重建，见 `docs/release/TD2_PROOF_MEDIA_TRANSFER.md`。媒体集合、内容标签及原项目关系已可按 v8 迁移，见 `docs/release/TD2_COLLECTION_TRANSFER.md`。成年资格及原核验归属已可按 v9 迁移，见 `docs/release/TD2_ADULT_TRANSFER.md`，必须同时保留原字段核验证据。普通联系人和人才身份字段证据已支持 v10 独立许可与重建，见 `docs/release/TD2_IDENTITY_EVIDENCE_TRANSFER.md`。合并保留历史已支持 v11 明确许可与隔离重建，见 `docs/release/TD2_MERGE_HISTORY_TRANSFER.md`；原操作者不替换为目标管理员，数据库历史保护不关闭。旧扁平字段不可假装完整人才2.0。
3. Asset引用专用清理已覆盖集合、资质、成年证明与待审建议，见 `docs/release/TD2_SHARED_ASSET_ERASURE.md`；继续Source多来源保留及保留合并历史清理，剩余新依赖保持明确阻断。
4. 专业工作台、专业组合检索及新增真实Chromium流程已接通，见 `docs/release/TD2_PROFESSIONAL_WORKBENCH.md`；角色化候选选择/复核及旧候选升级已接通，见 `docs/release/TD2_CANDIDATE_CONTEXT.md`；继续完整证据浏览与未关闭业务边界，不能宣告全部UI验收完成。
5. TD2-T01～18全证据及前序DEV-09剩余运维/并发/长期保留门关闭后才启动AI。

## 不变量

Person≠Talent；一个人多个职业；稳定UUID不变；多来源事实不能静默覆盖。
Role/Capability/Credential分离；Collection类型与内容tag分离；成人资格不能从照片推测。
Agent用Machine Actor；无权限/冲突写入Proposal；unknown field/code/schema必须拒绝。
不改写历史migration。维护、导出、重建、恢复不得漏新关系；不依赖UI阻断来保障安全。
恢复始终MAINTENANCE和数据执行闸门关闭，approve不自动开放INTERNAL或解隔离。
日志/审计失败必须fail closed；异常不等于事务没提交；缺证据不能人工勾选忽略。
只在隔离测试库运行测试，不执行生产迁移、生产媒体清理、正式部署或隐式后台任务。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
