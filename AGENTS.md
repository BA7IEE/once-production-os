# ONCE Production OS — 后续 Agent 工作入口

## 事实顺序

先读 `docs/release/WP2B_SEARCH_FACTS_SQL.md` → `docs/release/IMPLEMENTATION_STATUS.md` → `docs/release/TEST_REPORT.md` → 当前 PR 最终 head 对应 Actions，再读 WP2/WP1/M1/H1/A1/R1 历史说明与 `docs/spec/06_DEVELOPMENT.md`。

规格文档是输入事实，不自动等于当前实现状态；当前代码、迁移、生成契约和真实 CI 优先。

## 当前分支

- 分支：`feat/search-facts-sql`
- PR：#8，基于 `feat/search-shortlists` / PR #7
- 功能代码固定 head：`6a7ad1ab184486adaa57edf4295ba13eef905ef0`
- Actions：35995053306，五个 job 全绿
- 请求契约：85
- 核心/传输：223/223
- PostgreSQL：40/40
- Chromium 表单：6/6
- browser-resume / handoff / media / production：全部成功

文档收口后的最终 head 必须重新跑同一套 CI；不要拿前一个功能 head 的绿灯替代最终 head。

## 本轮新增事实

Work 新增 `industryCode` 和 `workTypeCodes`，由稳定字典 `industry/workType` 约束。人才按行业/作品类型命中时，只计算当前成员可见、来源当前有效、且有该人才真实 WorkCredit 的作品。H1 基本档案交接不参与这条资格。

普通搜索的结果分页、基础条件和 Facets 聚合已下推 PostgreSQL。核验时效仍由 core 对批量证据重算摘要；不要把“日期在范围内”偷换成“核验仍有效”。

## 安全与数据边界

1. 正式入口只使用 PrismaStore；MemoryStore 仅 tests。
2. ADMIN 不绕过 scope；关联不扩权。
3. 私有作品、项目、来源不能通过 Facets、计数或联想暴露。
4. Search adapter 必须参数化，不接受自由 SQL；AI 未来只能产出受限 AST 后调用同一查询。
5. 写动作继续使用 CAS、幂等回执、审计同事务。
6. 已应用迁移不改写；本批新增 `202609240004_search_facts_sql` 和 `202609240005_dictionary_search_namespaces`。
7. 查询次数固定不等于性能 SLA；规格目标需 4vCPU/8GB 参考环境至少三轮 P95。
8. `loadVisibility` 仍批量读取当前 workspace Source 计算 visibleSourceIds；完整来源授权 SQL 下推尚未关闭。

## 下一步

优先进入 DEV-07 维护：内部 JSON 导出、依赖追踪、受控删除/合并；并同步设计 DEV-09 恢复。正式资料接管前必须补齐生产存储与恢复/删除能力。DEV-08 AI 仍在一期，但不能先于这些安全门槛进入正式使用。
