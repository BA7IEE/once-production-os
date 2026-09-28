# 人才 2.0 指定实现验收矩阵

本矩阵对应包含 `TD2_MANUAL_MAINTENANCE.md` 的实现批次。提交前本地检查列在下表；指定提交的五条云端结果仍须绑定真实 Git SHA，不能仅据文件存在宣称 TD2-06 Gate PASS。输入规格为冻结 `54166a6f0f6753863d17f083a533b2cad5a9b3c2:docs/spec/15_TALENT_DOMAIN_2.md` 的 TD2-T01～18。

共同数据库入口：`tests/postgres/talent-domain-gates.test.ts`，正式 Application + PrismaStore，包含21项子用例、父项共22/22通过；不使用生产内存回退。完整入口 `scripts/verify-postgres.mjs` 在同批运行全部下列真实数据库套件。

| 条目 | 真实证据与边界 | 本地结果 |
| --- | --- | --- |
| T01 | 普通Person无TalentProfile；显式升级保留UUID；未建档不能创建Role | DB_TESTED |
| T02 | 一个Person的模特/演员/KOL等多Role；直接SQL重复活动Role拒绝 | DB_TESTED |
| T03 | 独立来源、同值Evidence与冲突Proposal；原始来源不等于当前字段依据 | DB_TESTED |
| T04 | exact外部标识、验证/撤销及冲突；不按模糊姓名自动合并 | DB_TESTED |
| T05 | 机器范围/权限/维护人、真实机器审计与回执、轮换/撤销 | DB_TESTED |
| T06 | 能力注册、适用Role、旧Schema拒绝；baseline-upgrade验证GENERAL回填 | DB_TESTED |
| T07 | 语言级别可空；BASE/SERVICE及时间/来源；旧字段不猜级别 | DB_TESTED |
| T08 | 共享Casting、不可变测量历史、日期与尺码体系；旧身高待核实、鞋码不能关闭；明确不采用不创建量尺 | DB_TESTED |
| T09 | UNKNOWN不满足成年条件；实际证明不可用后资格不可用 | DB_TESTED |
| T10 | 指定Role/territory的代表关系；经纪人为普通联系人；历史迁移见representation-transfer共同夹具 | DB_TESTED |
| T11 | 真实私有图片跨集合/作品/候选复用，移出集合不删除原件；集合/标签/条目重建另有真实CLI证据 | DB_TESTED |
| T12 | 多Role不猜职业；失效Role不切换；候选冲突保留双方复核编号；人工选择原键回放 | DB_TESTED |
| T13 | 翻译语言方向/服务方式检索；摄影作为Role建档、署名及查询 | DB_TESTED |
| T14 | 资格与能力分离，过期历史保留，密文不泄露；显式清除编号保留已核验资质与证明 | DB_TESTED |
| T15 | 多条件、同作品/对应职业实际项目、隐藏来源与完整facet/计数；旧/新入口使用当前事实 | DB_TESTED |
| T16 | talent-v2-maintenance、talent-v2-merge、talent-asset-erasure、merge-history-erasure、各transfer套件；真实影响预览、显式决定、整组执行、审计故障回滚与原键重试 | DB_TESTED |
| T17 | talent-baseline-upgrade带旧数据原库升级、全部新空库迁移；rebuild、recovery、recovery-approval及各实际CLI/私有媒体transfer；关系/原核验/历史保留，恢复旧凭证撤销 | DB_TESTED |
| T18 | 未知字段/代码/Schema拒绝；仅proposal权限不许直接事实写；旧目标/失效来源建议失效 | DB_TESTED |

本批完整核心463/463 CORE_MEMORY_TESTED；类型/170条契约/静态检查/构建/transport PASS。真实浏览器最终结果见本批维护文档和云端指定提交，不在此以数据库结果替代页面验收。

## Gate与范围边界

- TD2-06最终Gate在指定实现SHA的五条CI完整通过后单独登记。矩阵不代表整个一期完成。
- SOURCE仍有合并载荷时采用明确的先PERSON历史清理、再SOURCE处置流程；不声称同一申请可任意合并这些动作。
- 已核验资格跨来源保留不能靠普通字段证据自动获准；受限编号清除是明确的人工作业，不等于保留许可。
- 旧接口/有限导入继续兼容未升级资料。已升级档案的旧专业字段受写保护；Phase C整体过渡和所有实际旧库人工复核不能因合成库通过而宣称清零。
- Phase D不具备删除旧列条件；42次历史迁移冻结。生产库、生产介质和约定参考环境全量P95未验收。
- DEV-08 AI未实现；实际供应商/模型/配置及用途许可未确认。未合并、未部署。
