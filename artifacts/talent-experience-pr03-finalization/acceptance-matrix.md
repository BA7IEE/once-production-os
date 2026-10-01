# PR-03C finalization 验收映射

| 要求 | Core / PostgreSQL | 真实浏览器 |
| --- | --- | --- |
| 当前 Grant + exposure 代替 uploader | `collectionFinalizationScenario`：员工素材默认拒绝，批准后原件/集合可读可引用；换账号拒绝；模拟未来 Agent 正式来源需新批准；不改上传人；主来源撤回不误杀独立来源 | `collectionExposureJourney`：真实内部上传、异步 worker、图片和 MP4；开放前404，批准后图片与206 Range；本人保存正式内部集合引用 |
| 暴露范围及撤销 | 集合批准不等于全库批准；指定 asset 撤销后读取失败；来源撤回后旧 exposure 拒绝；审计失败回滚；原键重放 | Collection 只批准照片时隐藏视频；单独批准视频后播放；撤销后下一次Range404；跨标签切换账号拒绝 |
| 标签新来源 | Source A 撤回，ARCHIVED Tag 本次来源 B 启用后可见；历史 evidence 仍保留 | 完整三宽度标签/审核/本人画廊回归 |
| 标签父版本 | generic create/patch 推进父 revision；保存并提交的旧草稿审核409且保持SUBMITTED | 全部旧媒体/生产/本人维护流程回归 |
| 旧 current 退出 | 旧Source SUSPENDED可取消current，false evidence归本次有效来源；隐藏旧scope404 | 三宽度current/正式画廊回归 |
| 集合类型 identity | Portal draft/internal save/generic patch 409；新建PORTFOLIO成功 | 已有集合类型控件禁用；新集合类型仍可选择 |
| 生命周期 | full PG 含导出重建、合并、删除、并发/FK/唯一性、62→63已填充升级及空库安装 | 实际13文件/92602字节备份恢复；Grant/session失效且manifest清空；无敏感持久化 |

Core 使用 MemoryStore 领域验证；PG 同一共享反例使用真实 PrismaStore/事务，不能以 Core 代替 PG。Browser 为实际 Chrome + Nest + PostgreSQL + 异步 worker，360/390/430px，认证仍为受控测试发送端。模拟未来 Agent 来源不是机器摄取验收。

初次失败均保留：Core/PG各一处旧夹具把加标签后的父集合版本写死为1，现明确断言递增为2并使用当前版本；另一次PG运行因外部 fast shutdown 中断，后改用本轮独立实例完整重跑。没有跳过断言、提高超时或修改冻结迁移。

最终浏览器复跑另定位同意命令回执先到、版本刷新未完成时兄弟集合编辑区提前解锁。已修复共享命令锁直至刷新结束；用拦截并释放该GET的确定性反例验证，不增加超时、不刷新重试隐藏失败。原失败日志与截图保留。
