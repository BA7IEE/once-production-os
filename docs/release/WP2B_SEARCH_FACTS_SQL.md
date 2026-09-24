# WP2B｜行业/作品类型事实与结构化查询下推

日期：2026-09-24。分支 `feat/search-facts-sql`，PR #8，基于 WP2/PR #7。

## 1. 为什么这一刀要做

WP2 已有候选清单和基础检索，但 FR-14 还缺行业、作品类型，以及避免逐人读取项目/证据的查询路径。本批不把行业硬贴在人身上，而是把它作为 Work 事实：人才只有在当前可见作品存在真实 WorkCredit 时，才因该作品获得行业/作品类型命中。

## 2. 数据模型

Work 新增：
- `industryCode: string | null`
- `workTypeCodes: string[]`

Dictionary namespace 新增：
- `industry`
- `workType`

应用层创建/更新会校验当前启用字典；停用分类不破坏已有历史引用，但不能给新作品新增停用值。

新增前向迁移：
- `202609240004_search_facts_sql`：Work 字段、CHECK、GIN/BTREE 搜索索引；
- `202609240005_dictionary_search_namespaces`：扩展数据库字典 namespace CHECK。

初始迁移和既有迁移没有改写。

## 3. 搜索语义

`TalentSearch` 使用 bounded `Tx.talentQuery`，不是自由 SQL。

普通条件包括：
- q
- role
- cityCode
- languageCode
- skillCode
- industryCode
- workTypeCode
- status
- actualProject

PrismaStore 用参数化 SQL 执行当前页、总数和 Facets；Facets 聚合也在 PostgreSQL 完成，不再把全部匹配人员整行拉回 Node。

核验时效是例外：`verifiedWithinDays` 必须比较 FieldEvidence.valueDigest、当前 Person 字段值和 Source revision。为保持与原规则等价，Store 先批量返回候选与证据，core 再重算摘要后分页/统计；不会只按 reviewedAt 日期伪造“仍有效”。

## 4. 权限

人物、作品、项目只使用原生当前权限。行业/作品类型必须来自：
1. 当前成员可见的 Work scope；
2. Work Source 当前有效且可见；
3. 该 Work 有目标 Person 的 WorkCredit。

H1 限时基本档案交接不让人才进入搜索，也不会让其私有作品成为行业命中。

当前还有一个明确边界：`loadVisibility` 会在短事务内批量读取 workspace 的 scopes / scopeMembers / sources，再生成 visibleScopeIds / visibleSourceIds。人员结果与 Facets 已下推 SQL，但来源可见 ID 尚不是纯 SQL 计算。

## 5. UI

作品表单新增“行业”和多选“作品类型”；作品详情展示两类事实。分类字典新增行业/作品类型页签。候选工作台新增行业/作品类型筛选，并在人才卡片显示来自可见署名作品的事实。

报价和档期仍无结构化事实，不提供筛选。

## 6. 实际验证

功能 head：`6a7ad1ab184486adaa57edf4295ba13eef905ef0`

Actions：[35995053306](https://github.com/BA7IEE/once-production-os/actions/runs/35995053306)

- 85 条请求契约通过；
- 223/223 核心/传输；
- 40/40 PostgreSQL；
- 表单 Chromium 6/6；
- browser-resume / handoff / media / production 五个 job 全绿。

真实 PG 查询计数：
```text
PG-talent-search people=100  pageSize=20 queries=16 elapsed≈19ms
PG-talent-search people=1000 pageSize=20 queries=16 elapsed≈16ms
```

这里只证明查询次数不随 100→1000 人增长、且该 CI 运行没有明显回归。规格要求的 4vCPU/8GB 参考环境、至少三轮、结构化查询 P95<1.5s 尚未正式执行，所以不把上述毫秒值写成性能验收。

真实浏览器日志：
```text
PASS DEV-06 browser: industry/work-type search -> internal shortlist -> credited work -> selected image -> collaboration note
PASS DEV-06 privacy: selected image source loss redacts the entire shortlist item in the browser
```

## 7. Review 发现

首轮真实 PG/浏览器创建 `industry/workType` 字典时报 `dictionary_namespace_check`，原因是应用 Schema 已扩展但数据库初始 CHECK 仍只允许四类。没有放宽测试，追加 202609240005 前向迁移后重跑全绿。

对抗审查后又将 Facets 从“SQL 取全部匹配人员行后 Node 计数”改成 PostgreSQL 聚合；最终查询次数仍保持 16。

## 8. 尚未完成

- 来源可见 ID 的完整 SQL 授权下推；
- 规格参考环境三轮 P95；
- AI parse_search 与手工条件结果一致性（DEV-08）；
- DEV-07 导出/合并/删除；
- DEV-09 备份恢复；
- 正式媒体存储与生产启用。
