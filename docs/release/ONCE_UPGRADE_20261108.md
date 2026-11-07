# ONCE 供应商库升级实施记录

依据：用户上传的 `ONCE_Upgrade_Plan_v1_20261108.docx`，版本 1.0；本记录区分方案建议、实际实现与实际验收，不把后续路线图记为已交付。

- 日期：2026-11-08（北京时间）。
- Base：`ea5bceaf41a33be87e8bf0aee3f9dca006d20a43`，PR 40 的主线合并提交；开工时 `origin/main` 相同，工作区干净。
- 分支：`codex/once-upgrade-20261108`。
- P01 已交付；用户已明确要求连续推进全部六包，现继续 P02—P06。P01 的精确源代码 head 与文件指纹见[历史首包摘要](../../artifacts/once-upgrade/p01/verification.json)，该摘要不证明后续新增代码已通过验收。
- 数据库：既有 78 次迁移保持原样；P01 无结构或迁移变化。
- 部署：未执行生产迁移或部署；本轮代码不复用旧 head 的 CI 作为完成证据。

## 分包状态

| 包 | 内容 | 当前状态 |
|---|---|---|
| P01 | 专业字段逐项替换、专业筛选恢复、当前入口说明 | 已实现并通过隔离验收 |
| P02 | 员工材料收件、解析、归属核对与正式保存 | 已实现并通过隔离验收（16 项核心、真实 PG 文件/费用/删除、Chromium） |
| P03 | 扩展事实合并与完整业务迁移格式 | 尚未实现，原有阻断保留 |
| P04 | 职业摘要与专业查询下推 | 尚未实现 |
| P05 | 项目多岗位需求、清单与候选关联 | 尚未实现 |
| P06 | 客户展示固定版本与当前权限、反馈 | 尚未实现 |
| 并行项 | PR 39 基础界面整合、真实服务验证 | NOT_RUN，不以旧版验收代替整合版本 |

## P01：专业替换与目录恢复

F01 已先复现：当 replace 包含摄影与导演的两条同名字段，而新答案仅包含摄影字段时，原实现返回 200。失败用例保留在 `artifacts/once-upgrade/p01/core-before.tap`。修复后使用每个旧事实自己的 `roleCode + fieldCode` 对应新答案，并拒绝重复替换 ID；所有检查先于事实退役和本人可见项修改。

覆盖整批少一个答案、跨职业同名字段、重复 ID、明确 `NOT_PROVIDED`、来源停用。拒绝后比较原事实、本人可见项及人物版本；成功后核对旧事实保留为 RETIRED、新事实与本人视图同步。真实 PostgreSQL 另覆盖数据库约束下的整组原子性。

F02 已先复现：专业已应用条件及未应用编辑不进入原目录历史。现在一起保存于版本 2 的既有 history state，继续绑定成员与会话范围。仅保存有界字段编码、选项、状态、数值/日期/布尔比较和候选 ID；拒绝未知字段及正文数据。未应用的能力空选择保留为编辑草稿。返回、前进后退和刷新均从这个状态恢复，然后重新请求当前可见结果；旧版本、退出、失效与新会话恢复为空状态。

专项目录浏览器使用 22 个匿名双职业人物、摄影职业加 ALL 专业标签、第二页、两个人选及未应用的 ANY 修改，检查详情返回、前进后退、刷新和退出后新会话隔离。照片、联系方式和事实正文没有写入历史状态或地址栏。

README 顶部同步 PR 40 的已合并状态，区分当时验收与本轮增量。历史交付文件保留原来的时间语义。

## P02：员工收件闭环与原件验证

| 现有能力 | 可复用位置 | 员工入口需要补的边界 |
|---|---|---|
| 原件、私有上传及处理 | `media.ts`、`media/worker.ts`、`media/local-provider.ts` | 使用真实员工主体与来源、范围，不创建虚假人才账号 |
| PDF 原生文字、页图与图片 | `apps/api/src/documents/parser.ts`、`workers/document-parser/parser.py` | 复用解析器；不把本人草稿和 consent 作为员工任务的所有者 |
| 字段、作品建议与出处校验 | `document-schema.ts`、`supplier-document-native.ts` | 材料分类、人工主体拆分和关联，非个人材料不生成个人事实 |
| 模型接线及一次发送费用账本 | `ai/model-client.ts`、`ai-dispatch.ts`、`ai-ledger.ts` | 持久员工任务、逐文件失败与 UNKNOWN 核对；不盲目新建付费请求 |
| 人物、职业、专业事实与作品 | `talent-intake.ts`、`supplier-professional.ts`、`portfolio.ts` | 以员工和原始来源经领域命令保存，记录清楚的采纳结果 |
| 外部 Agent 摄取 | `ingestion.ts`、`ingestion-structures.ts` | 候选/人工关联经验可复用；MACHINE 身份不能伪装为员工 |
| DurableJob / ImportBatch | `imports.ts`、`model.ts`、Prisma 模型 | 现有 Job 绑定表格导入，有 FK 与类型约束，不能直接塞入材料任务 |

最小闭环需要明确的收件批次、每份材料的持久任务与人工主体归属，以及对应的权限、撤回、删除、恢复与回执；具体新增结构在 P02 实施时前向追加。第一版网址只保存，不自动抓取；PPTX 显示转 PDF 路径。完整人物合并不阻塞先关联已有档案的小规模整理。

第 79 次前向迁移新增 Source 同 UUID 的收件批次及加密材料任务。员工实际接收人、解析人和采纳人分别记录，不建立虚假 TALENT 账号。复用现有原件、原生 PDF/图片解析、模型连接、一次发送费用账本、专业事实和精确作品署名。页面直接接收原件或网址，支持材料分类、逐页出处、多人拆分及明确关联同一 Person。

真实 PostgreSQL 专项使用匿名 10 页 PDF 跨 3 个 worker 实例完成，提取实际图片后建立作品；人工建 2 人，再将另一份图片补充到同一 Person。受控模型模拟响应丢失：暂停且不自动重发、同摘要新任务也受阻，经原请求明确核对后才续做。受控响应不代表真实模型质量或实际账单已验证。

删除验证发现并修复精确 WorkCredit 与职业清理的跨事务 FK 问题：只能清理同一冻结计划内已明确决定移除的署名。删除前阻断材料内容读取，清理后密文为空，独立来源原件保留。最终化也检查新增收件依赖，旧计划不会漏清理。真实 Chromium 发现并修复收件详情刷新 404；测试脚本中的错误属性、未核对的旧提交及错误 Prisma delegate 等失败单独保留，不计为产品通过。

P02 专项证据在 `artifacts/once-upgrade/p02/`：核心 16/16、真实 PG 1 个完整集成流程、Chromium 3 条流程及 3 个手机视口、类型、transport、339 条请求契约、静态 12/12、受控构建均通过。未在 P02 重跑全量 Core，后续包完成后执行最终完整回归。浏览器/PG 每轮都验证本轮资源归零。第 79 次迁移现已在隔离库应用并冻结。

## P01 验收与边界

本轮日志与机器摘要写入 `artifacts/once-upgrade/p01/`。本包实际结果如下，未运行不写 PASS。

| 验证 | 结果 | 证据 |
|---|---|---|
| 修复前复现 | 16 项中 3 项按预期失败；F01 原请求返回 200 | `core-before.tap` |
| 初次修复专项 | 16/16；最终完整回归再次覆盖这些场景 | `core-targeted.tap` |
| 最终完整 Core | 843/843，0 跳过；MemoryStore，不冒充 PostgreSQL | `core-final.tap` |
| 真实 PostgreSQL 专项 | 1/1 集成用例，含逐职业批量替换、整笔拒绝和本人可见项检查 | `postgres-final.tap` |
| 真实 Nest + PostgreSQL + Chromium | 10 条流程，含实际原历史条目的新会话隔离；360/390/430 视口 | `browser/browser.json`、`browser-final.txt` |
| 契约 | 329 条既有路由校验通过，无新增路由 | `checks.txt` |
| 类型与 transport 类型 | 通过 | `checks.txt` |
| 静态检查 | 12/12 | `static-review.json` |
| 构建 | 通过；保留既有大 bundle 提示 | `build.txt` |
| 迁移 | 78/78 与 base 内容摘要一致，无新增迁移 | `verification.json` |
| 本轮受控 PG / 浏览器资源 | 临时容器、进程组、网络、卷归零，浏览器与临时目录也已核验归零 | 两项最终日志的末行 |
| 当前分支远端 CI、生产迁移和部署 | NOT_RUN | 不借用主线或旧 PR 的绿色检查 |

第一次 PostgreSQL 尝试失败于新增测试夹具把 Date 对象传给 JSON 摘要，并在同一库 bootstrap 两次；已修正夹具，不关闭 bootstrap 保护、不改变业务断言。第一次浏览器尝试失败于 Node 22.16 缺少显式 TypeScript stripping；后续使用显式 flag，最终浏览器及完整 Core 使用 `.nvmrc` 的 Node 22.22.3。两次失败均已完成本轮资源回收，原日志保留为 `postgres-attempt1.tap` 与 `browser-attempt1.txt`。

主要改动文件：`packages/core/src/supplier-professional.ts`，`apps/admin-web/src/directory-state.ts` 与 `talent-directory.tsx`；对应的 Core、PostgreSQL、浏览器用例及 `.github/workflows/supplier-library.yml` 接入回归。README、AGENTS、本记录与 `scripts/write-upgrade-p01-verification.mjs` 记录当前状态和匿名证据；`MANIFEST.sha256` 覆盖交付文件。

复测使用 Node 22.22.3 / pnpm 10.14.0。完整 Core 实际入口为 `node --experimental-strip-types --test --test-concurrency=1 --test-timeout=120000 tests/core/*.test.ts`；数据库为 `pnpm test:postgres:owned --supplier-fields`；专业目录浏览器为 `ONCE_ACCEPTANCE_FIELDS=1 ONCE_ACCEPTANCE_UPGRADE=1 pnpm test:postgres:owned --browser-suite supplier-library`。受限 Linux 使用已有 `ONCE_RUNNER=managed-linux` 保护入口，Docker/构建/浏览器串行；未放宽资源阈值。未改动的文档解析器与生命周期专项不为凑次数重跑。

材料目录已在用户在线 Mac 上确认可访问：27 个 PDF 和 1 个 PPTX。本轮仅确认文件清单；不能借用此前的代表页校准声称已完成真实模型评测或此次业务导入。原件、文件名中的个人身份及材料正文不纳入本轮测试证据。

真实项目尚未指定。真实外部模型准确性及费用、认证供应商、COS、物理手机/移动网络、20—30 份材料业务试点与实际选人结果、生产迁移/部署均为 NOT_RUN。净人工耗时、字段修正情况、选人耗时与实际费用必须在真实试点后填写。
