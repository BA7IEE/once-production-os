# PR-03：模卡、照片、视频、作品案例和本人多来源媒体维护

## 当前修正：ADOPTED 正式媒体授权

本轮只修复正式媒体依赖历史 intake scope 的问题。PR #31 **继续 Draft、未合并、未部署**，不进入 MediaCollection。修正基线为 `87ec47160a90680b97269f251a5f16668d34abf4`；**没有 schema、迁移、HTTP 请求或 DTO 变化，迁移1–62逐字节不改**。

- `formalRelationReadable` 是事务内共用判断：ADOPTED 的 PersonMedia 必须属于当前工作空间，正式 Person 可见且未删除/合并，指定 Role 属于该 Person、当前有效且来源可用，正式 Source 有当前用途依据与范围权限，Asset/关系未退休或删除。技术 READY 仍由预览、播放、图和导出消费者检查。
- 接线 `assetFor/listAssets/preview/playback`、TD2 `assetReadable`、作品/候选依赖、导出准备/执行/下载和合并预览。正式关系的 Person/Source 优先于不可变上传来源；原 Upload/Claim intake scope 既不额外限制 ADOPTED，也不能授予正式读取权限。
- STAGED 保留原 Submission/Upload intake scope、当前账号/Grant/Claim/Submission、人物保护和审核权限。旧 INTERNAL_SOURCE 没有显式正式关系时，保留原资产范围、来源和主来源一致性规则。
- 合并仍把全部申请历史纳入预览摘要并撤销外部授权；已终结邀请/Claim/Submission 的历史范围不再阻断正式媒体。当前申请、打开的 Submission、ACTIVE 邀请，以及任一合并根的 STAGED 文件仍检查接收范围。精确 Role 媒体迁移仍明确阻断，不自动换职业。

### 本轮反例与证据

Core/真实 PostgreSQL 共用三组：已绑定、未绑定 ENROLL、精确 Role。A 仅具 intake，B 仅具正式 Person/Source 范围；均为 ADMIN 以证明角色没有范围豁免。B 在 STAGED 阶段不可读，ADOPTED 后可读、导出、预览合并；A 不能仅凭历史 intake 读正式媒体。正式 Person/Source 收紧、Role 停用后同步拒绝直接读、列表、预览和 TD2 图。

真实 Chrome 360/390/430 使用独立内部会话与 Talent 会话，上传图片及 H.264 MP4，经真实异步 worker 生成 READY/STAGED 后审核。额外 ENROLL 同批两文件验证 A 可在专用审核路径看 STAGED 图片与 MP4 Range，正式采纳并配置 Person/Source 范围后，B 正常读取而 A 被拒绝；Range 核对206、Content-Range及原始字节。下一次请求重新检查正式 Source 范围。实际 pg_dump/restore 和私有文件恢复继续验证授权不复活。

本地完整 Core **625/625**、PG **43个TAP程序/133项**、最终新增共享场景 **3/3**、全部 **9组Chrome流程** 通过；typecheck/core/transport、248路由合同、静态检查及构建通过。实际备份恢复 **6个文件、46744字节**。最终结果、命令与统计见 `artifacts/talent-experience-pr03-formal-auth/verification.json`；截图、PG/Core/browser日志在同目录。最终 head 对应 CI run 回填 PR #31 描述，不引用旧 head 的通过记录。下文622项等数字是已复核底座历史证据，不能代替本轮结果。

首次CI `36831884657`（`6b60681`）的媒体、PG及其余浏览器通过，但生产流程末段AI用例的受控发送次数为0：同库真实worker仍在轮询AI任务，与受控SDK worker竞争。验收脚本现于真实媒体/导出/删除检查全部结束后等待后台worker退出，再运行受控AI用例；不修改业务AI、不取消断言、不增加重试或超时。单独保留首次失败证据，并以新head的完整CI作为最终结果。

**Provider 未验证**：`PROVIDER_VERIFIED=NOT_RUN`、`COS_PROVIDER_VERIFIED=NOT_RUN`、`MOBILE_DEVICE_VERIFIED=NOT_RUN`。MediaCollection/模卡/素颜照/Portfolio/介绍视频、完整暂存回收调度仍未开始，等待此修正复核。

## 已复核底座：媒体归属与暂存（87ec471）

PR #31 保持 **Draft、未合并、未部署**。本轮接续已复核视频切片 `2fb01a713b62fce9513bd15d5ed289e80adb4453`，实现 spec/15 §10.2–10.8 的媒体归属与暂存底座；PR-03整体尚未完成。PR-02已合并、开发冻结、未部署，真实认证 `PROVIDER_VERIFIED=NOT_RUN`。

### 数据与授权

- 新增 **迁移62 `202610010007_media_ownership`**；1–61不改。MediaUpload 的真实主体为 Membership 或 TalentAccount，数据库FK/XOR/CHECK验证归属。UploadContext区分INTERNAL_SOURCE/TALENT_SUBMISSION；AGENT_SUBMISSION只有保留类型及ServicePrincipal FK字段，数据库拒绝该分支，不存在机器摄取入口。
- PersonMedia记录personId、可选personRoleId、assetId、正式sourceId或submissionId、用途、usageState、revision/protectionEpoch、保留/退休/物理清理时间。本人新上传保留null原始sourceId，绝不创建假Source/Membership。
- 技术READY与业务STAGED正交。普通资产/TD2/目录/作品/候选/导出拒绝STAGED；本人和具备申请接收范围、档案范围及审核权限的员工使用专用路径。审核批准同事务创建Source、SourceAttribution/SourceUseBasis和ADOPTED关系，原Asset ID/hash/uploader不变。
- 内部ADOPTED读取通过正式Person/Role/Source关系授权；旧INTERNAL_SOURCE仍要求原主来源一致。普通Asset DTO的sourceId/personId指正式关系，originSourceId明确原始来源，保留旧内部DTO值，导出许可选择器可继续使用正式sourceId。
- 创建、接收、complete、worker claim/lease/heartbeat/finish逐阶段检查账号/Grant/Claim/Submission、DRAFT、媒体同意、recoveryEpoch、scope、删除保护与容量。账号切换后URL中的accountId和实际Talent Cookie不符即拒绝。

### 请求及页面边界

- `POST /portal/submissions/{id}/media-consent`：独立版本 `internal-directory-media-2026-10-v1`，不复用只包含文字的旧同意记录。
- `POST /portal/uploads`：`context={kind:TALENT_SUBMISSION,submissionId,personRoleId?}`、expectedSubmissionRevision、新文件元数据；account、Person、Grant、scope由服务端推导。旧内部`POST /uploads`兼容原合同及显式INTERNAL_SOURCE。unknown-fields reject不变；ENROLL不能传既有assetId。
- `GET /portal/uploads/{id}`、`PUT .../content`、`POST .../complete|cancel`、`POST /portal/assets/{id}/retire`。DRAFT可增删，SUBMITTED不得追加；单批最多100文件，处理全部结束后才可提交。
- 本人 `GET /portal/accounts/{accountId}/assets/{id}/preview|playback`；审核 `GET /talent-staged-assets/{id}/preview|playback`。复用既有私有provider和Range/stream，不生成公开URL、不扩大播放器。
- 仅在既有服务器草稿和审核页面嵌入最小上传/查看/采纳操作，用于验证链路；没有新媒体集合、作品或延期模块菜单。弱网传输结果未知先查询原uploadId，complete可继续原文件。

### 生命周期

| 路径 | 当前行为 |
|---|---|
| 保留状态 | DRAFT90天、SUBMITTED180天、拒绝/部分未采纳30天、撤回7天；ADOPTED无草稿TTL；有效保存同步关系到期时间 |
| 主动退休 | DRAFT素材变RETIRED，立即拒绝读；技术READY不伪改FAILED；真实物理清理前不释放容量 |
| 删除 | Person删除阻断本人暂存原件；正式Source/Person关系进入删除依赖；物理清理确认后才写ERASED/purgedAt |
| 合并 | 只移动已ADOPTED正式关系，保留上传原归属；STAGED不转给主档，旧Grant撤销；精确Role被上传引用时预览明确阻断职业迁移，不能静默丢弃Role |
| 业务JSON | STAGED不导出；ADOPTED带正式来源/关系和必要历史归因，重建不产生TalentAccount/Claim/Grant/Session |
| 备份恢复 | 实际pg_dump/restore及私有原件/预览恢复保留usageState/hash/uploader；恢复prepare隔离技术读取、撤销会话/Grant，旧授权不复活 |
| 完整性 | 新关系进入PrismaStore/MemoryStore、完整性检查及恢复摘要；无半采纳提交；旧上传/资产源字段不可变 |

容量配置集中校验、仅允许收紧：本人2GB、ENROLL200MB，保持既有workspace2GB、活动1GB、并发3/20、每小时100。配置名与细节见 `.env.example` 和 spec/16 本轮合同；不代表扩大旧部署容量。

### 验证与证据

本轮证据目录：`artifacts/talent-experience-pr03-staging/`。Core覆盖15个新增媒体归属场景；真实PostgreSQL验证FK/XOR、并发、同事务采纳回滚、导出重建和迁移61→62；真实Chrome360/390/430通过本人图片/H.264上传→异步worker READY/STAGED→本人查看→审核ADOPTED，包含未绑定ENROLL。实际恢复5个文件、32174字节，原件与预览hash一致，恢复隔离拒绝旧Portal和暂存访问。

本地完整Core **622/622**、PG **40个TAP程序/130项全部通过**（另含最终职业归属/重建专项及实际恢复）、**9组Chrome流程**、原生媒体 **17/17**、surface策略 **20/20**；248路由合同、typecheck/transport、静态12项及构建通过。实际统计、命令和最终head绑定CI在本目录verification.json及当前PR描述记录；下方视频切片历史结果不作为本轮结果。真实PG14本地和GitHub PG16分开记录，合成认证网关/COS协议不替代真实供应商。

### 尚未完成，等待本切片复核后推进

1. MediaCollection、模卡/素颜/作品集/介绍视频的上传、排序、封面与作品案例表单。
2. 完整暂存自动回收计划、到期提醒和物理清理调度；本轮只建立保留/退休/占用状态，不借既有FAILED清理器删除READY文件。
3. 跨Submission复用媒体的显式引用；当前fork仅复制文字，新批需重新上传。精确Role媒体依赖的进一步人工合并处理仍受预览阻断。
4. 真实邮件/短信 `PROVIDER_VERIFIED=NOT_RUN`、实际COS `COS_PROVIDER_VERIFIED=NOT_RUN`、真实iOS/Android/微信 `MOBILE_DEVICE_VERIFIED=NOT_RUN`。

不进入客户分享、官网或PR-04 Agent摄取业务。完成本轮后继续Draft，等待复核。

## 历史切片：内部受控视频播放（2fb01a7）

- 新增 `GET /api/v1/assets/{id}/playback`，BINARY、`assets.read`。沿用当前内部会话、原生scope、人物、来源、删除保护、恢复隔离和READY判定；Talent Cookie不替代内部会话，机器Bearer拒绝。没有借用导出链接或生成公开对象URL。
- 无Range返回200，单个闭合/开放/后缀Range返回206，不可满足范围416；多Range和未知单位按HTTP允许方式忽略并完整200。Content-Length、Content-Range、Accept-Ranges正确；HEAD不实现，返回405。
- Local/COS增加服务器内部 `statImmutableObject` / `openByteStream`。本地固定不可写文件、验证文件身份后从同一描述符读取；COS使用已配置桶的HTTPS签名请求和If-Match，严格校验206/ETag/Content-Range/长度，拒绝忽略Range、重定向和内容编码。签名URL/对象key不返回浏览器。缓冲64KiB，背压、AbortSignal、长度边界贯穿流，不为每个Range下载全文件；全量SHA仍在接收/封存阶段校验，不把片段校验当全量摘要。
- 短事务鉴权→事务外打开流并校验对象→首字节前再次短事务核对身份/来源/资产并写读取审计→发送。审计失败不发送视频；发现对象身份或长度异常则隔离精确资产并写SYSTEM审计与write-ahead；安全日志失败不修改资产也不放行字节。每5秒尝试复查进行中的流，失败取消；单连接绝对上限默认15分钟。数据库复查卡住时仍受绝对连接时限约束，已发字节无法追回。
- 私有素材与人物详情的既有媒体面板显示原生video控件，支持播放和seek；图片/PDF入口保留。CSP明确 `media-src 'self'`。新MP4处理仅接受H.264 yuv420p及AAC/无音频；不支持格式明确提示转换。旧已封存文件及历史ID不改写，旧不兼容文件播放失败给出格式/权限核对提示。
- 播放限制统一配置：每主体2路、当前工作空间10路、每连接900秒，每主体120请求/分钟和600MB声明字节/分钟；环境变量只允许收紧。请求失败也占本窗口的请求/声明字节预算，结束/取消释放并发槽。配置见 `.env.example` 的 `MEDIA_PLAY_*`。

并发/短期播放预算由当前单API进程维护，按workspace＋Membership计数，不按Session绕过；不宣称支持多副本全局额度。未来扩展多副本须先提供共享租约/配额实现和验收，不能直接增加副本绕过限制。

本切片无schema变化，无新增迁移；1–61逐文件冻结，保留旧素材source/hash/objectToken。新增读取路由和最小读取审计不改变业务JSON载荷、删除图或恢复实体。恢复隔离仍拒绝播放；物理清理与隔离后后续请求不可读。

### 视频切片原始实测记录

本地完整 `pnpm verify` 通过：Core **607/607**、零失败/跳过，类型、237路由合同、静态/存储门禁和构建通过；追加修改后的播放/COS专项 **13/13**、类型和transport通过。原生处理 **17/17**，真实PG/Chrome媒体链路通过。最终head的全量CI结果独立回填PR，不沿用main或PR-02结果。

本轮结果与截图保存在 `artifacts/talent-experience-pr03/`，最终提交及CI绑定结果在当前PR描述记录。

- Core新增9个测试：Range边界、额度/取消、真实本地有界流、实际loopback HTTP协议、首字节前撤权、审计失败、异常隔离；COS协议测试使用受控loopback HTTP，**不是实际COS验证**。
- 真实文件处理17项：图片/PDF原有回归、H.264文件处理、拒绝MPEG-4 Part 2及伪造MP4。
- 真实Nest/Prisma/PostgreSQL/Chrome媒体流程：图片、PDF、H.264/AAC上传与异步worker、原生播放/末尾seek、精确Range字节比对、原生scope拒绝、审计触发器失败不泄露视频、正式角色授权后的隔离。首跑测试错误使用无审核权编辑员隔离而403；修正为先断言拒绝、正式授权REVIEWER并重新登录后隔离，保留反例和复测日志，没有放宽权限或超时。

真实邮件/短信 `PROVIDER_VERIFIED=NOT_RUN`；实际COS凭证与Range服务验证 `COS_PROVIDER_VERIFIED=NOT_RUN`；真实iOS/Android/微信浏览器播放 `MOBILE_DEVICE_VERIFIED=NOT_RUN`。Chrome及合成协议通过不替代这些验收。
