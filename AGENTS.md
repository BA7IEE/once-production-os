# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/SR1_STRUCTURED_SEARCH.md` → `docs/release/SL1_INTERNAL_SHORTLISTS.md` → `docs/release/WP1_WORKS_PROJECTS.md` → `docs/release/IMPLEMENTATION_STATUS.md` → `docs/release/TEST_REPORT.md` → 当前 PR 最终提交对应 CI，再读 M1/H1/A1/R1 历史说明与 `docs/spec/06_DEVELOPMENT.md`。源代码、生成契约和真实测试优先；旧报告保留当时结果，不能当作当前测试状态。

`docs/spec/` 是未改写的 v0.3 输入规格，其“尚未实现”是原文历史状态。当前已做和未做以 release 状态表及实际代码为准；这不是把未实现功能从一期删除的授权。

## 本轮范围

独立 ONCE 工程；原 SRVF 仓库、数据库、账号、密钥均未改动。现有身份/来源/人才/导入/受控交接/私有图片/作品/项目/内部候选清单上，新增结构化人才检索与命中依据。检索只解释当前有权读取的事实，不做黑盒评分，不推断档期、预算或国籍。AI 仍属于完整一期；不新增网站接口或占位商业模块。

## 代码与安全边界

1. 正式入口只有 apps/api 的 PrismaStore。MemoryStore 仅用于 tests；不得为了演示或让构建过关引入生产内存回退。
2. 身份、权限、资源范围、来源有效期必须在服务端当前事务复查。ADMIN 不得自动读取不属于其范围的数据。
3. Commands 只管理回执；领域的回执读取鉴权在 replay-policy。新动作需登记 routes、请求 Schema、权限、响应 DTO、审计及回归测试。
4. 业务写与回执/审计同事务。不要在数据库事务中请求云服务、跑 scrypt、处理大文件或调用 AI。
5. 结果未知不等于失败。命令保持原请求键；一次性凭证响应未知先核对成员再显式重置；后台任务需要当前资格与租约。
6. 不把电话、原文、凭证、cookie、完整请求体写入普通日志/审计。新的字段必须逐项决定读取权限。
7. key 文件、.env、测试/生产数据库 URL 不得提交 Git 或打包；`.secrets/` 与构建上下文均已排除。
8. 不要改写测试来掩盖失败；不要用自制类型声明替代真实 Nest/React/Prisma 依赖以宣称完整 typecheck 通过。
9. 初始迁移已于 2026-09-23 在隔离 PostgreSQL 16 空库应用，并完成仓库已记录的 DB 用例。已应用且保留数据的迁移冻结；后续变更追加迁移，并验证旧基线升级和新空库安装。不得改写旧迁移、`db push` 或清库换取测试通过。
10. 来源历史迁移已在本地既有合成库和新空库实跑；这不代表正式环境已升级。历史记录只允许追加；保留清理/删除须另行评审，不能绕过不可改规则。

## 当前开发入口与验收

本批 SR1 输入基线 `b2654b2`（PR #6 固定验收 head），后续独立 `feat/structured-search` 分支依赖 PR #6；不要合入候选分支。上游 PR 依次合并后再调整目标到 main，重新核对最终 CI。不自动部署或清用户开发库。

新增 `GET /people/search`，组合姓名/角色/城市/语言/技能/状态/作品关键词与归属/当前可见 ACTUAL 项目及核验时效。未知字段不匹配；核验必须对应当前字段值和当前来源 revision。H1 基本资料交接不能借搜索读取隐藏作品/项目。

本批不新增迁移。现有六条迁移冻结；无新包依赖，锁文件保持不变。完整核心/传输、类型/构建、PostgreSQL 与 Chromium 最终只认本 PR 固定 head 的 CI；本地分批 MemoryStore 测试不能冒充完整环境通过。

当前明确不支持 availability / budget / nationality；不要通过姓名、照片、语言或城市推断。ACTUAL 计数仅表示“当前可见且系统已记录”的实际参与，不证明系统外经历。

后续补行业 taxonomy、SQL 授权分页/负载，再继续媒体、DEV-07 导出/删除、DEV-09 恢复和 DEV-08 有界 AI。AI parse_search 将来必须解析到同一结构化条件，不能另造排序体系。