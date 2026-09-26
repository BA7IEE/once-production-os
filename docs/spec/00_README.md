# ONCE Production OS｜v0.5 内部 OS + Talent Domain 2.0 R1 开发基线

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 已重新冻结候选，相关实现尚未执行

## 1. 这版做什么

**先交付 ONCE 自己每天使用的工作系统，不建设官网发布系统。**

当前一期主线调整为：收到资料 → 建 Person（自然人）→ 需要时启用 TalentProfile → Role/Capability/Language/Location/Casting/Measurement/Representation/ExternalRef/Credential 等有据事实 → 作品/项目/媒体 → 按 Person+Role 建内部候选 → **先完成 Talent Domain 2.0 R1 Gate** → Agent/AI 按版本化 Schema 提议/写入 → 人工确认 → 持续复用。

AI 仍是一期的明确工作，但正式人才抽取/标签/搜索契约必须在 Talent Domain 2.0 R1 完成后启动；外部 Agent 也必须使用 ServicePrincipal、ExternalRef、Schema Registry 与 Proposal/领域命令，不能围绕旧过渡字段另造事实模型。没有 AI Key、没有外网或模型故障，人工建档、找人、看作品、做项目记录仍能完成。内部用途说明、账号权限、素材私有访问和必要审计继续保留。

本版在 v0.4 R0 基础上完成 **Talent Domain 2.0 R1 对抗审查回填**：Person≠Talent、多来源、时间事实、ExternalRef、Machine Actor、Shortlist Role Context、Casting/Measurement、成人资格、Credential、Collection type/tag、Proposal 等成为正式冻结契约。现有实现状态仍以 `docs/release/` 与当前代码/CI 为准。

## 2. 明确移出一期

官网发布、AnqiCMS 适配、SEO/GEO、公开人才/作品/案例页、公开媒体、客户外部分享页、在线客户反馈、人才自助门户全部延期。客户分享延期是本版为聚焦内部 OS 采用的范围默认，不是把用户的话改写为“永远不要对外协作”；有真实需要时可独立恢复。

CRM、财务、商业合同、排期、报价继续不做。场地/设备管理、通用流程引擎、开放市场与多租户 SaaS 不在一期。

**延期模块没有页面、没有空菜单、没有预建业务表、没有接口、没有 Worker、没有凭证配置，也没有验收前置门。**现有官网照常独立运行，本版不读取、不迁移、不修改它。

## 3. 本期保留的用户界面

工作台、人才库、作品库、轻量项目、素材与资料整理、内部候选清单、AI 辅助、系统管理。权限/用途判断嵌入实际操作；不是先做一个复杂的“版权审批中心”。内部中英文字可编辑，不等于公开稿，也不会自动发往网站。

## 4. 文档地图

| 文件 | 唯一职责 |
|---|---|
| [01_REVIEW.md](01_REVIEW.md) | 范围修复、19项审查发现的保留/简化/延期处置 |
| [02_BRD.md](02_BRD.md) | 内部业务价值、投入与阶段成效 |
| [03_MRD.md](03_MRD.md) | 当前用户任务、假设与替代方案 |
| [04_PRD.md](04_PRD.md) | 产品行为；保留FR-01～30，明确22项在做/8项延期 |
| [05_REUSE.md](05_REUSE.md) | SRVF来源、复用边界与三个小切片 |
| [06_DEVELOPMENT.md](06_DEVELOPMENT.md) | 开发主入口：技术、模块、首条旅程、交付顺序 |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) | 当前需要的模型、约束、依赖和未来扩展边界 |
| [08_API_PERMISSIONS.md](08_API_PERMISSIONS.md) | 内部接口、权限、失败协议、bootstrap |
| [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | 内部用途、上传、导出、AI和删除状态/时序 |
| [10_BACKLOG_TESTS.md](10_BACKLOG_TESTS.md) | 12个工作包、需求追踪及待运行测试 |
| [11_OPERATIONS.md](11_OPERATIONS.md) | 内部部署、AI开关、备份恢复和接管 |
| [12_DECISIONS_CHANGELOG.md](12_DECISIONS_CHANGELOG.md) | 唯一阶段门、默认参数与决策表 |
| [13_SOURCES.md](13_SOURCES.md) | 本轮输入指纹及继承的研究证据 |
| [14_DOC_QA.md](14_DOC_QA.md) | 文档检查，不冒充产品测试 |
| [15_TALENT_DOMAIN_2.md](15_TALENT_DOMAIN_2.md) | Talent 2.0 R1 冻结规格：Person/Talent边界、多来源、Role/Capability、时间事实、ExternalRef、Machine Actor、Agent Schema |
| [AGENTS.md](AGENTS.md) | 编程 Agent 的阅读顺序和修改边界 |

共17份Markdown（含本页）。Talent 2.0 R1 是 v0.5 的强制规格，不是另起一套模特/摄影/翻译系统。

## 5. 阅读与开始开发

先读本页、PRD、开发文档、工作包与 `15_TALENT_DOMAIN_2.md`；再读当前任务涉及的模型/API/状态章节。业务范围以本页和PRD为准；参数与阶段门只在12定义。发现矛盾先同步修正，不选择对自己更方便的一份执行。

历史 DEV-00～09 的实际完成情况只看 release 证据。当前顺序是：完成 DEV-09 恢复链 → 执行 R1 定义的 TD2-01～06 并通过 TD2-T01～18 → 再启动 DEV-08 AI。代码复用资格仅约束来源代码移植；真实资料依据仅约束真实数据；AI供应商验证仅约束第三方真实调用。**没有任何官网条件阻止内部 OS 开发或一期验收。**

## 6. 交付状态

Talent 2.0 本轮是规格升级，不代表 schema migration、API、页面或产品测试已完成。已有产品实现证据不因本次规格修改失效；新增 TD2 能力均为 `NOT_IMPLEMENTED/NOT_RUN`，直到各实现 PR 提供真实数据库、浏览器、rebuild 与 recovery 证据。
