# PR-03D 作品案例验收映射

状态：IMPLEMENTED + CORE_MEMORY_TESTED + DB_TESTED + BROWSER_TESTED，等待代码级复核。PR #31 保持 Draft、未合并、未部署。A/B/C 用户冻结；D 尚未冻结。

本轮基线 `7909fa204de15224ae7f1f7bb43b88a285d37dc9`；迁移 1–63 逐文件校验不变。新增 64/65/66 的原因见 [交付说明](TALENT_EXPERIENCE_PR03.md)。64、65 已在保留的合成库应用，后续发现的数据库约束问题通过下一次迁移修正，没有改写已应用迁移。

## 实测入口

- Core：`pnpm verify`，641/641；259 条路由合同、类型检查、12 项静态检查、构建通过。另补跑 Work 8 场景。
- PostgreSQL：完整脚本 57 个 TAP 程序、147 项测试通过；最后补跑 Work 8 个独立库场景，以及 Portfolio 移除/普通 Credit 合并反例。Work 脚本采用进程断言，不虚算入 TAP 项目数。真实 FK、唯一约束、并发双写、事务失败、导出工作器及独立目标重建均运行。
- Browser：原 10 组 + 新增 Work 组，11 组真实 Chrome 全通过。Work 组再跑真实 API 的 PDF/MP4 封面/未知字段反例。360/390/430 均服务器保存、刷新、提交、内部审核和本人查看；390 含 H.264 解码播放，授权和 Range 复用同一正式媒体路径。
- 恢复：真实 pg_dump/restore，13 个私有文件、92602 字节恢复且 hash 核对；Work/Credit/Asset/Source/封面保留，旧 session/Grant/exposure 不复活。
- 本地 PostgreSQL 14.19；CI 使用 PostgreSQL 16。最终 head 的 CI 另以 PR 描述和交付回复链接为准，不能用本地通过替代。

原始日志、页面截图、失败修复记录及迁移指纹：[verification.json](../../artifacts/talent-experience-pr03-work-cases/verification.json)。历史验收目录保留原样，本轮结果独立存放。

## 40 项场景映射

Core/PG 共用 `tests/support/work-cases.ts`，分为 base、lifecycle、enroll、export、PERSON、WORK、MERGE、shared。PG 附加真实数据库约束与并发；浏览器在 Nest + Prisma + PostgreSQL + 异步媒体 worker 上运行。表中“阻断”表示实际删除保护阶段，物理原件删除不属于 Work 关系删除。

| # | 场景 | 本轮证据 |
|---|---|---|
| 1 | 绑定人才新建 EXTERNAL | base；三宽度 Browser |
| 2 | ENROLL 草稿无提前人物/案例 | enroll |
| 3 | ENROLL 原子建立角色和案例 | enroll；审计故障回滚 |
| 4 | 精确 PersonRole Credit | base + PG 复合 FK |
| 5 | 不得给他人署名 | base 外来 Role、未知 personId 拒绝；Browser 400 |
| 6 | 不读其他参与者 | shared 安全 projection |
| 7 | Portfolio 和 Work 共用 Asset | lifecycle；Browser 同批集合/案例原件 |
| 8 | STAGED 随 Work 采纳 | base；真实异步 worker Browser |
| 9 | 已 exposure 正式素材复用 | lifecycle |
| 10 | 未 exposure 拒绝 | lifecycle 移除 media exposure 后 404 |
| 11 | 图片和视频 | 三宽度 Browser；390 MP4 |
| 12 | H.264 播放与 Range | Work 视频真实解码；同组正式 MP4 Range 权限反例 |
| 13 | 封面必须本 Work 图片 | base 外来 cover 拒绝；PG FK；Browser MP4 422 |
| 14 | PDF 明确拒绝 | Browser 真实 API 422；不 OCR |
| 15 | Work 移除不删原件 | lifecycle；原件 ADOPTED，另一 Work 保留 |
| 16 | Portfolio 移除不影响 Work | lifecycle 真实 Collection command 后两条 WorkAsset 保留 |
| 17 | Work Source 失效隐藏案例 | lifecycle 来源失效，仅独立 Work 留存 |
| 18 | Asset Source 失效只隐藏媒体 | lifecycle 独立 Work 留存、items/cover 清空 |
| 19 | Credit Source 失效不删 Work | lifecycle |
| 20 | LINK 不覆盖共享事实 | shared 整行 Work 不变且保留另一参与者 |
| 21 | 同标题不自动合并 | lifecycle 两个不同 Work |
| 22 | 重复 Credit 拒绝 | PG 顺序重复及两次并发写仅一成功 |
| 23 | Role 不匹配拒绝 | base；PG FK |
| 24 | 停用 Role 保留历史 | lifecycle Credit 行保留、当前 projection 隐藏 |
| 25 | 普通 Credit 合并 | MERGE 普通署名映射主档、Work 保留 |
| 26 | 精确 Role 合并冲突 | MERGE preview blocker，不静默重映射 |
| 27 | Person 删除不误删 Work | PERSON 阻断本人读取并保留独立 Work/Asset；既有删除回归 |
| 28 | Work 删除不删共享原件 | WORK 阻断案例后本人原件仍可授权读取；既有删除回归 |
| 29 | 审核失败原子回滚 | base、enroll 故障注入 |
| 30 | 原键精确重放 | base |
| 31 | 新键终态拒绝 | base 409 |
| 32 | 账号切换旧 Tab 拒绝 | base B 读 A 404；Browser 双标签会话/写请求账号对照 |
| 33 | 仅正式数据 JSON | export 工作器执行、媒体原件依赖核对 |
| 34 | 不重建外部授权 | export 目标账号/Grant/Submission 均零 |
| 35 | 物理恢复保留关系 | Browser restore.json，恢复隔离拒绝旧授权 |
| 36 | 三宽度完整旅程 | work-draft/approved-360/390/430.png |
| 37 | 后台视觉案例卡 | work-primary-detail-360/390/430.png |
| 38 | Portfolio 不要求 Work | 同组无 Work 的 Portfolio 图片/视频路径 |
| 39 | 多 Work 共用 Asset | lifecycle 两个 Work、一个 Asset |
| 40 | 不产生 Project/CRM | base、Browser Project 数量为零；无新增 CRM/报价合同 |

## 验收边界

真实通知 Provider、COS、物理手机与生产升级/部署均 NOT_RUN。Chrome 三种 viewport 不冒充物理手机。使用受控本地认证 provider，`PROVIDER_VERIFIED=NOT_RUN` 不变。未实施 PR-03E 自动回收、Agent 摄取、报价/排期、客户分享、官网、CRM；停止在本轮，等待复核。
