# PR-03D finalization 验收

基线 280568c；保持 Draft、未合并、未部署，等待代码级复核。迁移1–66不变，不新增67。当前数据和日志以 `artifacts/talent-experience-pr03-work-finalization/verification.json` 为准；旧 PR03D_ACCEPTANCE 为主体阶段记录。

| 反例 | 测试入口与关键断言 |
|---|---|
| LINK 新 Credit 携带全新 B | Core/PG shared：目标已有 A，没有 B；B 同批单独采纳后 ADOPTED，目标 Work 整行及 WorkAssets 完全相同 |
| LINK 接手已有 exact Credit | Core/PG takeover：员工先创建并显式升级；LINK 保留 Credit ID/Source/Note/revision，无重复，Work/媒体不变，只新增本次 Grant exposure |
| legacy 明确升级 | Core/PG legacy：审核409 WORK_CREDIT_UPGRADE_REQUIRED，无半采纳；内部升级命令保留ID/Note，再审核成功；错误角色拒绝 |
| 升级不是自动本人开放 | 内部升级真实页面显式选职业、来源并确认；命令本身不生成Grant exposure |
| 旧媒体同意不能授权 Work | Core/PG：保存409 WORK_CONSENT_REQUIRED；有旧稿但当前只有media scope时提交仍409 |
| 撤回后不能审核 | Core/PG：SUBMITTED后撤回Work同意，审核409，没有新增Work或正式关系 |
| 撤回后本人投影立即失效 | Core/PG：已获准exact Credit的 exposure 绑定本次Consent；撤回后本人Work列表不含该案例，原独立内部Work/Credit原样保留 |
| 回执与审计原子性 | Core/PG：升级和审核分别注入审计失败，Credit/媒体/关系回滚；相同principal/key/digest重试成功、再次精确重放 |
| 新同意真实文案 | 360/390/430：案例按钮初始禁用，单独阅读并确认媒体+结构化案例事实用途；数据库新fieldScope含work，旧媒体Consent行不被追补work |
| 导出重建 | Core/PG export：Work依据talent-basis-v2携work scope；源ID/媒体关系保留，不恢复外部账号/Grant/Submission；旧v1不能借新字段取得Work能力 |

专项共用 `tests/support/work-case-finalization.ts` 与 `work-cases.ts`，同时运行 MemoryStore 和真实 PostgreSQL。后台升级页面复用现有不确定结果原键重放机制，不另建简化写入路径。普通媒体、Collection、生日/来源权限和既有生产流程均跑完整回归。

真实通知Provider、COS、物理手机、生产升级/部署均NOT_RUN。浏览器使用真实Chrome和三种viewport，媒体仍是真实异步worker与PostgreSQL。停止在PR-03D，不进入回收调度或后续业务。
