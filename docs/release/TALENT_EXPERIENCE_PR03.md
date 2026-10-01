# PR-03：模卡、照片、视频、作品案例和本人多来源媒体维护

## 基线与状态

PR-02 已合并、开发冻结、未部署，`PROVIDER_VERIFIED=NOT_RUN`。PR #30 以 `9fc2f9295068a16a16e6409b6df1c230bbe055ca` 为 expected head 合并，main 为 `1a297d86ecfeac5d7a3c748322a867c9852a20c9`；[main CI 36815702669](https://github.com/BA7IEE/once-production-os/actions/runs/36815702669) 9/9 SUCCESS 后创建独立分支 `codex/talent-experience-pr03`。

**PR-03 已启动，当前仅交付内部受控视频播放切片；PR-03 整体未完成。** 本分支保持 Draft，未合并、未部署，不开放真实外部入口。范围沿用冻结 spec/15 第10、13、17.6、18节及 spec/16 ADR-TE-04，不重新做产品规划，不进入客户分享/官网/支付/CRM。

## 当前已实现切片

- 新增 `GET /api/v1/assets/{id}/playback`，BINARY、`assets.read`。沿用当前内部会话、原生scope、人物、来源、删除保护、恢复隔离和READY判定；Talent Cookie不替代内部会话，机器Bearer拒绝。没有借用导出链接或生成公开对象URL。
- 无Range返回200，单个闭合/开放/后缀Range返回206，不可满足范围416；多Range和未知单位按HTTP允许方式忽略并完整200。Content-Length、Content-Range、Accept-Ranges正确；HEAD不实现，返回405。
- Local/COS增加服务器内部 `statImmutableObject` / `openByteStream`。本地固定不可写文件、验证文件身份后从同一描述符读取；COS使用已配置桶的HTTPS签名请求和If-Match，严格校验206/ETag/Content-Range/长度，拒绝忽略Range、重定向和内容编码。签名URL/对象key不返回浏览器。缓冲64KiB，背压、AbortSignal、长度边界贯穿流，不为每个Range下载全文件；全量SHA仍在接收/封存阶段校验，不把片段校验当全量摘要。
- 短事务鉴权→事务外打开流并校验对象→首字节前再次短事务核对身份/来源/资产并写读取审计→发送。审计失败不发送视频；发现对象身份或长度异常则隔离精确资产并写SYSTEM审计与write-ahead；安全日志失败不修改资产也不放行字节。每5秒尝试复查进行中的流，失败取消；单连接绝对上限默认15分钟。数据库复查卡住时仍受绝对连接时限约束，已发字节无法追回。
- 私有素材与人物详情的既有媒体面板显示原生video控件，支持播放和seek；图片/PDF入口保留。CSP明确 `media-src 'self'`。新MP4处理仅接受H.264 yuv420p及AAC/无音频；不支持格式明确提示转换。旧已封存文件及历史ID不改写，旧不兼容文件播放失败给出格式/权限核对提示。
- 播放限制统一配置：每主体2路、当前工作空间10路、每连接900秒，每主体120请求/分钟和600MB声明字节/分钟；环境变量只允许收紧。请求失败也占本窗口的请求/声明字节预算，结束/取消释放并发槽。配置见 `.env.example` 的 `MEDIA_PLAY_*`。

并发/短期播放预算由当前单API进程维护，按workspace＋Membership计数，不按Session绕过；不宣称支持多副本全局额度。未来扩展多副本须先提供共享租约/配额实现和验收，不能直接增加副本绕过限制。

本切片无schema变化，无新增迁移；1–61逐文件冻结，保留旧素材source/hash/objectToken。新增读取路由和最小读取审计不改变业务JSON载荷、删除图或恢复实体。恢复隔离仍拒绝播放；物理清理与隔离后后续请求不可读。

## 实测边界

本地完整 `pnpm verify` 通过：Core **607/607**、零失败/跳过，类型、237路由合同、静态/存储门禁和构建通过；追加修改后的播放/COS专项 **13/13**、类型和transport通过。原生处理 **17/17**，真实PG/Chrome媒体链路通过。最终head的全量CI结果独立回填PR，不沿用main或PR-02结果。

本轮结果与截图保存在 `artifacts/talent-experience-pr03/`，最终提交及CI绑定结果在当前PR描述记录。

- Core新增9个测试：Range边界、额度/取消、真实本地有界流、实际loopback HTTP协议、首字节前撤权、审计失败、异常隔离；COS协议测试使用受控loopback HTTP，**不是实际COS验证**。
- 真实文件处理17项：图片/PDF原有回归、H.264文件处理、拒绝MPEG-4 Part 2及伪造MP4。
- 真实Nest/Prisma/PostgreSQL/Chrome媒体流程：图片、PDF、H.264/AAC上传与异步worker、原生播放/末尾seek、精确Range字节比对、原生scope拒绝、审计触发器失败不泄露视频、正式角色授权后的隔离。首跑测试错误使用无审核权编辑员隔离而403；修正为先断言拒绝、正式授权REVIEWER并重新登录后隔离，保留反例和复测日志，没有放宽权限或超时。

真实邮件/短信 `PROVIDER_VERIFIED=NOT_RUN`；实际COS凭证与Range服务验证 `COS_PROVIDER_VERIFIED=NOT_RUN`；真实iOS/Android/微信浏览器播放 `MOBILE_DEVICE_VERIFIED=NOT_RUN`。Chrome及合成协议通过不替代这些验收。

## PR-03 待继续的冻结范围

以下尚未实现，不能因本次视频切片通过而标记完成：

1. INTERNAL_SOURCE / TALENT_SUBMISSION / AGENT_SUBMISSION真实上传主体，已绑定Grant和未绑定ENROLL的暂存上下文；worker逐阶段资格复查，STAGED/ADOPTED/RETIRED与技术READY正交。
2. 同一Person/Role的多来源媒体关系，A/B来源分别有效，不再要求沿用主来源；所有普通/本人/审核读取、目录、作品、候选、导出一致授权。
3. 模卡/素颜/作品集/介绍视频行内上传、排序、封面；PDF保持不解析、显式图片封面。照片不能被迫伪造Work。
4. 作品案例表单、EXTERNAL Work/WorkCredit/WorkAsset/WorkMetadata、未知品牌/年份、多人共用作品只提交本人署名声明。
5. 本人媒体服务器草稿、冻结条目、依赖组审核和同档采纳；媒体用途同意版本，不能借用PR-02只覆盖文字的同意。
6. 可配置个人/ENROLL/工作空间准入预算，READY未采纳素材的业务回收计划、安全日志、真实物理清理确认后归还额度；fork/采纳/回收并发。
7. 新增关系同步前向迁移、旧库升级/空库安装、权限/回执/审计、JSON导出重建、删除、合并与备份恢复；本人多来源完整手机旅程及A来源失效/B可用反例。

不提前实现PR-04机器摄取业务、PR-05价格与档期、PR-06客户分享或PR-07官网发布；相关媒体上下文与关系按冻结合同逐步接入。
