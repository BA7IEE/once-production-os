> 当前增量：**WP2B 行业/作品类型事实与结构化查询下推**，见 [WP2B_SEARCH_FACTS_SQL.md](docs/release/WP2B_SEARCH_FACTS_SQL.md)。PR #8 基于 WP2/PR #7，保持 Draft；一期未完成，未生产部署。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单。行业和作品类型已经作为 Work 的稳定事实进入作品录入与人才检索；它们不会被硬写回 Person。

功能代码 head `6a7ad1ab184486adaa57edf4295ba13eef905ef0` 在 GitHub Actions [35995053306](https://github.com/BA7IEE/once-production-os/actions/runs/35995053306) 五个 job 全绿：85 条请求契约、223/223 核心/传输、40/40 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前能做

人才按姓名/别名、角色、城市、语言、技能、行业、作品类型、状态、当前可见实际合作和核验时效确定性筛选；结果显示命中依据，不生成未经校准的百分比。行业/作品类型来自**当前可见且有本人署名的作品**，私有作品不会给其他成员增加搜索命中。

内部 Shortlist 可保存需求、人才、署名作品、作品图、顺序和协作备注；没有客户链接、报价、档期、预订或官网发布状态。依赖失效后按当前权限重新读取并脱敏。

## 当前查询边界

普通结构化搜索的结果分页、基础过滤和 Facets 聚合已经进入 PostgreSQL；100 与 1000 人合成样本均记录 16 次 SQL，没有逐人 N+1。CI 单次实测约 19ms / 16ms，仅用于回归观察，**不是**规格里的 4vCPU/8GB、三轮 P95 性能验收。

核验时效仍需在 core 批量复算字段 valueDigest + sourceRevision，不能为了 SQL 化跳过证据一致性。可见来源 ID 目前仍由 `loadVisibility` 在事务内批量读取 Source 后计算；因此“完整 SQL 授权下推”尚未宣告完成。

## 仍未完成

DEV-07 导出/合并/受控删除，DEV-09 备份恢复，DEV-04 正式 COS/PDF/视频/原件生命周期，机构/品牌基础主体、内部双语文本、四类有界 AI、正式数据升级与恢复演练仍在一期内。

网站、AnqiCMS、客户门户、报价、合同、排期、财务继续延期，不应塞入当前内部 OS。

## 继续开发入口

先读：
- [WP2B 搜索事实与 SQL 下推](docs/release/WP2B_SEARCH_FACTS_SQL.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
