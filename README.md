## 2026-09-29 本地接入前修正：外送总开关

AI发送、任务预留和启用状态现检查INTERNAL及INTERNAL_APPROVED；外送关闭仍可核对既有费用和停用配置。批准前复用账本配置校验，拒绝无效预算；页面按实际批准状态提供停用按钮。AI受影响33/33 CORE_MEMORY_TESTED，类型检查PASS；本地修正尚未推送，未重复触发完整CI，等待供应商/模型/协议及费用上限确定后与真实接入合并验收。本次无迁移，49次已应用迁移冻结。上一云端79856bf / Actions36449566292最终核心514/514、CI5/5；仅依赖下载超时任务单独重跑过，不替代本地修正验证。

## 2026-09-29 当前进展：AI 后台与费用核对

通用后台执行器、配置批准/停用、人工费用核对、不可改的证据关联和解冻记录及操作页面已接通。并发防重复发送、中断转未知保留费用、审计回滚及原键重试已测；44/44 CORE_MEMORY_TESTED，类型/191条契约/构建及本地测试替身浏览器 PASS。第49次追加迁移的真实 PostgreSQL、48→49保留未决费用和浏览器链待本批 CI，最终结果回填 PR。正式后台仅运行遗留请求隔离，真实适配器/密钥与价格加载/供应商查询仍未实现，普通部署仍关闭外送。未合并、未部署。详见 [AI_OPERATIONS.md](docs/release/AI_OPERATIONS.md)。

上一批最终提交151efb9 / Actions36445472822已确认核心507/507、五条CI 5/5；此证据不替代本批验证。以下为历史记录。

## 2026-09-28 当前进展：AI 业务服务与页面

补充边界：原文不足时允许零条建议，已确认费用正常结算，不生成待采纳提议；AI专项12/12通过。第48次迁移已在云端应用并冻结，最终提交CI另行确认。

四类文字任务、独立来源许可、原文输入预览、建议差异与一次性多字段采纳、未核验来源证据、关联删除及恢复隔离已接通。AI/费用/恢复/语言受影响43/43 CORE_MEMORY_TESTED；本地浏览器交互通过，使用测试数据库替身；真实 PostgreSQL 和浏览器已接入既有 CI，待新提交结果。生产调用仍关闭，真实供应商/模型、配置审批、实际 Worker 和费用核对尚未完成，不能标记 AI 生产可用或整期完成。详见 [AI_BUSINESS.md](docs/release/AI_BUSINESS.md)。前47次迁移冻结，本批仅追加第48次；未合并、未部署。

以下为此前批次的历史记录，已完成和剩余以本段及专项文档为准。

## 2026-09-28 AI 调用与费用底层进展

新增供应商无关的持久化预算/发送账本和事务外调度器：防重复发送、未知费用保留、取消不假装免费、超额冻结、配置/恢复批次变化阻断。AI与恢复专项25/25 CORE_MEMORY_TESTED，类型/契约/静态检查 PASS；第47次追加迁移的真实 DB 验收待新提交 CI。没有 AI HTTP/Worker 生产入口，没有真实供应商调用，四类任务、独立许可、提议采纳和页面仍未完成；不能标记 AI 或整期完成。详见 [AI_DISPATCH_LEDGER.md](docs/release/AI_DISPATCH_LEDGER.md)。上一语言合并最终提交7bf33f7的CI36389831201已5/5通过，不替代本批验证。未合并、未部署。

数据库验收36388534437发现新合并样本的来源依赖由6条变为7条，旧固定数量断言漏更新；现精确校验总数7、合并文本3条依赖、双方来源ID以及完整历史一致，专项6/6通过。原运行四条浏览器通过、数据库失败；修正提交需重新验收，不沿用旧通过记录。

复核时间精度缺陷已复现并修正：同次保存与复核共用一个事件时间，最终语言专项18/18及类型检查通过。第46次迁移已在云端应用并冻结；最终提交的完整CI另行确认。

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

共享图片专用删除已接通：人工确认后移出集合引用、撤销资质当前状态、将成年资格置为未知并使待审建议失效；其他原件与历史核验证据保留。419/419 CORE_MEMORY_TESTED，类型/契约/静态检查/构建 PASS；完整真实 PostgreSQL、共享引用审计回滚重试与物理文件删除 DB_TESTED；真实 Chromium 影响→决定→冻结→清理及原件目录检查 BROWSER_TESTED。执行时重新检查发起者当前资格和范围。本批无迁移。证据：`artifacts/td2-shared-asset-erasure-20260928/`。SOURCE多来源保留/删除、合并保留历史及完整交付继续推进，未合并、未部署。

详见 [共享图片清理](docs/release/TD2_SHARED_ASSET_ERASURE.md)。

云端运行36343700978暴露量尺确认后的浏览器断言竞态：数据库已为CONFIRMED，但测试在提交响应到达后立即检查旧页面。现先等待页面明确显示“已确认”，再断言没有编辑入口；保留数据库与UI两层断言，未加sleep、刷新或扩大超时。修正后整条真实Chromium流程再次通过；新head五条CI需重新确认。

候选职业选择与人工复核已接通：同一人物按不同职业分别入选，作品须匹配本次职业；旧候选升级保留原编号/备注并逐项待核实，不猜职业。416/416 CORE_MEMORY_TESTED，服务/React/core/transport类型、契约、静态检查及构建 PASS；完整 PostgreSQL 链（含原合同67/67、职业上下文/升级的审计回滚重试、真实备份恢复与各版重建）DB_TESTED；真实 Chromium 双职业入选、合并后人工复核、响应丢失原请求回放 BROWSER_TESTED。证据：`artifacts/td2-candidate-context-20260928/`。本批无新迁移；复杂来源/共享媒体/保留历史清理及完整交付仍待继续，未合并、未部署。

详见 [候选职业衔接](docs/release/TD2_CANDIDATE_CONTEXT.md)。

专业工作台已接通人物建档、基本身份、多职业/语言、量尺与成年资格、翻译方向、能力和机构登记、资质编号、集合素材、字段建议及专业组合检索。412/412 CORE_MEMORY_TESTED；服务/React/core/transport类型、契约、静态检查与构建 PASS。真实 PostgreSQL + Chromium 表单验证通过，覆盖响应丢失后原请求回放、旧版本冲突、只读账号与来源暂停清屏。证据：`artifacts/td2-workbench-20260928/`。本批无数据库迁移；完整人才2.0仍未完成，角色候选衔接、复杂来源/共享媒体/历史清理及全部交付证据继续推进。

详见 [专业工作台](docs/release/TD2_PROFESSIONAL_WORKBENCH.md)。

职业不明候选碰撞已支持人工选择保留项；两边复核记录的 UUID、原因和状态保留，原候选编号只追加，合并不会代替人工职业核实。412/412 CORE_MEMORY_TESTED，类型、契约、静态检查及完整构建 PASS；真实 PostgreSQL 双向选择、审计回滚/同键重试、SQL 历史保护和完整数据库链 DB_TESTED；真实 Chromium 合并与既有迁移流程 BROWSER_TESTED。40 次前向迁移在新空库通过，两个既有合成库各59表原内容摘要未变，其中一库显式含升级前复核记录；真实备份恢复保留新候选历史。证据：`artifacts/td2-candidate-review-20260928/`。完整人才2.0仍未完成；工作台、复杂来源/媒体清理继续开发，未部署。

详见 [候选复核合并](docs/release/TD2_CANDIDATE_REVIEW_MERGE.md)。

当前接续：[合并保留历史迁移](docs/release/TD2_MERGE_HISTORY_TRANSFER.md)增加 v11；旧身份、原合并决定及操作者、保留主档案与量尺关系一起迁移，目标不伪造新合并。人才 2.0 整体仍未完成。

前批：[身份字段来源证据迁移](docs/release/TD2_IDENTITY_EVIDENCE_TRANSFER.md)增加 v10；普通联系人无需人才档案即可按独立许可迁移所选身份字段的来源和原核验记录。整体人才 2.0 仍未完成。

前批：[成年资格与原核验归属迁移](docs/release/TD2_ADULT_TRANSFER.md)增加 v9；独立许可、原证明和核验证据一起保留，目标不伪造核验人或延长有效期。完整人才 2.0 仍未完成。

前批：[媒体集合与内容标签迁移](docs/release/TD2_COLLECTION_TRANSFER.md)增加 v8 白名单；图片顺序、说明、推荐标记及归档状态保留，共享文件只迁移一份。完整人才 2.0 仍待继续验收。

前批：[资质证明原件迁移](docs/release/TD2_PROOF_MEDIA_TRANSFER.md)已接入独立图片/来源许可、真实文件下载和隔离重建；已核验状态与附件关系保留。完整人才 2.0 尚未完成，证据见该页与当前 head CI。

前批：[无附件资质与加密编号迁移](docs/release/TD2_CREDENTIAL_TRANSFER.md)已接入独立许可和隔离重建；带证明附件的资质仍阻断，完整人才2.0未完成。

前批：已支持的十一类专业资料可另行批准[字段来源证据迁移](docs/release/TD2_FIELD_EVIDENCE_TRANSFER.md)，保留原记录和核验归属；完整人才2.0仍未完成。

> 当前入口：[人才 2.0 状态](docs/release/TD2_MAINTENANCE_STATUS.md)、[专业冲突合并](docs/release/TD2_CONFLICT_MERGE.md)、[职业候选保留](docs/release/TD2_ROLE_CANDIDATE_MERGE.md)与[专业导出/重建子集](docs/release/TD2_TYPED_TRANSFER.md)、[代表关系及关联机构迁移](docs/release/TD2_REPRESENTATION_TRANSFER.md)。PR #26 基于 PR #25，尚未合入 main；以下旧阶段证据不替代当前 head 验收。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

历史内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/项目 → 检索/候选 → 受控导出 → 删除最终化 → Person merge → T29 隔离重建 → **恢复隔离/检查/零增量批准 → write-ahead + DB/private media 同包备份恢复**。

DEV-09D 功能冻结 head `9cc30cf71dc4e6fc97bd81f2308dd884a267c230` 在 Actions `36249594313` 五个 job 全绿：103 routes、295/295 core/transport、67/67 原 PG，以及真实 pg_dump/pg_restore + private media 恢复演练。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前维护能力

受控删除已完成 DEV-07F 专用最终化：依赖清理完成后，Source / Person / Work / Project 可进入严格 ERASED 最小头；LocalMediaProvider 会先物理清理原件/预览，再终结 Upload / Asset；SourceHistory 只允许专用单向脱敏；最终请求状态为 COMPLETED / RETAINED_WITH_BASIS / FAILED。

Person merge 不是自动去重。它要求 `data.merge + records.write`、显式 preview、逐字段/逐关系决定和独立 `DATA_MERGE_MODE`。旧 ID 只读解析，写入继续拒绝；Handoff / UsePermission 不随身份转移；不同 Source 的 profile 值不会被静默改写到 canonical Source。

## 仍未完成

- 人才 2.0：冲突资料合并、专业资料导出/重建、复杂来源与媒体引用清理、组合工作台；
- 正式 COS / PDF / 视频 provider；
- DEV-08 四类有界 AI；
- 最终性能/生产接管门。

DEV-09E 已有逐条 delta resolution 实现；正式运维、长期保留与并发故障 Gate 仍未关闭，不允许人工勾选绕过。

## 继续开发入口

先读：

- [WP9 DEV-09D Write-ahead 与媒体备份恢复](docs/release/WP9_RECOVERY_WRITEAHEAD_MEDIA.md)
- [WP8 DEV-09A～09C Zero-delta 恢复链](docs/release/WP8_RECOVERY_ZERO_DELTA.md)
- [WP7 T29 隔离 JSON 重建](docs/release/WP7_JSON_REBUILD.md)
- [WP6 受控 Person merge](docs/release/WP6_PERSON_MERGE.md)
- [WP5 删除阻断与清理](docs/release/WP5_DELETION_CLEANING.md)
- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

下一步是 **人才 2.0 冲突资料合并、白名单导出与类型化重建**。根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
