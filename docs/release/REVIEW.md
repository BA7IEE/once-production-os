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

自审：v10 首次组合浏览器测试发现原件支持版本校验仍限 v7～v9；已登记 v10 并增加已核验成年资格、资质及共享集合原件组合回归，不放宽文件、核验或许可检查。身份值变更缺当前依据时明确拒绝，保留历史摘要。

前批：[身份字段来源证据迁移](TD2_IDENTITY_EVIDENCE_TRANSFER.md)增加 v10；普通联系人无需人才档案即可按独立许可迁移所选身份字段的来源和原核验记录。整体人才 2.0 仍未完成。

408/408 CORE_MEMORY_TESTED（新增6项）；服务、React、core、transport 类型检查、契约与构建 PASS。完整 PostgreSQL 链（原合同67/67）、独立双库身份字段真实CLI CHECK/APPLY、审计回滚/重试和重新导出比对 DB_TESTED。真实 Chromium v10 身份与专业/证明原件组合、原核验归属及证据许可撤销 BROWSER_TESTED。新空库38迁移通过，既有合成库59表摘要不变。 证据见 `artifacts/td2-identity-evidence-20260928/`。

前批：[成年资格与原核验归属迁移](TD2_ADULT_TRANSFER.md)增加 v9；独立许可、原证明和核验证据一起保留，目标不伪造核验人或延长有效期。完整人才 2.0 仍未完成。

自审重点：原核验归属不创建目标账号；已核验记录必须携带同人、同时间的状态证据；核验事件统一时间，补连续时钟测试，修复真实浏览器发现的毫秒差异。旧 v1～v8 兼容。**402/402 CORE_MEMORY_TESTED**；服务、React、core、transport 类型检查、构建与契约检查 PASS。完整 PostgreSQL 链（原合同 67/67、新增成年资格双库真实 CLI、审计回滚/重试、SQL 约束、含原核验记录的数据库与私有媒体恢复）DB_TESTED；新空库 37 个迁移通过。真实 Chromium 的 v9 授权、下载、原件摘要和撤权拦截通过。既有合成库 59 表原有记录摘要不变；该旧库成年资格表为空，不将它冒充历史成年资格升级数据覆盖。证据见 `artifacts/td2-adult-20260928/`。

前批：[媒体集合与内容标签迁移](TD2_COLLECTION_TRANSFER.md)增加 v8 白名单；图片顺序、说明、推荐标记及归档状态保留，共享文件只迁移一份。完整人才 2.0 仍待继续验收。

前批：[资质证明原件迁移](TD2_PROOF_MEDIA_TRANSFER.md)已接入独立图片/来源许可、真实文件下载和隔离重建；已核验状态与附件关系保留。完整人才 2.0 尚未完成，证据见该页与当前 head CI。

# 2026-09-27 无附件资质与加密编号迁移 Review

见 [TD2_CREDENTIAL_TRANSFER.md](TD2_CREDENTIAL_TRANSFER.md)。独立编号许可同时覆盖人物与资质来源，当前 sensitive.read 缺失即拒绝；后台及下载重查。目标在同事务复查当前 ADMIN 和 sensitive.write；使用原绑定校验密文、目标绑定重加密，所有键文件读取在事务外。密钥只从私有常规文件读取，错误输出不含路径、内容或明文。资质状态/日期/原ID/机构保留，未知关联、密文遮罩不符或需原件的资质拒绝。旧v1-v5和ERASED分支保留；新增前向迁移008不改已有记录。同一Agent自审，不替代独立审计。

---

# 2026-09-27 字段来源证据迁移 Review

见 [TD2_FIELD_EVIDENCE_TRANSFER.md](TD2_FIELD_EVIDENCE_TRANSFER.md)。单独许可，不把“能读专业资料”当成“能导出全部证据”；每个证据来源需同时许可对应资料组和证据组。原核验仅保留工作空间/成员UUID及时间，不复制用户，不绑定目标管理员。所有证据按原ID、旧值摘要和来源版本重建；旧值摘要不冒充当前值。证据、业务与最终审计同事务；未知归属/字段、未来来源版本、时间错误拒绝。保留旧格式边界、前向迁移及ERASED许可约束。同一Agent自审，未作独立审计。

---

# 2026-09-27 职业候选合并 Review

见 [TD2_ROLE_CANDIDATE_MERGE.md](TD2_ROLE_CANDIDATE_MERGE.md)。候选碰撞条件与原新增接口的职业上下文一致；不同职业UUID不能走旧二选一删除器。新增逐项迁移确认、清单范围/作品/选图及素材读取权限复查、完整依赖摘要。不移动职业ID、不删候选备注/选图/复核。停用职业关联候选仍留存并不可用。职业不明且有关联复核的实际碰撞继续阻断，未计作完成。无新迁移；同一Agent自审。

---

# 2026-09-27 代表关系迁移 Review

见 [TD2_REPRESENTATION_TRANSFER.md](TD2_REPRESENTATION_TRANSFER.md)。不自动扩选关联代表人，独立PERSON许可与来源许可缺一拒绝；机构跨分组共享时明确检查每个使用分组。人物/机构二选一、禁止自我代表、同人物职业及期间约束在服务端校验。旧v1/v2/v3结构保持；同事务恢复原ID/来源/停用状态，审计失败全部回滚。没有复制原联系人权限或电话，没有改旧迁移。本轮为同一Agent自审。

---

# 2026-09-27 外部标识与关联机构迁移 Review

见 [TD2_EXTERNAL_TRANSFER.md](TD2_EXTERNAL_TRANSFER.md)。显式字段白名单，不含cookie/凭证；人物、标识来源、机构来源分别许可，机构范围在当前事务重查。只迁移所用机构，目标scope映射遵守原隔离重建契约。保留核验/撤销状态，不自动合并，不重新激活撤销标识；新旧格式分支严格解析且不改变旧摘要。机构/字典/事实/审计同事务，失败无残留。前向迁移只扩白名单，历史约束不改写。本轮同一 Agent 自审，不是独立第三方审计。

---

# 2026-09-27 能力与字典迁移 Review

见 [TD2_CAPABILITY_TRANSFER.md](TD2_CAPABILITY_TRANSFER.md)。显式白名单只携带实际引用定义，人物及事实来源分别许可；冻结摘要包含定义的含义/版本/状态，未引用定义不造成失效。旧八类 v1 不插入空表，不改变冻结摘要。重建拒绝遗漏/夹带/重复/职业等级不符，不重启停用定义，字典与事实及审计同事务。前向迁移保留 ERASED 分支，不改写旧迁移。检查为同一 Agent 自审，不是独立第三方审计。完整媒体/资质/多来源迁移仍未完成。

---

# 2026-09-27 专业白名单迁移 Review

详见 [TD2_TYPED_TRANSFER.md](TD2_TYPED_TRANSFER.md)。逐字段白名单与版本契约、PERSON+实际SOURCE双层许可，不修改复合来源外键；生成/worker/下载重查。重建保留原编号和关系，不伪造 Evidence 或机器身份；预检拒绝缺依赖/非法状态/跨人物/量尺循环，审计失败回滚。八类子集不等于全量专业重建。保留旧 ERASED 导出规则并实测原地升级。本轮为同一 Agent 自审。

---

# 2026-09-27 专业冲突合并 Review

当前增量见 [TD2_CONFLICT_MERGE.md](TD2_CONFLICT_MERGE.md)。双主档案采用类型化历史链接保留原事实与证据，不合成新来源；活动事实逐项决定且拒绝矛盾。检查历史读取权限/来源/旧身份范围、Store 和 SQL 不可改约束、外观量尺归属、删除阻断和恢复摘要。审计故障回滚与原键重试已在真实 PG 验证；同一 Agent 自审，不是独立审计。

---

# 2026-09-27 人才 2.0 无冲突专业图合并 Review

将统一阻断细分为可证明安全的迁移与具体冲突。专业 UUID/来源/证据保持，PENDING 建议失效；不把 singleton 冲突简化成删掉一条。500 条边界、逐项确认、事务内权限复查、摘要漂移、回滚重试和原候选职业外键均纳入检查。详见 [本轮范围](TD2_MERGE_CONTINUATION.md)。这是同一 Agent 的代码复核与测试，不是独立第三方审计。

---

> 当前增量详见 [WP7_JSON_REBUILD.md](WP7_JSON_REBUILD.md)。当前结论以 PR #18 最终 head 与对应 Actions 为准。

# 第一批源码 Review

## 2026-09-26 DEV-07H / T29 隔离 JSON 重建 Review

本轮明确把 JSON rebuild 与 backup restore 分开。重建器只消费受控 `once-export-v1` 业务图，不恢复账号、会话、密钥、Contact、Evidence、Audit 历史或媒体字节。

对抗审查中实际发现并修复：

1. MemoryStore 没暴露 SourceHistory BASELINE 的真实 PostgreSQL CHECK；PG 首轮直接拒绝 actorId/decisionReason 非 null，修正为 observed baseline，执行人由 rebuild.apply Audit 单独记录。
2. 目标 Dictionary 若用正常 API 预置会产生 CommandReceipt，原“空目标”判断因此自相矛盾；修为业务表必须空，但允许 target-local catalog/audit/receipt 准备痕迹。
3. 同一 Asset 可被多个 Work 合法复用，不能按 assetId 全局判重；改为 workId+assetId link 唯一，并要求同 assetId 的 identity 元数据完全一致。
4. media position 必须从 0 连续，单 Work 仍受 30 个媒体上限。
5. 直接写 Store 不能绕过普通 API：重复 roles/language/skill/workType、trim 后空标题、单 Work >50 credits、单 Project >50 participants / >30 works 均拒绝。
6. APPLY 不能只信“Schema 看起来正确”的 JSON；现强制 `--expected-sha256` 与源 READY Export `payloadDigest` 一致，并在数据库访问前完成 digest gate。
7. rebuild.apply Audit 的 resourceId 改为源 exportId，目标库可以解释这批数据来自哪一份冻结导出。
8. CLI 兼容标准 pnpm `--` 分隔符，并使用 machine-readable quiet 调用验证 JSON 输出。

功能冻结 head `feeab369396bf85536c92e3f8812d2bd50d3be9a`，Actions `36220456451` 五项全部 success：103 routes、274/274 core/transport、67/67 原 PG 合同、T29 real export→PG rebuild 1/1、CLI safety acceptance PASS，四条 browser 主链全部通过。

下一阶段必须是 DEV-09 备份/恢复，不应继续给 T29 增加“像备份”的能力。

## 2026-09-26 DEV-07G 受控 Person merge Review

本轮没有把“查重”实现成自动合并。合并需要独立 `data.merge`、`records.write` 与部署侧 `DATA_MERGE_MODE`，并经过零写入 preview、字段冲突和关系冲突逐项决策。

对抗审查中实际发现并修复了几类边界：

1. merge receipt replay 最初没有独立领域鉴权，补为重新检查 `data.merge` 和 canonical 可见性；
2. old ID 只读解析不能因为 canonical scope 更宽而泄漏 alias，补为先检查 old identity 原 scope；
3. Shortlist Person 改绑必须重写加入时人物/source revision 基线，否则身份变更会被错误显示为“未变化”；
4. merge history 除 no-chain 外还必须 append-only，并通过复合 FK 固定 alias 与 decision 的 old/canonical 对、Person 与 Source 对；
5. 无 `sensitive.write` 的 preview 不能枚举 Contact 精确数量或逐条探测 Contact Source；
6. Person 只有一个 primary Source，不同 Source 的 duplicate profile 值不能被静默写进 canonical 后假装由 canonical Source 支持；跨 Source 冲突现只允许保留 canonical，同 Source 才能选 duplicate / UNION；
7. 新增维护入口后侧栏高度真实溢出，导致旧“删除影响评估”入口不可点击，已改为导航区域内部滚动；
8. PostgreSQL/浏览器测试中清除了跨子测试临时状态假设和错误的可访问名称定位，避免测试本身掩盖实现语义。

功能冻结 head `1673272979e338ede4ddf09952c941cae7344070`，Actions `36217418690` 五项全部 success：103 routes、263/263 core/transport、67/67 PG、Chromium 表单 6/6，四条 browser 主链全部通过。

DEV-07F 的删除专用最终化已经在此前 head `f3396a6b4585b04896a9e381efac4cc68e968462` / Actions `36112160471` 通过。因此当前 DEV-07 剩余主要缺口是 FR-29/T29 的隔离 JSON 重建，而不是 Person merge 或删除根终结。

## 2026-09-25 WP5 / DEV-07C～07E 受控删除 Review

在 DEV-07B 影响预览基础上，删除链继续分成“阻断、保留决定、冻结计划、依赖清理”，没有做一键删除。对抗审查明确要求 BLOCKED_FOR_USE 和 CLEANING 都进入正常读取阻断；删除管理自己才允许受控读取被冻结目标。

保留决定不允许普通 data.delete 成员凭空扩大用途：RETAIN_WITH_BASIS 需要 sources.review，并绑定另一份当前有效 INTERNAL_USE Source 的 revision/protectionEpoch。planDigest 冻结后决定不可再改；CLEANING 前再次核对保留依据。

不可逆执行另有 DATA_CLEANUP_MODE，默认 DISABLED。Worker 只执行注册动作，并为 DONE item 写 cleanupEvidenceDigest + worker audit。Media/Upload、SourceHistory、根对象等专用步骤明确 WAITING_EXTERNAL；请求保持 CLEANING，不把未知动作写成完成。

真实 PG 加测时发现两类重要问题：

1. PostgreSQL CHECK 的 NULL/UNKNOWN 三值语义允许缺失 executionPlanDigest 等字段绕过仅正则约束。追加 012 前向迁移，显式 IS NOT NULL；不改写 011。
2. 共享队列测试不能假设一次 Export claim 就是目标任务，改为按真实 Worker 语义持续消费直到目标 READY。

最终功能 head `32316937b91c7f66c9ed14a368ac74c2b58eed5b` 的 Actions 36096878872 五项全绿：101 routes、251/251 core、63/63 PG，真实 Chromium 完成计划冻结→CLEANING→依赖清理证据；根 Project 仍保留且不可正常读取。

仍未关闭：媒体物理清理、SourceHistory 专用处置、根对象最终 ERASED/最小头、删除请求最终 COMPLETED / RETAINED_WITH_BASIS / FAILED、Person merge、T29、DEV-09。FR-13/T13 不能标完成。

## 2026-09-24 WP4 / DEV-07B 删除影响预览 Review

在 DEV-07A 的 ExportDependency 基础上新增 data.delete、DeletionRequest/DeletionItem 和零写入影响扫描。对抗审查明确否决“创建删除申请就直接 BLOCKED_FOR_USE”的做法：本批尚未实现实际阻断，因此状态只允许 DRAFT，目标继续按原权限读写，避免状态撒谎。

影响扫描覆盖当前已实现关系、用途许可和派生导出。首轮隐私审查发现“Source 可见”不能推出同 Source 下后来被收窄 scope 的 Work/Project/Asset 可见；已修为 hidden dependency 只计 unresolved，不返回对象 ID。Asset→Shortlist 也重新检查 Shortlist 根权限。

创建 DRAFT 时重新扫描并比较 previewDigest；新增依赖会拒绝旧预览。存在 hidden/unresolved 或超过 1000 项时不允许创建申请。持久化申请详情只返回摘要，不回显 frozen DeletionItem ID。

功能 head `9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273` 的 Actions 36019151162 五项全绿：96 routes、237/237 core、52/52 PG、四条浏览器回归全部成功。browser-production 实际完成影响预览→DRAFT，并确认目标仍可读且没有执行删除按钮。

仍未关闭：BLOCKED_FOR_USE、protectionEpoch 阻断、清理 Worker、ERASED 最小头、保留决定执行、Person merge、T29 重建和 DEV-09 恢复。FR-13/T13 不能标完成。

## 2026-09-24 WP3 / DEV-07A 导出与依赖 Review

在 WP2B 上增加 data.export、INTERNAL_EXPORT UsePermission、ExportJob/ExportDependency 和部署 DATA_EGRESS_MODE。可读不自动变成可导出；许可精确到 Source + Subject + Fields + Expiry，DB 组合 FK 防止错来源授权。导出 payload 字段显式白名单，没有联系人、Source.textPayload、Session、密码、密钥、objectToken/签名URL。

对抗审查否决了“复用 DurableJob”的捷径，因为现有 aggregateId 外键固定到 ImportBatch；最终 ExportJob 自带有限 lease/attempts。Prisma JSON null 与 SQL NULL 差异通过新前向迁移固定。export-only 成员只读最小许可摘要，不获得 source.list；部署出口关闭后旧元数据仍可审计但不可下载。

功能 head `19585fb4382ac781d9e2688320ec8e1071340c92` 的 Actions 36005508490 五项全绿：92 routes、230/230 core、46/46 PG、四条浏览器回归全部成功。browser-production 真实完成审批→Worker→下载，并在来源暂停后证明整件旧导出不可下载。

仍未关闭：T29 隔离重建、DEV-07B 依赖预览/删除/ERASED/合并、DEV-09 恢复、正式数据与生产 DATA_EGRESS_MODE。不能把导出依赖表写成删除已完成。


## 2026-09-24 WP2B 搜索事实 / SQL 下推 Review

本批新增 Work.industryCode / workTypeCodes 和 industry/workType 字典，不将行业事实回写 Person。人才只因当前可见且有本人署名的作品获得行业/类型命中；私有作品不进入他人的结果、Facets或计数。

首轮真实 PG/Chromium 发现数据库 `dictionary_namespace_check` 未随应用 Schema 扩展，industry/workType 创建失败。追加 `202609240005_dictionary_search_namespaces` 后重新全链验证通过，没有修改初始迁移。

查询实现使用 bounded `talentQuery` + 参数化 Prisma SQL。对抗审查后继续把 Facets 从“取回全部匹配人员后在 Node 计数”改为 PG 聚合；100/1000 人均记录 16 次 SQL。核验时效没有简化成 reviewedAt 日期，而是继续重算 Person 字段摘要与 Source revision。

功能 head `6a7ad1ab184486adaa57edf4295ba13eef905ef0` 的 Actions 35995053306 五项全绿。仍不关闭来源 visible IDs 的完整 SQL 下推、规格 P95、AI parse_search 等价、生产数据升级与正式上线。


## 2026-09-24 WP2 检索/候选清单 Review

以 WP1 固定 head `c349af4` 为输入，新增确定性人才检索与内部 Shortlist。H1 基本资料交接不进入搜索/清单原生资格；清单根可见不扩张人物、作品或图片范围；任一必需依赖不可读时整个候选条目只保留不可用占位。搜索没有自由 SQL、模型评分或向量能力，行业/作品类型/报价/档期缺失时明确不支持。

数据库用组合 FK 保证候选选图确实属于声明 Work。真实浏览器回归发现该引用最初用 RESTRICT 会阻断 WP1 的作品图片解绑，导致旧 API 422；没有把测试改成接受 422，而是追加 `202609240003_shortlist_asset_unlink`，只级联删除派生 shortlistItemAsset。新的 PG 用例证明 WorkAsset 删除成功、Shortlist 选图被清理、MediaAsset/ShortlistItem 保留，且清单通过 Work revision 显示依赖变化。

功能代码 head `3db6b1810ac46423eedf6f8ff91b57f1b766d95f` 的 Actions 35985423108 五个 job 全绿：85 请求契约、221/221 核心、39/39 PostgreSQL、表单 Chromium 6/6，以及四条真实浏览器链路。此前测试曾因 31 天 FakeClock 正确使会话过期、错误 Playwright locator、父详情 overlay 未关闭而失败；均按真实安全/交互语义修测试，没有放宽权限或删业务断言。

仍未关闭：FR-14 的行业/作品类型、SQL 授权分页/查询下推和负载目标；DEV-07 导出/合并/删除；DEV-09 备份恢复；正式存储及一期 AI。WP2 不批准生产上线或正式资料接管。

## 2026-09-23 验收切片 A1

以合并提交 `1ba170ea8bd65dd667115605b52b021ffeb4b532` 为基线，只增加浏览器续跑/关键异常验收和最小 CI。测试脚本仅接受显式授权的全新回环 `once_test_*` 数据库，先检查公共 schema 为空，再迁移和 bootstrap；故障触发器只在该隔离库中暂时让合成第二行插入失败。正式 API、Worker 和页面仍使用 PrismaStore，没有生产故障开关或内存回退。

本机真实 Chrome 验证两行导入第二行失败时页面显示部分完成；继续响应到达服务端但在浏览器丢失后，页面原样重试，服务端只有一个回执，Worker 只补第二行，最终两人各一条。来源暂停和版本变化后，页面移除继续按钮并给出原因，API 拒绝；编辑权限撤销后，旧页面继续请求返回 401，任务和已入库检查点不变。完整日志和限制见[测试报告](TEST_REPORT.md)。

CI 使用锁文件安装、Prisma 生成、完整 typecheck/core/build 和同一浏览器脚本。PR 的首次远端检查在启动 Runner 前被 GitHub 拒绝，注释指出账号付款失败或消费上限；没有任何 CI 步骤执行。保留该检查门，账单恢复后须对最终 PR 提交重新实跑。完整浏览器异常清单、正式部署、受控资料交接和后续业务模块本切片未做。接下来按受控交接→私有媒体→作品/项目→内部候选清单推进，AI 仍属于一期。

## 2026-09-23 Review R1 接力复核

补丁以 `44aac4d93f23bb1f4c69e960a4c82d01b8b0d9dc` 为基线，经压缩包清单、补丁脚本和逐文件差异检查后，在独立分支应用。初始迁移未改；新增迁移只追加来源历史表和现存来源的观察基线。包内测试声明没有直接当作本机验收结果。

RV-20260923-01～05 的修复已在本地复核：失败导入显式继续保留旧检查点与幂等键；预览查询次数不随行数乘以人才数；来源变更和暂停决定同事务追加历史，暂停不再改写当前依据；旧暂停记录保留 `basisAmbiguous`；真实数据库测试在各 SQL 写入后注入故障并检查整体回滚。锁定依赖全量构建与 135/135 核心测试通过；新空库 13/13 PostgreSQL 断言通过。详情见[本次测试报告](TEST_REPORT.md)。

既有 `once_local` 合成库在升级前已留本机私密备份，迁移后来源 4、人才 5 不变，历史基线 4，其中旧暂停的不确定基线 2；迁移状态为最新。本地浏览器验证了已暂停来源的受限历史入口、迁移基线提示和不确定依据提示，页面脚本错误 0。旧 API/Worker 在迁移期间未运行。

仍未关闭：浏览器中的导入继续、权限拒绝和完整异常清单；正式数据迁移、恢复演练、CI 与正式镜像。OPEN-05 的“新变更无来源历史”和“暂停覆写当前依据”已修复，迁移前缺失的内容无法重建。OPEN-07 只关闭预览的 N×M 查询放大，SQL 授权分页和负载测试仍待做。M0/M1/M2/M3 不因此标记完成。

## 2026-09-23 接力复核

OPEN-01、OPEN-02、OPEN-03 的本地验证门已关闭：真实依赖锁文件及冻结安装、完整 Nest/React/Vite 类型检查和构建、空库迁移、隔离 PostgreSQL 集成测试全部通过。生产依赖审计现为 0 个已知漏洞；升级了 Nest 11.2.5，并对其 Multer 及 Prisma 配置的 deepmerge-ts 使用显式锁定覆盖。覆盖后的 Prisma validate/generate、迁移、构建与数据库测试均实际重跑。仍需跟踪上游正式修复，不把覆盖视作永久支持保证。

OPEN-04 只部分关闭：本地真实浏览器主链路通过，但异常响应、未知结果、受限字段、移动宽度及键盘焦点未逐项验收。其余 OPEN-05 至 OPEN-12 继续保留。M0/M1/M2/M3 仍未验收；无正式数据或生产部署。

首次 typecheck 暴露的重复 JSX `hint` 已修正。浏览器测试两次中断源于测试脚本定位器分别匹配重复“关闭/当前不可用”文案，以及用英文状态寻找中文“已完成”；只读查询证实导入任务已完成，修正定位器后整条链路通过。详见 [测试报告](TEST_REPORT.md)。

以下为 2026-09-22 离线交付时的历史 Review，保留当时的未执行状态供追溯。

结论：**允许打包作为开发接力源码；不批准生产上线、不宣布 M0/M1 验收。**

这是同一实现环境内的自查、反例测试与修订，不是独立第三方审计。本轮没有远程开发机可连接，容器不能解析 npm 域名；不能用“review 完成”掩盖完整编译和数据库验证的缺口。

## 1. 已回填代码并验证的事项

| 编号 | 反例 / 问题 | 实际处理 | 证据边界 |
|---|---|---|---|
| RV-01 | 旧请求重复创建或旧 CAS 拒绝正确重放 | 查回执先于原 CAS；内容/目标摘要冲突拒绝；写与回执同事务 | commands-imports 核心测试；PG NOT_RUN |
| RV-02 | 撤销角色/范围后借旧回执读取 | 每次当前身份检查 + 领域回执读取鉴权 | identity / commands-imports / talent |
| RV-03 | 凭证签发超时后自动再签一份 | 前端标记未知，强制先刷新核对再显式重置；不把 secret 写回执 | client-transport；浏览器 NOT_RUN |
| RV-04 | 重置接口把更新错误记成创建 | reset-access 返回 200；create 仍 201；重置追加限流 | identity |
| RV-05 | 待激活管理员影响最后管理员判断 | 只保护当前已激活的管理员；待激活账号可停用 | identity |
| RV-06 | 恢复隔离只挡普通 API 不挡激活 | 登录 KDF 后再查隔离状态；激活前后也查 epoch | identity；真实恢复 NOT_RUN |
| RV-07 | 调换两条联系信息的密文仍能解密 | AES-GCM AAD 绑定 workspace/person/contact，严格密文段落和编码 | talent / json-validation |
| RV-08 | 核验新字段覆盖旧核验记录 | 字段 evidence 改为追加，值或来源版本变化返回 STALE | talent；完整来源全文历史仍缺 |
| RV-09 | 导入 202 被当作完成 | 回执 state=ACCEPTED，界面查询 job 最终状态 | commands-imports；真实 Worker NOT_RUN |
| RV-10 | Worker 在来源暂停/账号降权后继续 | 每行当前资格/来源 revision 和租约检查 | commands-imports |
| RV-11 | 旧租约覆盖新 Worker | 领取 token + lease 截止双检查，过期 owner 不能写结果 | commands-imports；PG双进程 NOT_RUN |
| RV-12 | JSON.parse 静默丢弃重复字段 | 前后端共用严格 JSON 边界；拒绝重复/原型键、坏 Unicode、超限 | json-validation / contract |
| RV-13 | 普通 DTO 可注入敏感字段或空间 ID | 请求 Schema 拒额外字段；联系信息另端点及权限 | json-validation / talent |
| RV-14 | 编辑私有草稿无人有权审核 | 支持在创建前选择共同限定范围，明确默认私有的局限 | talent 合成协作测试；浏览器未执行 |
| RV-15 | 过期预览的旧回执重新获得入口 | replay-policy 对预览增加 expiresAt 检查 | commands-imports |
| RV-16 | 密码哈希或密文尾部多余序列仍被接受 | 固定序列段数，拒绝尾部附加数据 | json-validation |
| RV-17 | .secrets 初始化后可能被 Git/镜像带走 | .gitignore/.dockerignore 明确排除密钥、数据和非必要 artifacts | 实际文件核对及打包检查；不是完整秘密扫描 |
| RV-18 | 通用回执层反向依赖人才规则 | 独立 replay-policy；Commands 只调用传入领域校验 | 静态阅读与现有核心回归 |

前端另修订了“已选停用分类无法取消”的问题，并将来源依据从仅日期输入改为设备时区的明确截止时点，保存为 UTC。这两处只有源码/语法核对，真实浏览器仍 NOT_RUN。

Express 入口还增加严格 UTF-8、1MB 请求体限制和禁用压缩体；这部分只有源码/语法检查，不能写成真实 HTTP 中间件已验收。Vite 本地开发服务的文件拒绝列表也补入 .git、私密数据和 artifacts；开发服务仍不应对外开放。候选 SQL/Prisma 的 FK/索引名称已对齐，但尚未 `prisma validate` 或 DB diff。

## 2. 未关闭事项与放行边界

| 编号 | 问题 | 下一步 / 禁止结论 |
|---|---|---|
| OPEN-01 | 无真实依赖锁定，顶层版本仅候选 | 在线安装/支持周期/漏洞与许可检查；不可写“供应链安全” |
| OPEN-02 | Nest、React/Vite、Prisma 完整编译/生成未执行 | 完整 typecheck/build；不得用伪类型声明使检查假通过 |
| OPEN-03 | PG 迁移、组合 FK、并发和回滚未执行 | 跑专用空测试库；测试源码存在不是 DB_TESTED |
| OPEN-04 | 实际浏览器交互/可访问性未执行 | 对完整登录-建档-核验-导入链做真实浏览器测试 |
| OPEN-05 | 来源尚无完整版本史，暂停原因占当前依据字段 | 补独立来源版本/决定记录，保留原依据；不得声称原始证据全过程可追溯 |
| OPEN-06 | 默认私有编辑草稿尚无交接/范围成员变更命令 | 增加显式授权交接；不能通过 ADMIN 绕过权限“解决” |
| OPEN-07 | 全局事务锁 + 全量读取/应用层筛选 | SQL 授权分页和真实负载测试；不承诺规模指标 |
| OPEN-08 | JSON 摘要仅受限子集，响应 Schema 不完整 | 明确跨端规范、补 JCS 向量及响应契约；不宣称全量兼容 |
| OPEN-09 | 机构/媒体/作品/项目/清单/AI/导出删除未开发 | 接续 v0.3 工作包；不是把它们改为延期 |
| OPEN-10 | 尚无备份、完整恢复、密钥轮换与保留清理 | 保持合成验证，不用真实资料长期运营；不能拿 epoch guard 当作恢复验收 |
| OPEN-11 | readiness 只检查 workspace/隔离，不证明 schema drift | 接力完善迁移指纹与依赖就绪检查，保留最小存活检查 |
| OPEN-12 | SQL 运行身份未最小化，append-only 主要靠应用边界 | 实际 DB 角色/迁移权限/不可改审计约束另行落实 |

这些不是已经发现的线上漏洞：没有线上 ONCE 实例被测试。前四项直接阻挡本包“可部署已验证”结论；其余按对应工作包关闭，尤其正式资料试用前必须有删除、导出和恢复能力。

## 3. 复核方法与证据

核心测试在 Node 原生 TS strip 模式运行，生产路径之外使用测试专用 MemoryStore。回环 HTTP 测试实际开了本地 HTTP 端口，但适配器仍是测试 Harness，不是 Nest/Express，也不是浏览器。

静态检查使用 TypeScript AST/语法输出与生成契约比对，涵盖测试适配器不入生产、危险存储/HTML 标识符、命令头、延期路径等。它不是 lint 全集、依赖解析、完整安全扫描或模型证明。

最终具体条数与执行命令见 [TEST_REPORT.md](TEST_REPORT.md)；当前源码指纹见 artifacts/verification.json，整包指纹见 MANIFEST.sha256。没有修改 SRVF 仓库、连接生产库或云服务。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
