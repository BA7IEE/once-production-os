职业不明候选碰撞已支持人工选择保留项；两边复核记录的 UUID、原因和状态保留，原候选编号只追加，合并不会代替人工职业核实。412/412 CORE_MEMORY_TESTED，类型、契约、静态检查及完整构建 PASS；真实 PostgreSQL 双向选择、审计回滚/同键重试、SQL 历史保护和完整数据库链 DB_TESTED；真实 Chromium 合并与既有迁移流程 BROWSER_TESTED。40 次前向迁移在新空库通过，两个既有合成库各59表原内容摘要未变，其中一库显式含升级前复核记录；真实备份恢复保留新候选历史。证据：`artifacts/td2-candidate-review-20260928/`。完整人才2.0仍未完成；工作台、复杂来源/媒体清理继续开发，未部署。

详见 [候选复核合并](TD2_CANDIDATE_REVIEW_MERGE.md)。

411/411 CORE_MEMORY_TESTED；服务、React、core、transport 类型、契约、静态检查与构建 PASS。完整 PostgreSQL 链（原合同67/67、新增合并历史双库CLI、审计回滚/重试、SQL 历史保护、含原合并归属的真实数据库与私有媒体恢复）DB_TESTED；真实 Chromium v11 授权与历史/原件组合下载、撤权拦截 BROWSER_TESTED。新空库39迁移通过；两个保留合成库各59表摘要不变，其中一库保有3次真实合并。 证据：`artifacts/td2-merge-history-transfer-20260928/`；当前 head 云端结果另行核对。

当前接续：[合并保留历史迁移](TD2_MERGE_HISTORY_TRANSFER.md)增加 v11；旧身份、原合并决定及操作者、保留主档案与量尺关系一起迁移，目标不伪造新合并。人才 2.0 整体仍未完成。

前批：[身份字段来源证据迁移](TD2_IDENTITY_EVIDENCE_TRANSFER.md)增加 v10；普通联系人无需人才档案即可按独立许可迁移所选身份字段的来源和原核验记录。整体人才 2.0 仍未完成。

408/408 CORE_MEMORY_TESTED（新增6项）；服务、React、core、transport 类型检查、契约与构建 PASS。完整 PostgreSQL 链（原合同67/67）、独立双库身份字段真实CLI CHECK/APPLY、审计回滚/重试和重新导出比对 DB_TESTED。真实 Chromium v10 身份与专业/证明原件组合、原核验归属及证据许可撤销 BROWSER_TESTED。新空库38迁移通过，既有合成库59表摘要不变。 证据见 `artifacts/td2-identity-evidence-20260928/`。

前批：[成年资格与原核验归属迁移](TD2_ADULT_TRANSFER.md)增加 v9；独立许可、原证明和核验证据一起保留，目标不伪造核验人或延长有效期。完整人才 2.0 仍未完成。本批 402/402 核心回归、完整 PostgreSQL/恢复、真实 Chromium 通过；整体 TD2-06、正式迁移与部署仍未完成。

前批：[媒体集合与内容标签迁移](TD2_COLLECTION_TRANSFER.md)增加 v8 白名单；图片顺序、说明、推荐标记及归档状态保留，共享文件只迁移一份。完整人才 2.0 仍待继续验收。

前批：[资质证明原件迁移](TD2_PROOF_MEDIA_TRANSFER.md)已接入独立图片/来源许可、真实文件下载和隔离重建；已核验状态与附件关系保留。完整人才 2.0 尚未完成，证据见该页与当前 head CI。

前批：[无附件资质与加密编号迁移](TD2_CREDENTIAL_TRANSFER.md)。编号需独立许可和原/目标密钥，目标重新加密；不丢弃附件换取通过。完整TD2-06仍未完成。

前批：[字段来源证据迁移](TD2_FIELD_EVIDENCE_TRANSFER.md)新增独立许可和v5；不复制原账号、不伪造目标核验。完整TD2-06仍未完成。

# 当前实现状态｜Talent Domain 2.0 业务衔接

应用 `0.1.0-dev.1`。当前分支 `feat/talent-domain-2`，PR #26，基于 PR #25。

2026-09-27 当前增量：[合并时按职业保留候选](TD2_ROLE_CANDIDATE_MERGE.md)。前批：[代表关系迁移](TD2_REPRESENTATION_TRANSFER.md)，保留[外部标识 v3](TD2_EXTERNAL_TRANSFER.md)、[能力 v2](TD2_CAPABILITY_TRANSFER.md)及[旧八类 v1](TD2_TYPED_TRANSFER.md)兼容；其余专业关系仍未完成。前批：专业主档案只读历史保留，职业/语言/常驻地/成人资格逐项冲突决定，以及授权历史查看，详见 [TD2_CONFLICT_MERGE.md](TD2_CONFLICT_MERGE.md)。历史删除、职业不明且关联复核的候选真实碰撞仍阻断；TD2-06 未完成。

当前2.0实现、测试与未完成边界见 [TD2_MAINTENANCE_STATUS.md](TD2_MAINTENANCE_STATUS.md)。以下DEV-09说明是历史切片，不代表当前人才2.0总体通过。

本批实现与限制详见 [WP10_RECOVERY_DELTA_RESOLUTION.md](WP10_RECOVERY_DELTA_RESOLUTION.md)。隔离本地核心回归 321/321；完整 CI 须查验最终 head，不依据本文件推定通过；main 尚未包含整条开发链。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web、生成契约指纹 | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 data.export / data.delete / data.merge | 全站可访问性、正式生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体/导出/删除租约、merge 原子命令 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1、Person merge | 机构/品牌、所有权转移 |
| DEV-04 媒体 | local/test 私有图片、删除物理 purge、**backup manifest v2 私有媒体备份/恢复** | 正式 COS、PDF/视频提供方 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、SQL 下推 | visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | 导出、删除闭环、Person merge、T29 隔离 JSON 重建 | TD2 冲突合并、专业资料导出/重建及复杂来源/媒体清理尚未完成 |
| DEV-08 AI | 未开发 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | **09A～09D + 09E 逐条 delta resolution、精确请求关联与审批 digest** | **最终 head CI、正式运维长期保留策略、恢复并发/故障 Gate** |
| DEV-10 总体验收 | core / PG / Chromium 多链回归；真实 rebuild/restore drill | 完整性能/生产介质/最终接管门 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-09D 历史证据（不替代 DEV-09E 当前 head 验收）

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
11. 零 delta 或全部由严格规则解决的非零 delta 可 approve 新 recovery epoch；
12. approve 仍不会自动将部署 ACCESS_MODE 切回 INTERNAL。

## FR/T 状态边界

- FR-03 / T03 / AT-22：受控 Person merge 已完成当前切片。
- FR-13 / T13：删除闭环已完成当前切片。
- FR-29 / T29：隔离 JSON 重建已完成当前规格验收。
- FR-30 / DEV-09：**尚未整体完成**。09E 已实现逐条归并与证据绑定，但正式运维、长期保留策略、恢复故障审查与最终 CI 尚须关闭。

## 接下来

先完成 DEV-09 整体 Gate 和开发分支整合，再合入已冻结的 Talent Domain 2.0 R1（PR #24）。

顺序：DEV-09 → TD2-01～06 → TD2-T01～18 → DEV-08 AI。人才 2.0 已有实现但 TD2-06 整体 Gate 未关闭，AI 未启动。

云端运行 36337909271 暴露组合用例按数组首项断言的问题：资质按随机 UUID 排序，首项可能是已撤销记录。已改为按本用例创建并核验的资质 UUID 定位，仍要求 VERIFIED，未跳过或放宽状态断言。专项6/6重新通过，新的最终 head CI另行核对。
