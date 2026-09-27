# ONCE Production OS — 后续 Agent 工作入口

## 当前事实

分支 `feat/talent-domain-2`，PR #26，基于恢复分支 PR #25。
先读 `docs/release/TD2_MAINTENANCE_STATUS.md` → 当前 PR/head 对应 Actions → 代码，再读 PR #24 的 Talent Domain 2.0 R1 冻结规格。
规格提交：`54166a6f0f6753863d17f083a533b2cad5a9b3c2`。

Talent 2.0 已有类型化模型/前向迁移/业务接口/机器身份/建议/角色化候选清单，不再是 SPEC_ONLY。
**总体尚未完成，不能标记TD2-06 PASS；main未包含整条开发链，禁止正式资料接管。**

## 本批已推进

- 检索：职业关联、同一作品组合匹配、分页总数与facet可见性。
- Person删除：显式评估专业档案整体图，同事务清理、故障回滚、重试、最终化前防遗漏。
- 恢复：全部TD2表/类型关系入摘要，机器凭证撤销，未处理建议失效，资格密文解密校验，陈旧审批拒绝。
- 真PostgreSQL与真DB+media恢复新增TD2记录的测试，不用旧用例冒充新能力。
- 前批本地核心回归347/347；本轮新增合并验收见 TD2_MERGE_CONTINUATION，远端证据须绑定当前 head。

## 继续开发顺序

1. typed merge 已支持无冲突专业图逐项确认和稳定 ID 迁移，见 `docs/release/TD2_MERGE_CONTINUATION.md`；双主档案/成人资格/重叠有效期/职业候选冲突仍阻断，继续补齐无损冲突决策。
2. 白名单/用途许可约束的TD2导出与T29类型化重建；旧扁平字段不可假装完整人才2.0。
3. Source多来源保留与Asset引用专用清理；当前新依赖下保守阻断，不宣告删除完成。
4. 人才2.0前端组合工作台与新业务Chromium验收。
5. TD2-T01～18全证据及前序DEV-09剩余运维/并发/长期保留门关闭后才启动AI。

## 不变量

Person≠Talent；一个人多个职业；稳定UUID不变；多来源事实不能静默覆盖。
Role/Capability/Credential分离；Collection类型与内容tag分离；成人资格不能从照片推测。
Agent用Machine Actor；无权限/冲突写入Proposal；unknown field/code/schema必须拒绝。
不改写历史migration。维护、导出、重建、恢复不得漏新关系；不依赖UI阻断来保障安全。
恢复始终MAINTENANCE和数据执行闸门关闭，approve不自动开放INTERNAL或解隔离。
日志/审计失败必须fail closed；异常不等于事务没提交；缺证据不能人工勾选忽略。
只在隔离测试库运行测试，不执行生产迁移、生产媒体清理、正式部署或隐式后台任务。
