# ONCE Production OS｜内部部署、备份与恢复规范

版本：v0.5｜日期：2026-09-27｜当前范围：一期内部 OS + Talent Domain 2.0 R1 + AI｜状态：R1 运维契约重新冻结候选，新增能力未实现

## 1. 只部署当前内部运行面

运行单元为内部Web/API、Worker、PostgreSQL、私有对象存储和反向代理。使用独立镜像/数据库/凭证，不触及SRVF生产。1Panel/Docker可以作为部署方式，但实际主机路径、端口、容量和现网配置需部署时盘点，本轮没有读取服务器。

不部署客户入口，不配置SHARE_ORIGIN或CMS账号，不创建公开桶/CDN，官网现有部署不变。即使部署机完全无法访问AnqiCMS，内部OS仍应正常启动和验收。

## 2. 配置契约（待实现，不是现网变量）

| 配置 | 默认/用途 | 要求 |
|---|---|---|
| APP_ENV | local/test/staging/production | 生产拒默认密码/调试栈/宽CORS |
| INTERNAL_ORIGIN | 实际内部HTTPS地址 | 精确Origin、Host-only Cookie；API不信任任意转发头 |
| DATABASE_URL_FILE | 只读secret挂载 | DB不暴露公网，不输出完整连接串 |
| CONTACT_KEY_FILE | 联系字段加密与key版本 | 独立备份恢复，不与会话key混用 |
| SERVICE_PRINCIPAL_KEY_FILE | Machine Actor credential签发/校验主材料或key版本 | 不与人类Session/Contact key混用；rotate/revoke可审计；普通备份不明文导出 |
| STORAGE_CREDENTIALS_FILE | 私有staging/final/rendition的受限凭证 | 禁匿名读；环境隔离；final不能由浏览器覆盖 |
| AI_CREDENTIALS_FILE | 已批准Provider的秘密 | 不进数据库明文/日志/前端；未配不影响核心 |
| AI_ENABLED | false | 仅ENABLE-AI通过后开启；预算未配仍拒调用 |
| BUSINESS_ACCESS_MODE | MAINTENANCE或INTERNAL | 首次部署与恢复默认MAINTENANCE；不从旧库自动恢复 |
| DATA_EGRESS_MODE | DISABLED或INTERNAL_APPROVED | 管内部导出下载与AI实际发送；不是网站发布总闸 |
| RECOVERY_EPOCH | 部署侧新生成的恢复批次 | 旧库批准记录不匹配时不可重新开放 |
| WORKER_CONCURRENCY | 12的有限默认 | CPU解析受限；清理可单独优先，不需额外消息系统 |
| SAFETY_JOURNAL_REF | 独立备份位置的最小处置记录 | 可用已有安全备份通道，不要求新采购平台 |

当前配置Schema不得要求CMS/公开域/分享域/SEO配置存在。所有业务能否执行还受账号、来源用途及对象状态共同约束；开一个环境变量不能替代这些检查。

## 3. 私有访问与解析

敏感API与临时访问响应private/no-store，不进公共缓存/Service Worker离线缓存。源文件和所有预览保持私有；即使仅内部使用，也要防止直接猜对象地址取得文件。

图片/PDF解析在有限资源、无任意网络的子进程或隔离Worker中；控制文件大小/页数/像素/CPU/内存/超时。MP4若不符合支持条件给出说明，不自动下载额外编解码工具或转码海量原片。外部链接仅保存为来源引用，不自动爬取。

## 4. AI配置验证绑定

记录providerIdentityHash、configRevision、模型/协议、数据类别、用途允许范围、测试证据与批准人。秘密轮换不把旧记录当万能验证；更改baseUrl/provider/model或数据处理条件立即使旧启用资格失效，排队任务停止，不能改发新目的地。

运营界面只编辑预先允许的目的地，不允许任意URL成为SSRF/转发入口。没有AI处理依据的真实文件不用于连通性测试；用合成文字即可测接口。没有可用费率/预算上界，不实际发出收费请求。

## 5. 观测和日常维护

需要记录API/DB健康、Worker心跳/积压、上传配额/异常大对象/孤儿量、来源到期/暂停、导出失效、AI未决Attempt/预算、ServicePrincipal revoke/rotate/失败认证、ExternalRef冲突、Proposal积压、备份成功时间和恢复演练记录。API健康不代表Worker正常；任务失败有工作台与一条可维护告警渠道即可。

同一敏感哨兵应在应用/代理/解析日志全检为零。对AI只记录元数据和摘要，不把完整输入prompt写日志。权限读取和维护动作审计可追溯，但不复制整份客户资料到审计表。

## 6. 备份与恢复资产

数据库、物理媒体及其固定locator/checksum清单、Contact/ServicePrincipal等必要加密密钥与配置版本都需要可恢复。Machine credential 原值不进入普通业务导出；恢复后需验证 keyVersion/credential state，并可按策略强制 rotate。导出迁移是成员业务操作，备份是更高权限的运维操作，不能混为一个“下载全库”按钮。

保留政策和目标见12；参数是工程默认，真实处理依据由负责人确认。备份内容仍受访问控制，到期清理有记录；不能承诺已下载文件或第三方模型保留的资料可立即全部消失。

账户停用、用途暂停/撤回、删除与保护版本等最小安全变化，应在独立备份位置保留可核对记录。异步追加存在盲区，不能声称零丢失；不完整时使用下面的保守恢复路径。无需先做分布式审计账本。

## 7. 恢复：只处理内部与AI，不处理官网

1. 在部署层设BUSINESS_ACCESS_MODE=MAINTENANCE、DATA_EGRESS_MODE=DISABLED、AI_ENABLED=false，生成新RECOVERY_EPOCH，隔离恢复网络。
2. 恢复DB、对象清单和密钥，仅允许明确的维护身份；不开放普通旧账号。校验备份/对象哈希与迁移版本。
3. 使旧Session/激活令牌失效；ServicePrincipal credential 进入恢复隔离，未完成 keyVersion/状态核验前不能重新开放机器写入；旧导出保持不可下载；旧AI待发/未决任务进入待核对，不随Worker重启重发。
4. 核对恢复点后的账号/ServicePrincipal停用或rotate、源用途变更、PersonExternalRef撤回、Role/Eligibility/Credential状态、限制/删除记录。Talent R1 新关系缺失或不一致时 restore-check 阻断放行；不能排除缺口的旧数据保持受限。
5. 重新建立依赖清单，清理/隔离该删的文本、派生文件、AI缓存和导出；不因payload过去不可变拒绝删除。
6. 输出核对报告并由负责人批准当前恢复epoch，先开放内部人工路径，再按独立条件启用内部导出与AI。

**没有远端CMS枚举、暂停命名空间、重新校验公开页面或清理CDN的步骤。**若将来真做公开发布，需另行增加其恢复流程，而不是现在让它阻塞OS上线。

## 8. 日常故障动作

| 故障 | 正确处理 | 不要做 |
|---|---|---|
| AI发出后超时 | UNKNOWN、保留预算、核对供应商证据 | 直接换模型或重复发送 |
| final对象缺失 | QUARANTINED、拒新读取；按校验过备份恢复或新建版本 | 用同名其他文件顶替 |
| 来源到期 | 按当次用途拒绝不合法处理；补确认/清理 | 无依据自动延长7天 |
| 导出依赖失效 | 整件拒绝下载，新建合法导出 | 只更新前端预览继续给旧文件 |
| Worker崩溃 | 停新claim、保留任务、按类别恢复 | 无限加并发或把失败改成功 |
| 权限/删除恢复缺口 | 隔离、重新核实与批准 | 开放旧账号/旧许可省事 |
| Machine credential恢复不确定 | 保持ServicePrincipal PAUSED/REVOKED，核验后rotate | 直接信任备份里的旧机器secret |
| ExternalRef冲突 | 阻断自动身份解析，进入人工merge/修复 | 以姓名/头像替代精确ref自动合并 |

## 9. 升级与可接管交付

不可变镜像tag/digest、锁文件、配置Schema、迁移步骤、权限表、Task schemaVersion与回滚/前滚说明随版本交付。启动不自动运行破坏性schema同步。优先回滚兼容的应用镜像，不直接恢复旧DB抹掉最新安全变化。

维护CLI目标：bootstrap-owner、preflight、restore-check、safety-journal-check。默认只读/隔离检查，写操作显式批准；本轮未创建这些可运行脚本，不可拿文档命令直接在生产执行。

第二名维护者按文档在隔离环境完成恢复，记录实际版本/命令/输入/结果。试用和正式启用都不需要网站供应商验收。本章部署、Provider、恢复及接管用例目前均为NOT_RUN。
