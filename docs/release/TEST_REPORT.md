# Talent Domain 2.0 R1 规格变更验证｜2026-09-27

本批仅文档/开发契约 R1 回填，没有运行新的 schema、PostgreSQL、浏览器或产品验收。状态：

- TD2-01～06：NOT_IMPLEMENTED
- TD2-T01～18：NOT_RUN
- Person≠Talent / ExternalRef / ServicePrincipal / Casting/Measurement / Eligibility / Credential / Proposal 等：SPEC_ONLY
- 既有测试结果：不重标、不扩大
- 本批不得声称 Talent 2.0 R1 已实现

实现阶段必须在指定 commit 上补真实 migration、旧库升级、新空库、PostgreSQL、浏览器、ServicePrincipal/ExternalRef/Proposal、Shortlist Role Context、merge/delete/export/rebuild/recovery 与 Agent Schema 测试证据。

---

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
