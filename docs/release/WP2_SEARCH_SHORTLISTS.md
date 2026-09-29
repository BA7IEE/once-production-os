# WP2｜结构化人才检索与内部候选清单开发、Review 与验收说明

日期：2026-09-24。应用版本 `0.1.0-dev.1`。输入：PR #5 / `c349af4f3cb8515c619f50836d79bac828aad34b`。开发分支：`feat/search-shortlists`，PR #7。

本批落实 FR-15 的内部候选清单主链，并推进 FR-14 的结构化检索；**不宣告 DEV-06、M1 或一期全部完成**。行业/作品类型和 SQL 查询下推/负载仍未关闭。

## 1. 操作闭环

候选工作台提供确定性人才筛选：姓名/别名、角色、城市、语言、技能、档案状态、当前可见的实际合作记录、当前字段核验时效。返回命中依据，不生成未经校准的百分比评分。“未知”不当作“符合”。

内部 Shortlist 可以建立和编辑标题/需求说明；从检索结果加入人才；可选该人才当前可见的署名作品，再从该作品当前 WorkAsset 中选图；维护顺序和协作备注。加入后人物或作品 revision/source revision 变化会显示“加入后资料有变化”。

没有客户分享 URL、BoardVersion、ShareGrant、客户确认、档期锁定、预订、报价或官网发布状态。关闭 AI 也可完成本链路。

## 2. 权限和隐私

搜索只使用人才的**原生当前可见资格**，不会把 H1 限时基本档案交接加入搜索结果。Shortlist 根有自己的 scope；能读根不代表能读条目依赖。

条目读取重新检查 Person、Person Source、可选 Work/Work Source 以及每个选中 Asset 的当前资格。任一必需依赖无法证明可见时，整个候选条目只返回 `id/position/unavailable=true`；不返回人才名、角色、作品、图片、备注或隐藏 ID。拥有清单写权限的人仍可排序或移除这个占位。

命令回执只含 Shortlist 根 ID、revision 和最小状态；同键重放不会重新暴露已经隐藏的子对象。

## 3. 数据约束与图片解绑语义

新增：
- `shortlists`：内部需求、scope、maintainer、revision；
- `shortlistItems`：person、可选 work、顺序、备注，以及加入时人物/作品与来源版本；
- `shortlistItemAssets`：被挑选的真实 WorkAsset/MediaAsset 关系。

`shortlistItemAssets` 通过组合外键精确绑定 `(workspaceId, workId, workAssetId, assetId)`，不能拿同空间里另一作品的图片伪装成当前作品选图。

首轮真实浏览器回归发现：RESTRICT FK 会让已有 Shortlist 选图阻断作品正常“移除图片关系”，旧 WP1 API 从 200 退化为 422。这是实际集成回归，不是测试构造问题。追加前向迁移 `202609240003_shortlist_asset_unlink`，将 WorkAsset → 派生 Shortlist 选图改为 ON DELETE CASCADE：解绑作品图片只清掉对应候选选图；MediaAsset、人才、ShortlistItem 均保留。Work revision 改变后清单提示依赖已更新。

没有改写 WP1 或更早迁移。

## 4. 接口与 UI

新增 9 条路由，总请求契约从 76 增至 85：

```text
GET  /api/v1/talent-search
GET  /api/v1/shortlists
POST /api/v1/shortlists
GET  /api/v1/shortlists/{id}
PATCH /api/v1/shortlists/{id}
POST /api/v1/shortlists/{id}/items
POST /api/v1/shortlists/{id}/items/update
POST /api/v1/shortlists/{id}/items/remove
POST /api/v1/shortlists/{id}/items/reorder
```

管理端新增“候选工作台”：建立/切换清单、编辑需求、多条件找人、查看命中依据、加入候选、选署名作品/作品图、备注、上下排序和移除。页面明确写明行业/作品类型/报价/档期当前不支持，避免把空字段当匹配。

## 5. 实际验证

功能代码固定 head：`3db6b1810ac46423eedf6f8ff91b57f1b766d95f`。GitHub Actions [35985423108](https://github.com/BA7IEE/once-production-os/actions/runs/35985423108) 五个 job 全部实际成功：

| 检查 | 结果 | 边界 |
|---|---|---|
| 文件指纹、冻结安装、Prisma、类型、构建 | PASS | Linux 隔离 Runner；无正式部署 |
| 请求契约 | 85 条生成对照通过 | 请求 Schema，不是完整响应 OpenAPI |
| 核心/传输 | 221/221，失败 0 | MemoryStore；DEV-06 新增 6 条 |
| PostgreSQL | 39/39 TAP，失败 0 | 全新 PG16 测试库；含精确选图 FK、并发 CAS、写后回滚、WorkAsset 解绑级联语义 |
| 原生表单 Chromium | 6/6 | 字段标签/描述回归，不等于全站可访问性 |
| browser-production | PASS | 真 API/Worker/PG/Chromium：作品→项目→结构化搜索→清单→署名作品→选图→备注→依赖失效脱敏→作品图片解绑 |
| 既有 browser-resume / handoff / media | PASS | 原导入续跑、资料交接、私有图片回归未被破坏 |

新增浏览器日志明确出现：
```text
PASS DEV-06 browser: structured search -> internal shortlist -> credited work -> selected image -> collaboration note
PASS DEV-06 privacy: selected image source loss redacts the entire shortlist item in the browser
```

## 6. Review 中发现并修复

- 核验时效测试最初把 FakeClock 推进 31 天后继续使用旧会话，正确触发了会话过期 401；测试改为重新登录后再验证 30 天核验条件，未放宽会话安全。
- 浏览器首轮使用了不存在的 Playwright `getByAlt`，改为真实 `getByAltText`；业务断言未删除。
- 人才详情打开作品详情后，关闭作品会返回人才详情；隐私旅程补关父详情，按真实交互切页，不强制点击穿透 overlay。
- 最终真实浏览器发现 WorkAsset 被 Shortlist 选图 FK 阻断解绑，按第 3 节增加前向迁移及 PostgreSQL 反例测试。

## 7. 尚未完成

FR-14 仍缺行业和作品类型的正式事实字段/查询；当前搜索仍基于 Store 读取后的应用层过滤，未完成 SQL 授权分页、查询下推和目标数据规模负载验证。报价和档期本期数据模型没有事实来源，因此继续明确“不支持”，不会用空值匹配。

DEV-07 导出/合并/删除与跨域依赖处置、DEV-09 备份恢复、DEV-04 正式存储及 DEV-08 有界 AI 仍待后续。正式人才资料接管和生产上线均未批准。
