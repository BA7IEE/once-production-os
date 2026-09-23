# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 README → docs/release/IMPLEMENTATION_STATUS.md → REVIEW.md → TEST_REPORT.md，再读 docs/spec/06_DEVELOPMENT.md 与相应领域契约。

`docs/spec/` 是未改写的 v0.3 输入规格，其“尚未实现”是原文历史状态。当前已做和未做以 release 状态表及实际代码为准；这不是把未实现功能从一期删除的授权。

## 本轮范围

独立 ONCE 工程；原 SRVF 仓库、数据库、账号、密钥均未改动。此包仅做身份/范围/审计、来源/人才/字典/联系方式及有限导入。AI 仍属于完整一期，下一阶段必须继续；不新增网站接口或占位商业模块。

## 代码与安全边界

1. 正式入口只有 apps/api 的 PrismaStore。MemoryStore 仅用于 tests；不得为了演示或让构建过关引入生产内存回退。
2. 身份、权限、资源范围、来源有效期必须在服务端当前事务复查。ADMIN 不得自动读取不属于其范围的数据。
3. Commands 只管理回执；领域的回执读取鉴权在 replay-policy。新动作需登记 routes、请求 Schema、权限、响应 DTO、审计及回归测试。
4. 业务写与回执/审计同事务。不要在数据库事务中请求云服务、跑 scrypt、处理大文件或调用 AI。
5. 结果未知不等于失败。命令保持原请求键；一次性凭证响应未知先核对成员再显式重置；后台任务需要当前资格与租约。
6. 不把电话、原文、凭证、cookie、完整请求体写入普通日志/审计。新的字段必须逐项决定读取权限。
7. key 文件、.env、测试/生产数据库 URL 不得提交 Git 或打包；`.secrets/` 与构建上下文均已排除。
8. 不要改写测试来掩盖失败；不要用自制类型声明替代真实 Nest/React/Prisma 依赖以宣称完整 typecheck 通过。
9. 新开发先把 schema、迁移及真实数据库测试跑通。现在的 SQL 是候选初始迁移，尚未数据库验证，不能在真实数据上 `db push` 或无审查重置。
10. 当前初始迁移只允许在无真实部署历史时修正。一旦接力环境正式应用并保留数据，后续修改必须追加迁移并记录指纹。

## 验证与下一步

首先完成 docs/release/LOCAL_RUN.md 中的在线锁定、构建、隔离 PostgreSQL 测试和浏览器手工清单。不要跳过这些环节继续堆功能。

后续补齐来源历史与协作交接，再按 DEV-04/05/06/07/09 完成内部人工链路，然后 DEV-08 的有界 AI。M0/M1/M2/M3 目前均不能标记完成。

每次交付更新状态表、review、测试报告和 MANIFEST。`PASS`、`CORE_MEMORY_TESTED`、`DB_TESTED`、`PROVIDER_VERIFIED`、`NOT_RUN` 必须区分，源文件存在不等于实现验收完成。
