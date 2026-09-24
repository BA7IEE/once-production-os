# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP2_SEARCH_SHORTLISTS.md` → `docs/release/IMPLEMENTATION_STATUS.md` → `docs/release/TEST_REPORT.md` → 当前 PR 最终 head 对应 CI，再读 WP1/M1/H1/A1/R1 历史说明与 `docs/spec/06_DEVELOPMENT.md`。源代码、生成契约和真实测试优先；旧报告保留当时结果，不能当作当前状态。

`docs/spec/` 是未改写的 v0.3 输入规格。规格里写的 NOT_RUN/NOT_STARTED 是原始文档状态，不代表当前源码仍未实现；反过来，已有代码也不等于整个 DEV 或 M1 已验收。

## 本轮范围

独立 ONCE 工程；原 SRVF 仓库、数据库、账号和密钥未改。WP2 在 WP1 的人才/作品/项目事实层上增加确定性结构化检索和纯内部 Shortlist：人才、署名作品、选图、顺序、需求简述、协作备注及当前依赖变化提示。

没有客户分享、匿名 URL、客户确认、报价、档期、预订、官网发布或任意 Agent 执行。AI 仍属于一期，但不得提前绕过 DEV-07/09 的维护与恢复门槛。

## 代码与安全边界

1. 正式入口只有 apps/api 的 PrismaStore。MemoryStore 仅用于 tests；不得加入生产内存回退。
2. 身份、动作、原生范围、来源有效性和被引用依赖在当前事务复查。ADMIN 不绕过范围。
3. H1 交接只授单人基本档案，不得被人才搜索、作品署名、项目参与或 Shortlist 当作原生可见资格。
4. Commands 只管理回执；回执读取由 replay-policy 做领域鉴权。业务写、父 CAS、审计和回执必须同事务。
5. 结果未知保留原请求键/请求体；不得自动重构命令重试。一次性秘密不写普通回执。
6. 联系方式、来源原文、凭证、cookie、完整请求体及隐藏子对象身份不得进入普通日志或占位 DTO。
7. `.env`、key 文件、测试/生产数据库 URL 和 `.secrets/` 不提交 Git、不进入构建上下文。
8. 不改测试来掩盖失败，不用自制声明冒充真实 Nest/React/Prisma typecheck。
9. 已合并/保留数据的迁移冻结；新变更追加前向迁移，不使用 `db push` 或清库换通过。
10. Shortlist 选图必须通过组合 FK 绑定真实 `WorkAsset`。作品解绑图片时只级联删除派生的 Shortlist 选图关系，不删除 MediaAsset 或候选条目；Work revision 变化用于提示清单依赖已更新。

## 当前开发入口与验收

WP2 基线：PR #5 / `c349af4f3cb8515c619f50836d79bac828aad34b`；分支 `feat/search-shortlists`；PR #7，目标仍为 `feat/works-projects`，不要跨过堆叠顺序直接合到旧上游。

功能代码 head `3db6b1810ac46423eedf6f8ff91b57f1b766d95f` 的 Actions 35985423108 已实际通过五个 job：85 条请求契约、221/221 核心/传输、39/39 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。最终文档 head 仍需保持同样 CI 全绿。

本批新增 `202609240002_search_shortlists` 和前向修复 `202609240003_shortlist_asset_unlink`；先前迁移不改。无新 npm 包，锁文件不变。

FR-15 的内部清单主链已落地。FR-14 目前支持姓名、角色、城市、语言、技能、状态、当前可见实际合作和核验时效，并返回命中依据；行业、作品类型、报价、档期不会用空值伪匹配。行业/作品类型及 SQL 授权分页/负载仍需后续关闭，因此不要宣告 DEV-06 全部完成。

## 接下来

优先补齐剩余结构化事实（行业/作品类型）和查询下推/负载边界，再推进 DEV-07 导出/合并/删除与 DEV-09 恢复。正式资料接管前还要关闭生产存储等 DEV-04 缺口。之后才进入 DEV-08 有界 AI；不要为了 AI 或官网发布扩张当前权限模型。
