# v0.4 Talent Domain 2.0 规格状态｜2026-09-26

本分支 `spec/talent-domain-2` 基于 DEV-09D / PR #22 head `c0768330d21f0fddf2853e96417d101eaa2bfbe9`。本批只冻结 Talent Domain 2.0 产品/数据/开发契约，**没有修改 Prisma schema、迁移、API、页面或运行时**。

新增实现状态：

| 项目 | 状态 |
|---|---|
| Talent 2.0 规格 | SPEC_UPDATED |
| TD2-01～06 | NOT_IMPLEMENTED |
| TD2-T01～12 | NOT_RUN |
| DEV-08 人才AI | 保持未启动；TD2-06 Gate 前不得启动正式契约 |
| 既有 DEV-00～09 证据 | 不因本规格变更扩大或失效；以各自 release/PR/CI 为准 |

当前顺序冻结为：**完成 DEV-09 恢复链 → TD2-01～06 → DEV-08 AI**。详细见 `docs/spec/15_TALENT_DOMAIN_2.md` 与 `TALENT_DOMAIN_2_PLAN.md`。

---

# 当前实现状态｜DEV-07H / T29 隔离 JSON 重建完成

应用 `0.1.0-dev.1`。当前分支 `feat/json-rebuild`，PR #18，基于 `feat/person-merge` / PR #17。

| 工作包 | 当前实际实现 | 仍缺/未整体验收 |
|---|---|---|
| DEV-00 工程 | 锁文件、构建、CI、API/Worker/Web、生成契约指纹 | 正式镜像、升级策略 |
| DEV-01 身份权限 | 会话、角色、范围、敏感字段、审计；独立 data.export / data.delete / data.merge | 全站可访问性、生产启用 |
| DEV-02 命令任务 | 幂等、CAS、持久导入、媒体/导出/删除租约、merge 原子命令 | 完整崩溃矩阵、JCS 全向量 |
| DEV-03 人才来源 | 多角色、来源/核验/历史、字典、联系方式、H1、Person merge | 机构/品牌、所有权转移 |
| DEV-04 媒体 | local/test 私有静态图片；删除物理 purge | 正式 COS、PDF/视频、正式媒体备份恢复 |
| DEV-05 作品项目 | 组图/封面/署名、项目参与、参考/交付、复盘 | 主体关联、内部双语文本、正式升级 |
| DEV-06 检索清单 | 结构化检索、命中依据、Shortlist、SQL 下推 | 来源 visible IDs 完整 SQL 下推、规格 P95、AI parse_search |
| DEV-07 维护 | 07A 导出；07B～07F 删除闭环；07G Person merge；**07H / T29 隔离 JSON 重建** | 当前 DEV-07 规格主要切片已具备实现证据 |
| DEV-08 AI | 未开发，仍在一期 | 四类有界任务、预算、证据与采纳 |
| DEV-09 运维恢复 | recoveryEpoch、维护模式基础 | **数据库+私有媒体+密钥一致性备份/恢复、restore-check、升级演练** |
| DEV-10 总体验收 | 多切片 core / PG / browser；T29 10/3/1 真重建 | 性能/恢复/完整内部旅程仍未全关 |
| DEV-11 接管 | 未执行 | 不得接管正式资料 |

## DEV-07H / T29 最终证据

功能冻结 head：

`feeab369396bf85536c92e3f8812d2bd50d3be9a`

Actions：

`36220456451`

五个 job 全部 success：

- 103 条请求契约；
- 274 / 274 core / transport；
- rebuild core：11 / 11；
- 原 PostgreSQL 合同：67 / 67；
- T29 real Export → fresh PostgreSQL rebuild：1 / 1；
- T29 CLI 独立 fresh DB CHECK/APPLY 安全验收：PASS；
- browser-resume：17 / 17；
- browser-production 原生表单：6 / 6；
- browser-handoff / media / production 全绿。

真实 T29 路径不是手造 DTO 自测：

1. 在 source PostgreSQL 用正式 Application API 创建 10 Person / 3 Work / 1 Project 与关系；
2. 创建真实 INTERNAL_EXPORT UsePermission；
3. Export Worker 生成 READY `once-export-v1`；
4. 取得真实 `payloadDigest`；
5. 新建并 migrate 独立 `once_rebuild_*` PostgreSQL；
6. bootstrap 唯一 ADMIN；
7. CHECK 零写；
8. audit fault 验证 APPLY 整事务回滚；
9. CLI 以 `--expected-sha256 <payloadDigest>` APPLY；
10. 直接查询 PostgreSQL 验证稳定 UUID、关系、Source BASELINE 和不恢复 Session/Contact/Evidence/Export；
11. 第二次 APPLY 拒绝。

## T29 安全边界

- 仅接受严格 `once-export-v1`；
- APPLY 必须绑定源 READY Export 的 `payloadDigest`；
- digest mismatch 在数据库访问前拒绝；
- CLI 只接受 loopback `once_rebuild_*`；
- `DATABASE_URL` 被刻意忽略，只读 `DATABASE_URL_REBUILD`；
- 不 drop / truncate / reset / auto-migrate；
- 目标必须是 bootstrap 后的隔离安装且业务图为空；
- 允许通过正常 API 预置目标 Dictionary；
- Source/Person/Work/Project UUID 与关系保持稳定；
- workspace/scope/maintainer 重绑目标环境；
- SourceHistory 只写 actorId/decisionReason 均为 null 的 BASELINE，不伪造旧历史；
- rebuild 执行人由 `rebuild.apply` Audit 记录，resourceId 指向源 exportId；
- ACTIVE Work 因没有媒体字节拒绝；
- ACTUAL participant 因 export 缺依据 note 拒绝；
- media identity 只校验，不恢复二进制，`mediaRestored=0`；
- 正常 API 的分类、标题、每根关系/媒体上限不能通过 rebuild 绕过。

## FR/T 状态边界

- FR-03 / T03 / AT-22：受控 Person merge 已有实现和真 PG/browser 证据。
- FR-13 / T13：删除影响→阻断→保留决定→清理→专用最终化已具备实现证据。
- FR-29 / T29：**隔离 JSON 重建已完成当前规格验收**。
- FR-30 / DEV-09：**未完成**。T29 绝不等价于 PostgreSQL/私有媒体/密钥的备份恢复。

## 接下来

进入 **DEV-09 / FR-30**。下一阶段先做 backup/restore threat model 和 disposable restore drill；恢复后默认 MAINTENANCE，旧 Session 必须失效，数据库/媒体/密钥/version/删除与用途状态必须经过 restore-check 才能放行。
