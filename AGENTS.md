# 当前切片：PR-03E 暂存回收与最终收口

用户已冻结 A–D，基线 ff6e10f。当前授权实现独立 purge、UNKNOWN 核对、容量归还、竞争/恢复安全及 PR-03 总回归。迁移1–66冻结，只允许前向增量。保持 PR #31 Draft、未合并未部署；不进入 PR-04 或其他后续业务。以下旧切片禁止进入E的文字是历史边界。

# 当前切片：PR-03D finalization

基线280568c，主体复核通过但未冻结。本轮仅LINK共享事实/素材不写入、独立Work Consent、exact Credit接手及legacy内部升级。迁移1–66不改，无67；PR #31继续Draft、未合并未部署，完成后等待复核，不进入PR-03E。当前实测证据以PR描述及新finalization目录为准。

# 2026-10-01 当前切片：PR-03D Work / 作品案例

用户已冻结 PR-03A/B/C，基线7909fa2。当前仅复用 Work/WorkCredit/WorkAsset，实现本人案例提交、精确职业署名、来源/授权和生命周期。迁移1–63冻结；本轮前向64–66，已实跑的64/65不改写。PR #31保持Draft、未合并、未部署，完成后等待代码复核，不进入PR-03E或其他延期模块。下方禁止进入Work为历史切片范围。

# 2026-10-01 当前切片：PR-03C finalization

主体复核通过但未冻结。本轮仅修 Grant-bound selfExposureManifest、Tag 当前来源和父集合版本、失效旧来源 current 切换、集合类型 identity。迁移1–63均保持原样；PR #31保持Draft、未合并、未部署。不进入PR-03D Work、客户分享、官网或Agent摄取。新增/完整实测证据见 docs/release/TALENT_EXPERIENCE_PR03.md，最终head CI以PR描述及本轮回复为准。

# 2026-10-01 当前切片：PR-03C 媒体集合

用户已复核冻结 PR-03A/03B（head 2c29e6819b3a1bcced4bd172777050415230c684）。当前继续 PR #31 Draft、未合并未部署，只做复用 MediaCollection/Item/Tag 的模卡、素颜照、Portfolio、Showreel、介绍视频和本人集合提交审核。下方禁止进入集合是历史范围，由本次用户授权替代。迁移1–62冻结，本轮增量63；先读 docs/release/TALENT_EXPERIENCE_PR03.md。完成后停下来复核，不进入 PR-03D Work、客户分享、官网或 Agent 摄取。Provider/COS/真实手机验证继续 NOT_RUN。

# 2026-10-01 当前切片：ADOPTED 正式媒体授权修正

只修正式媒体对原intake范围的依赖；STAGED审核接收范围保持严格。正式读统一PersonMedia Person/Role/Source及当前用途/删除保护。迁移1–62冻结、无新增迁移；PR #31继续Draft、未合并未部署。最终Core/PG/全部浏览器和精确head CI证据见PR-03交付说明及formal-auth证据目录。先交复核，不进入MediaCollection/模卡/素颜照/Portfolio/介绍视频。

# 2026-10-01 当前切片：PR-03 媒体归属与暂存底座

PR #31 保持 Draft，不合并、不部署。本轮仅 UploadContext、真实 uploader、STAGED/ADOPTED/RETIRED、Person/Role/Asset 多来源关系及本人/审核暂存读取、原子采纳和生命周期。当前迁移1–62已在隔离库应用，后续不得改写。先读 docs/release/TALENT_EXPERIENCE_PR03.md。本切片交付后等待复核，再进入 MediaCollection/模卡/素颜照/作品案例；不继续扩播放器、不进入客户分享、官网或PR-04。

# 2026-10-01 当前授权：PR-02 已合并冻结，启动 PR-03

PR #30 按用户指定 head 9fc2f9295068a16a16e6409b6df1c230bbe055ca 合并，main=1a297d86ecfeac5d7a3c748322a867c9852a20c9 的 CI 36815702669 九项通过。PR-02 已合并、开发冻结、未部署，PROVIDER_VERIFIED=NOT_RUN。下方禁止进入 PR-03、保持 PR #30 Draft 的内容属于历史范围，已由本次用户授权替代。

当前独立分支 codex/talent-experience-pr03，按 spec/15 与 spec/16 推进模卡、照片、视频、作品案例及本人多来源媒体维护。先读 docs/release/TALENT_EXPERIENCE_PR03.md；不得新增客户分享/官网/支付/CRM。既有迁移1–61冻结，新实体必须同步权限、审计、导出重建、删除、合并与恢复。PR-03 未获合并/部署授权，开发PR保持Draft，真实供应商结果不得由Mock替代。

# 2026-10-01 当前实现范围：PR-02b

用户已复核冻结 PR-02a。继续当前 PR #30 分支实施定向 CLAIM、ENROLL、逐人 grant、同档认领、服务器文本草稿/Submission、批量审核、来源归因与 INTERNAL_DIRECTORY 同意。保持 Draft，不合并、不部署；PROVIDER_VERIFIED=NOT_RUN。下方 PR-02a 禁止进入02b为历史范围，已被本次用户授权替代。前57次迁移冻结，只追加58及后续。不得进入PR-03媒体或客户分享/官网。

# 2026-10-01 当前实现范围：PR-02a

PR #30 本轮仅独立人才账号、认证、真实 TALENT 主体的统一回执/审计/writeAhead、最小 Portal 和生命周期。保持 Draft，先复核；不进入 PR-02b 认领/投稿审核，不创建 Invitation/Claim/Grant/Submission/Consent，不进入 PR-03 或客户分享/官网。详情以 docs/release/TALENT_EXPERIENCE_PR02.md 最上方为准。默认 Portal 关闭，PROVIDER_VERIFIED=NOT_RUN；本地测试服务不能视为真实供应商通过。第56/57次迁移仅追加，已有迁移不可改写，未部署。

# 2026-10-01 当前授权：PR-01 冻结，启动 PR-02

PR #29 已按指定 head b74cb79702b517ee1a1ed2125587a9a107ec2801 合并；main=79e064980fda7df9f90ea6a2fef13d3b3eeccb9f 的 CI 36755091719 七项 SUCCESS。PR-01 正式冻结、未部署。下方“保持 Draft、不进入 PR-02”为历史范围，已由本次用户授权替代。

PR-02 使用独立分支 codex/talent-experience-pr02，先读 docs/release/TALENT_EXPERIENCE_PR02.md，沿用 spec/15 冻结规范与 spec/16 ADR，不重开产品规划。范围仅人才账号、邀请、同档认领和本人文本维护。禁止顺带多来源媒体、客户分享、官网发布或占位菜单；前55次迁移不可改写。新增实体必须同步权限、回执、导出重建、删除、合并与恢复。PR-02 未获合并或生产部署授权。

# 2026-10-01 PR-01b finalization

仅继续 PR #29 的同维度多选 OR、完整 11 维 facet、版本化年龄预设、安全刷新恢复和 Person+Role 候选选择。保持 Draft，不进入 PR-02；55 次迁移均冻结，本轮无新增 schema。查询与导航合同见 docs/spec/16_TALENT_EXPERIENCE_CONTRACT.md 末节，实际证据见 docs/release/TALENT_EXPERIENCE_PR01B.md。本轮最终 head 的 CI 才能证明本轮完成。

# 2026-09-30 PR-01b 当前范围

当前基线 main=aa2ab9f（PR #28 已合并，六项 CI SUCCESS）。本轮按用户要求完成 PR-01b，先读 docs/release/TALENT_EXPERIENCE_PR01B.md；下方 PR-01a 是历史交付记录。新增第55次前向迁移，前54次不改写。日常目录/候选使用同一 POST 查询与单一主详情；快速建档继续复用已合并实现。所有新增事实须同步权限、证据、导出重建、删除、合并和恢复。后续邀请/门户/多来源上传/分享/官网不预建菜单。生产迁移、部署未获本轮授权。

# 2026-09-30 当前开发范围：Talent Experience v1.1

用户已请求落地。先读 docs/release/TALENT_EXPERIENCE.md 和 docs/spec/15_TALENT_EXPERIENCE_V1_1.md，再读当前主 PRD、开发说明和参数。基线 main=6aeaab51565699ce8b9f5a830e13d5d706a09ed0 已合并 PR #26；下方历史“未合并/main 未含”等语句不得覆盖当前 GitHub 状态。

按 PR-00–08 / Release A、B、C 交付。旧一期“禁止门户/分享/参考价”已由本次确认范围替代；禁止无授权公开、冒充 Membership、秘密落日志/浏览器存储、改写已应用迁移、恢复自动放行的规则仍适用。首轮完成范围回填和内部快速建档子切片，不等于 PR-01 或 Release A 完成。生产迁移、合并与部署不在本次开发操作中。

## 以下保留历史证据与仍适用安全约束

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
