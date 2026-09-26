# 当前实现状态｜DEV-09D Write-ahead / DB+Media 恢复闭环

应用 `0.1.0-dev.1`。当前分支 `feat/recovery-writeahead-media`，PR #22，基于 DEV-09C / PR #21。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web、生成契约指纹 | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 data.export / data.delete / data.merge | 全站可访问性、正式生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体/导出/删除租约、merge 原子命令 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1、Person merge | 机构/品牌、所有权转移 |
| DEV-04 媒体 | local/test 私有图片、删除物理 purge、**backup manifest v2 私有媒体备份/恢复** | 正式 COS、PDF/视频提供方 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、SQL 下推 | visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | 导出、删除闭环、Person merge、T29 隔离 JSON 重建 | 当前主要规格切片已具备实现证据 |
| DEV-08 AI | 未开发 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | **09A 隔离准备、09B restore-check、09C zero-delta approve、09D write-ahead + DB/media 同包恢复** | **09E post-backup delta resolution、正式运维长期保留策略** |
| DEV-10 总体验收 | core / PG / Chromium 多链回归；真实 rebuild/restore drill | 完整性能/生产介质/最终接管门 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-09D 最终证据

功能冻结 head：

`9cc30cf71dc4e6fc97bd81f2308dd884a267c230`

Actions：

`36249594313`

五个 job 全部 success：

- 请求契约：103；
- core / transport：295 / 295；
- recovery：11 / 11；
- safety-intent：4 / 4；
- safety-journal：4 / 4；
- 原 PostgreSQL 合同：67 / 67；
- T29 rebuild fresh PostgreSQL：PASS；
- DEV-09A/B restore fresh PostgreSQL：PASS；
- DEV-09D pg_dump/pg_restore + private media：PASS；
- browser-resume / handoff / media / production：全部 success。

CI 明确输出：

`PASS DEV-09D pg_dump/pg_restore+media: DB and private media restore together; zero journal delta approves; post-backup safety delta blocks`

## DEV-09 当前已完成的安全链

1. 恢复目标默认 MAINTENANCE；
2. 旧 Session / Activation / Handoff / UsePermission / Export / runnable task 在 prepare 阶段保守失效；
3. Source 进入 SUSPENDED，Asset 进入 QUARANTINED；
4. Contact key 必须实际解密现有 ciphertext；
5. migration / DB state / private media original+preview 必须 restore-check；
6. backup manifest 绑定 dump、key、epoch、migration、Safety Journal 和 private media；
7. 所有 authenticated COMMAND / SECRET 写请求在 DB 事务前 write-ahead；
8. journal 写失败则 fail closed；
9. deletion cleanup / finalization worker 同样 write-ahead；
10. staging/production INTERNAL 没有绝对 SAFETY_JOURNAL_FILE 时拒绝启动；
11. 零 post-backup delta 时可 approve 新 recovery epoch；
12. approve 仍不会自动将部署 ACCESS_MODE 切回 INTERNAL。

## FR/T 状态边界

- FR-03 / T03 / AT-22：受控 Person merge 已完成当前切片。
- FR-13 / T13：删除闭环已完成当前切片。
- FR-29 / T29：隔离 JSON 重建已完成当前规格验收。
- FR-30 / DEV-09：**尚未整体完成**。当前只能对 post-backup delta 做保守阻断，尚未逐条形成 commit/rollback 与 resolution 证据。

## 接下来

进入 **DEV-09E Safety Delta Resolution**：

- intent 与最终 committed / failed 状态形成显式外部证据；
- 自动识别被 recovery prepare 更强地覆盖的安全变化；
- 其余 delta 必须生成可审计 resolution plan；
- 不允许“管理员勾选忽略”；
- 只有所有 post-backup delta 都可证明已解决，才允许非零增量 approval。

详见 [WP9_RECOVERY_WRITEAHEAD_MEDIA.md](WP9_RECOVERY_WRITEAHEAD_MEDIA.md)。
