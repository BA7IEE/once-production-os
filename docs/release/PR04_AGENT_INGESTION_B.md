# PR-04B：外部 Agent 真实媒体摄取

状态：**IMPLEMENTED + CORE_MEMORY_TESTED + POSTGRES_TESTED + BROWSER_TESTED；待代码级复核**。独立 stacked 分支 `codex/external-agent-media-ingestion-pr04b`，base `codex/external-agent-ingestion-pr04a`。PR #32 冻结 `67f45a57801cdef9e419803139775e15dd329839`；PR #31 冻结 `aeaf49da7d5346785adac6df4e2d34321f9d92d2`。两者 head 不修改。PR-04B 保持 Draft、未合并、未部署；不进入 PR-04C。

## 数据与权限

追加迁移 **73 / 202610020005_agent_media_ingestion** 与 **74 / 202610020006_person_media_role_merge**；迁移 1–72 字节不变。既有 UploadContext / MediaUpload / MediaAsset / PersonMedia 不另建媒体系统。MACHINE 上传严格归属真实 ServicePrincipal + 自己的 MACHINE Submission，Membership/TalentAccount 字段为空。新增不可变授权快照、稳定 clientItemKey、可选本批 ROLE candidate key；接收授权仅保存 keyed hash + 截止时间。数据库 XOR、复合 FK、唯一索引、不可变触发器和延迟采纳约束共同约束归属。

正式开放 `ingestion.media.upload`，仅 ingestion 权限族。Agent 没有内部 `assets.upload`、`records.write`、来源审核或正式事实写权限。内部负责人须同时具备现有建档及上传资格。Agent 无法引用既有 Asset、抓 URL、指定正式 Person/Role/scope、直接采纳。Client MEDIA JSON 不开放；MEDIA item 由成功 worker 根据实际上传生成。

每一阶段复查主体 ACTIVE、authorizationEpoch、当前负责人资格、intake scope revision、recoveryEpoch、Submission 归属与状态、删除保护、容量。纯 token rotate 不改变稳定上传归属；授权边界变化后不改旧快照，不允许续传/worker/审核继续。提出已有 Person 时 Upload/Asset 和 STAGED relation 仍不绑定正式 Person/Role/Source。

迁移74只把既有 PersonMedia exact Role 复合外键改为事务提交时校验，支持正式关系与职业一起合并；错误 Person＋Role 仍被数据库拒绝。迁移73已应用后保持原文件不变，1–72保持冻结。

## 协议与状态

| 接口 | 行为 |
|---|---|
| POST `/api/v1/ingestion/uploads` | 严格上传合同，原 command key 重放，原子预留额度 |
| POST `/api/v1/ingestion/uploads/{id}/receive-authorizations` | 短期一次性 SECRET；丢响应可先核对，再显式重新授权；不进入回执 |
| PUT `/api/v1/ingestion/uploads/{id}/content` | Bearer + `X-ONCE-Receive-Token`；固定长度真实字节，事务外存储 I/O，接收前后及周期资格复查 |
| POST `/api/v1/ingestion/uploads/{id}/complete` | 入异步处理队列，202 最小回执 |
| POST `/api/v1/ingestion/uploads/{id}/cancel` | 结束未完成上传；不等于释放物理额度 |
| GET `/api/v1/ingestion/uploads/{id}/status` | 仅自己的当前上传概要，无凭证/对象路径 |
| GET `/api/v1/ingestion/submissions/{id}/assets/{asset}/preview` | 自己的有效 STAGED 图片/视频海报，拒绝 PDF |
| GET 同路径 `/playback` | 已冻结 MP4 stream/Range、首字节前与周期鉴权、最大窗口 |
| GET 同路径 `/attachment` | 私有 PDF 附件下载，不 OCR/解析/冒充图片 |

技术 READY + 业务 STAGED，不进入普通 Asset、目录、TD2、Work/Collection、候选或业务 JSON。审核者须具 intake scope + review/assets.read；TalentAccount 不自动获得机器候选媒体读取权。

接受 MEDIA 与本批文字/职业事实同事务：复查冻结基线与双方 scope → Source/Attribution/INTERNAL_REVIEW basis → 同一 PersonMedia ADOPTED + exact Person/可选 exact Role + 正式 Source → Item/Submission → Receipt/Audit。ID/hash/uploader/source bytes 不改。失败全部回滚。正式读取切换为当前 Person/Role/Source/basis/删除保护；不继承历史 intake scope。Agent revoke 不撤回独立正式 basis，正式 Source 撤回立即使正式素材不可读。

## 配置、保留和生命周期

`AGENT_MEDIA_ENABLED=false` 默认关闭。七个 MACHINE quota 全部显式配置：workspace/principal active、小时次数、本批数量/字节、principal/workspace retained bytes。配置缺失或越界拒绝，不借 Talent/ENROLL 额度；准入与回执同事务。通用存储上限作为额外安全上界。

复用 PR-03E：草稿90/提交180/拒绝和未采纳30/撤回7天默认，只允许收紧。上传取当前草稿截止和配置截止的较早值，不恢复90天。ADOPTED 无草稿TTL；UNKNOWN 不释放容量；仅真实物理确认后释放，TTL 与显式删除仍共享一个物理删除权。清理接收授权；恢复隔离使旧主体/上传无效，保留来源历史和正式关系。业务导出只带正式采用媒体和不可冒充的 MACHINE provenance snapshot，不重建 ServicePrincipal/Submission/Grant。

## 实测证据与边界

新 Core 专项覆盖归属、原键重放、token rotate、授权/负责人/范围/恢复 fencing、一次性接收、额度、审核故障回滚、正式授权转换、retention/purge。真实 PG16 专项验证 FK/XOR/唯一/不可变约束、并发预算、worker lease、保留72升级74、pg_dump/restore。新真实 Nest/Bearer + 独立异步 worker + Chrome390px 旅程支持 JPEG/PNG/WebP/PDF/H264，反例拒绝错误hash、mime及非H264；正式范围与intake-only图片/Range权限分别验证。本地完整 Core **711/711**（新增22项），PG16 **99个程序/189项/0失败**（全量98个程序及独立删除专项1个程序），真实JSON重建CLI通过；原13组与新机器媒体共 **14组Browser通过**。空库1→74、保留72→74、实际pg_dump/restore均通过。类型、284条契约、静态12项、surface policy4项、构建通过。汇总见 `artifacts/agent-media-pr04b/verification.json`。最终提交及15项 exact-head CI结果绑定Draft PR #33描述和交付回复；不引用旧head结果。

首次失败不删：初次 PG16 Docker 工具路径与浏览器环境（数据库暂不可达、`/tmp`符号链接、Playwright未安装）保留；mime反例首次把 worker 校验误写为接收阶段，改为真实异步拒绝，未减弱断言。首次并发额度反例在同一草稿上先命中 revision CAS（409），现用两个独立草稿竞争同一主体额度，验证预算本身（201/429）。新增实际审核发现reportedAt单独读取系统时间会晚于updatedAt，导致PG measurement_reported_time约束拒绝；现统一使用该量尺记录createdAt作报告元数据时间，未知测量日期不变。原失败保留，未绕过约束。最终采用独立原生PG16和安装的真实Chrome，不改既有PG14库或服务。精确职业媒体合并在真实PG另发现旧复合FK中途拒绝，追加74修复事务顺序并证明提交时坏关系仍拒绝。Work浏览器首次连接重置，独立新库完整复跑通过；首次错误含测试Cookie的诊断已脱敏，不公开原文。首次记录见 `artifacts/agent-media-pr04b/first-failures.json`。

`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`、`PRODUCTION_MIGRATION_VERIFIED=NOT_RUN`、`DEPLOYED=false`。Local Provider 验证不代表 COS/生产验证。PR-04B 未冻结，等待本轮代码复核。

## 27项验收对应

| 请求反例 | 当前证据 |
|---|---|
| 1–2 新投稿/既有人物提议未绑定即可上传 | Core/PG ownership 与 Browser真实图片/MP4；审核前全部 personId=null |
| 3–6 禁止既有Asset/URL、跨主体、无intake及普通业务读取 | strict unknown-fields reject、STAGED owner/intake权限、正式导出拒绝STAGED；共用正式过滤器 |
| 7–8 rotate续传与授权变化fencing | Core/PG rotate＋permission/scope/scopeRevision/maintainer/revoke/disable/recovery worker heartbeat/finish反例 |
| 9–10 已提交禁加文件、原键幂等不重复额度 | Core/PG submit冻结；原key同Upload/同quota；真实Browser每次创建原key重放 |
| 11–14 hash/bytes/mime/非H264 | Nest真实PUT及独立worker；每项拒绝后无Asset |
| 15–16 Range与首字节前撤权 | 真实MP4精确字节206、越界416、200；撤SP后preview/Range拒绝且返回JSON |
| 17–19 暂存不可正式读、同ID采纳、审计/回执原子故障 | Core/PG全事务快照回滚；Browser审核后sameID/hash/origin |
| 20–24 部分/拒绝/撤回、UNKNOWN额度、正式依赖 | Core/PG decided30/withdraw7、并发purge单lease、UNKNOWN保留、确认只释放一次、ADOPTED200天无TTL |
| 25–26 SP撤销与Source撤回 | Core/PG/Browser formal-only图片与MP4Range前者继续读、后者立即拒绝 |
| 27 secret guard | 统一结构化helper检查真实Bearer、全部客户端receive nonce及数据库仍存在的内部receive token；正文/Authorization/signed URL规则保留，错误仅类型/路径 |

其他生命周期：实际业务JSON导出及真实hash验证重建，不创建假ServicePrincipal/Submission/Grant；真实PG16 `pg_dump/restore` 保留STAGED/ADOPTED并开启恢复隔离，旧主体/草稿不复活；真实Person合并仅转正式关系，STAGED不转档；真实删除阻断同时拒绝MACHINE暂存与正式读取，物理容量不提前释放。Core/PG的worker生命周期输入是合成结果，用于约束/事务反例；真实字节、解码、异步进程和Chrome播放由Browser旅程验证，不能混称。
