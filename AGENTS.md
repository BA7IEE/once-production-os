# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 docs/release/H1_HANDOFF.md（当前受控交接代码与验证边界）→ docs/release/A1_FOLLOWUP.md（当前验收补强与未执行边界）→ docs/release/FIX_R1.md（本补丁新增实现与实测边界）→ README → docs/release/IMPLEMENTATION_STATUS.md → REVIEW.md → TEST_REPORT.md，再读 docs/spec/06_DEVELOPMENT.md 与相应领域契约。原 release 文档保留旧基线证据；本补丁不把旧通过记录套用于新迁移。

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
9. 初始迁移已于 2026-09-23 在隔离 PostgreSQL 16 空库应用，并完成仓库已记录的 DB 用例。已应用且保留数据的迁移冻结；后续变更追加迁移，并验证旧基线升级和新空库安装。不得改写旧迁移、`db push` 或清库换取测试通过。
10. 来源历史迁移已在本地既有合成库和新空库实跑；这不代表正式环境已升级。历史记录只允许追加；保留清理/删除须另行评审，不能绕过不可改规则。

## 验证与下一步

A1 后续补强以 `7c327b4` 为输入：拒绝后完整检查点断言、降权后新会话拒绝、独立 PostgreSQL CI 和一键本地隔离验收脚本已编写。当前新脚本只完成核心回归、辅助断言与编排模拟；真实浏览器/数据库和 GitHub Runner 未执行。以下 A1/R1 成功记录只属于此前版本，不能沿用为新脚本通过。详见 `docs/release/A1_FOLLOWUP.md`。

依赖锁定、R1 完整构建、既有合成库迁移、新空库 PostgreSQL 测试与受限历史页面已有 2026-09-23 记录。A1 已在隔离数据库中验证浏览器续跑、响应丢失原样核对及来源/权限变化拒绝；最小 CI 已加入，但 GitHub 因账号付款/消费上限在启动 Runner 前拒绝检查，CI 仍 BLOCKED。完整浏览器异常清单、正式镜像与恢复仍未验收。

下一切片补受控资料交接及来源旧记录不能重建的证据边界，再按 DEV-04 私有媒体→DEV-05 作品/项目→DEV-06 内部候选清单推进，同时完成 DEV-07/09；之后完成 DEV-08 的有界 AI。AI 仍在一期，M0/M1/M2/M3 目前均不能标记完成。

每次交付更新状态表、review、测试报告和 MANIFEST。`PASS`、`CORE_MEMORY_TESTED`、`DB_TESTED`、`PROVIDER_VERIFIED`、`NOT_RUN` 必须区分，源文件存在不等于实现验收完成。

## H1 当前增量

PR #2 的 `0c2da7d` 已在 Actions 35859891008/attempts/2 实际通过；这是 H1 的基线，不是 H1 的测试结果。H1 新增单条基本档案的限时处理邀请，不改变维护人或原始范围，不授予敏感/原文/历史访问。仅基本资料操作使用 profileAccess；其他入口保持 policy.personFor/sourceFor，禁止全局替换。新迁移追加为 202609230002_record_handoffs。当前完整验证以 H1 文档及最终 PR head 的实际 CI 为准。

## 当前媒体增量

私有图片基线为 H1 683b9a1；A1/H1 已在各自固定提交的 CI 通过，不再称其 Runner 被账单阻止。当前媒体 PR 不自动合并。新图像链路与追加迁移/源代码是本批内容，不能沿用旧测试通过记录。媒体测试 `node --experimental-strip-types --test tests/media/local-images.test.mjs` 需要先真实构建 API；浏览器使用独立空库 `node tests/acceptance/browser-media.mjs`。生产/staging 本地存储关闭；不临时绕过它以接入真实资料。接续仍是剩余私有媒体能力、作品/项目、内部清单和有界 AI。
