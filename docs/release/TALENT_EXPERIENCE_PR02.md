## 2026-10-01：PR-02b 实现与验收（Draft 待复核）

PR-02a 已经用户复核冻结。本轮在 PR #30 原分支上实现 PR-02b；**保持 Draft，未合并、未部署，PROVIDER_VERIFIED=NOT_RUN**。下方 PR-02a 和启动记录是历史状态，其“未进入 PR-02b”不覆盖本节。PR-03 多来源媒体、客户分享和官网发布未启动。

### 本轮实际交付

- 内部详情创建定向 CLAIM，选择限定审核范围和可向本人开放的字段，签发链接及本地生成二维码；审核收件箱支持通用 ENROLL。秘密只在签发响应出现，数据库只保存 keyed hash。链接 fragment 兑换浏览器绑定上下文后立即移除，不进入请求 URL、普通回执或日志；GET 不占名额。
- CLAIM 默认7天/1次，ENROLL默认30天/100次、7天 reservation；事务内保证 used+reserved 上限。ENROLL先建立归属申请和本人可读草稿，没有假 Person。到期释放名额但不立即丢弃服务器草稿，可显式续办。批准后 grant 不再依赖邀请是否到期。
- 所有认领都由内部人员记录独立归属依据后批准；指定收件渠道必须匹配已验证 identity。SELF 按 Person 和 TalentAccount 分别唯一；未知年龄未声明成年、已知可能未成年均不能批准 SELF。监护/代理须独立确认。邀请本身不赋予读取 Person 的权利。
- 本人手机端开放**姓名/艺名、别名、简介**的文字维护。每次读取均复查当前 TalentAccount、Claim/Grant、Person、恢复 epoch、删除/合并状态；新 Portal 业务 GET 也要求 `X-ONCE-Talent-Account`。账号切换后旧标签读写拒绝并清空旧内容。
- 服务器 DRAFT 通过 revision 保存；提交冻结摘要和字段基线。一次审核逐项决定整批，依赖组/DAG 不可拆开采纳；独立字段可部分采纳。同一字段变化进入 NEEDS_REBASE，不因人物其他字段变更一概冲突。修改旧提交必须 fork；已采纳项不重复进入部分退回的新草稿。
- 采纳复用原 Person/TD2/FieldEvidence，同档 CLAIM 保持 Person ID。ENROLL必须明确选择同档绑定或新建，并记录独立归属证明；首版新建 UI 明示“新建模特档案”。提交者 TalentAccount、审核员工和来源依据分别记录，不把审核员写成材料提供者。
- 同意文本 `internal-directory-2026-10-v1` 明确姓名/别名/简介、内部目录/候选/受控导出、365天及可撤回；不包含客户分享、公开发布或媒体。SourceUseBasis 是独立用途依据，`Source.internalUseUntil` 为同事务保护投影。撤回立即影响新旧目录、计数、候选及导出检查，不等待缓存或 worker；旧历史来源不伪补同意。本人文字来源不能借用于新增其他人、作品、专业事实或媒体。

### 数据库、合同及权限

新增9个实体：TalentInvitation、TalentInvitationContext、TalentClaim、TalentAccessGrant、TalentConsent、TalentSubmission、TalentSubmissionItem、SourceAttribution、SourceUseBasis。普通提交条目是文本声明，不是第二套 Person 模型。

| 迁移 | 内容 |
|---|---|
| 58 `202610010003_talent_maintenance` | 9表、用途保护投影、workspace/身份/人物 FK、SELF 唯一、名额与状态 CHECK |
| 59 `202610010004_talent_basis_rebuild` | live/imported 依据分支、归属复合 FK、冻结条目触发器、用途/同意一致性延迟约束 |
| 60 `202610010005_talent_maintenance_permissions` | `talent.invite` / `talent.review` 纳入既有 Membership 权限 CHECK |
| 61 `202610010006_talent_submission_ownership` | ENROLL Claim/Consent/Submission/Attribution 账号归属复合 FK |

前57次迁移逐文件保持原样。默认仅 ADMIN 获得邀请/审核权限；其他员工需显式授权，同时仍受来源和范围权限限制。新增25条精确路由，生成请求类型/OpenAPI同步；unknown-fields reject保留。`once-talent-text-v1`只接受3种文字条目，最多3项，依赖和重复键严格校验。

内部路由 `/talent-invitations`、`/talent-claims`、`/talent-grants`、`/talent-submissions`；Portal路由 `/portal/invitations`、`/portal/claims`、`/portal/profiles`、`/portal/submissions`、`/portal/consents`，细分方法见生成合同。页面 `/talent/login`、`/talent/claim`、`/talent/home`，内部 `/workspace/talent-review`。没有媒体上传、客户或公开路由。

全部业务 COMMAND 使用原统一回执、审计、write-ahead 和稳定 TalentAccount 幂等作用域；签发邀请是 SECRET，不进入普通业务回执。丢响应显式原键核对，不能产生第二次审核/采纳。审核审计失败回滚人物、来源、证据、提交状态和回执。

### 生命周期与恢复

新增实体进入原删除预览、冻结摘要、范围检查及执行链。Person 合并要求确认撤销两端外部授权，保留旧ID映射，不把 TalentAccount 跟着别名转移；人物删除清除服务器提交镜像，保留必要最小归因。停用账号关闭 grant、未结束申请及名额；恢复 prepare 关闭旧邀请、上下文、grant和未完成提交，原会话/挑战不复活。

普通业务 JSON 仅包含已批准事实及必要来源归因/用途元数据，不导出邀请 secret、认证表、session、验证码或草稿。JSON重建保留原提供者/提交/同意编号作为历史依据，不重建这些账号或 grant，也不能延长用途有效期。物理备份包含必要实体，实际恢复后必须经过原恢复隔离。

### 验收证据与状态

本地完整核心 **597/597通过、零失败/跳过**；真实PostgreSQL14.19专项 **32项通过**，完整PG回归退出0；HTTPS/Chrome真实浏览器6组场景通过。类型、transport、236条生成合同、静态/存储门禁、构建均通过。最终 head 的 CI 链接回填 PR #30，不能使用上一提交的 CI 代替。证据目录 `artifacts/talent-experience-pr02b/`：

- `core-suite.json`：完整核心回归；新核心测试覆盖归属、权限、部分采纳、冲突、用途撤回、生命周期和恢复。
- `postgres.json`：真实PG共享业务场景、名额并发、复合归属FK、SELF唯一、冻结内容触发器、审核审计失败回滚、受控JSON重建、真实pg_dump/restore与恢复prepare、实际合并及删除。
- `browser.json`、`draft/review/approved-360/390/430.png`：真实Nest/Prisma/HTTPS/Chrome完成“邀请→登录→同档认领→保存草稿→刷新→提交→内部批量审核→查看采纳”。另有 ENROLL 新建、双标签切换账号读写拒绝、丢响应原键核对；没有模拟API成功来代替页面演示。
- `migration-baseline.json`：前57次迁移和冻结规范原文未变，新迁移58–61。

认证发送仍只用受控本地HTTP服务验证，**PROVIDER_VERIFIED=NOT_RUN**，正式入口默认关闭。本轮代码完成不代表生产入口可用；真实供应商/网关凭证、渠道验证和单独上线审批仍未完成。PR-02b等待本轮复核，不宣布PR-02或Release A已正式冻结。

---

## 2026-10-01：PR-02a 实现与验收

本轮只推进 PR-02a「独立人才账号、认证和真实外部主体基础」。PR #30 保持 Draft，未合并、未部署。PR-02b 的邀请/认领/grant/草稿/投稿审核/consent，以及多来源媒体、客户分享和官网均未实现。以下原启动记录保留为历史范围。

### 已实现

- 6 个独立实体：TalentAccount、TalentIdentity、TalentSession、TalentAuthContext、TalentAuthChallenge、TalentAuthDelivery。不新增内部 User/Membership，也不关联 Person。
- 第 56 次前向迁移 `202610010001_talent_auth_principals`：独立账号/认证表，原 receipts/audits 真实主体字段、历史归因回填、FK/XOR/CHECK 和人才幂等唯一索引。第 57 次 `202610010002_talent_auth_key_binding`：账号身份检索密钥绑定，恢复换错 key 时拒绝使用，不能默默重建同身份账号。第56次已用于隔离测试库，后续修正通过新迁移追加；前55次逐文件冻结。
- `CommandPrincipal = Actor | TalentActor`；内部与机器旧 Actor 保留原语义。统一 Commands/audit/PrismaStore/MemoryStore 写入 principalKind 与唯一真实主体 ID。SYSTEM 只用于真实系统审计；COMMAND 无 SYSTEM 分支。
- Talent COMMAND 幂等范围为 workspace/TALENT/talentAccountId/operation/key，与 session 无关；writeAhead 使用同一稳定主体摘要。原 INTERNAL/MACHINE 回执逐字段升级保留，并用新引擎原键重放验证。人才回执重放检查当前账号/epoch、资源及账号归属。

### 身份与认证合同

`talent-identity-v1`：去除输入首尾空白；邮箱 domain 转 IDNA ASCII 并小写，**local-part 保留大小写、点号和 +suffix**，不做供应商特有合并；PHONE 只接受带 `+` 的 8–15 位 E.164 形式，不猜国家代码。身份查重 HMAC 包含 workspace 和渠道类型；独立 identity key。成功验证后才建立 identity，账号与身份唯一约束由数据库保证；本轮不持久化邮箱/电话原值。

验证码使用独立 code key 的 HMAC，绑定 challenge ID；正式会话、预认证浏览器绑定和 CSRF 使用各自密钥。发送前最小收件地址/验证码仅短期 AES-GCM 加密存储于 AuthDelivery；进入发送前将 delivery 记 UNKNOWN 并清除加密载荷，网络请求在事务外。明确响应才变 ACCEPTED/DELIVERED/FAILED；网络、超时、重定向或无法确认的响应保持 UNKNOWN，禁止自动重发。验证码正确与否不依赖供应商是否能证明 DELIVERED。

实际路径为 QUEUED → UNKNOWN（发送期间）→ ACCEPTED/DELIVERED/FAILED/UNKNOWN；合法验证一次性变 CONSUMED。过期/新 challenge 使旧记录不可验证，清除 codeHash；错误次数达到上限变 FAILED。新 challenge 需显式申请，遵守重发间隔和身份/地址/工作空间累计额度。LOGIN 为唯一已开放用途；RECOVER 是明确拒绝的保留用途，不提供账号恢复捷径。

预认证 15 分钟、每浏览器最多5个未过期上下文；OTP 10分钟/5次错误/60秒重发；identity 每小时5次/每天10次、IP每小时20次、workspace每小时100次/每天200次，配置可收紧。人才会话 idle 7天/absolute 30天，同时检查账号 sessionEpoch、部署及数据库 recoveryEpoch。

### Portal 与管理路由

手机入口 `/talent/login`，开关关闭时返回503“人才登录暂未开放”。只登录/查看自身账号概要/退出，不读取人物资料。Cookie 为 `once_talent_pre`、`once_talent_session`，Path=/api/v1/portal，HttpOnly、Secure、SameSite=Lax，无 Domain。员工 Cookie 可共存但不代用；Bearer 在 Portal 一律拒绝。

| 方法 | 路由 | 合同 |
|---|---|---|
| POST | `/api/v1/portal/auth/context` | 精确 Origin + X-ONCE-Portal:1，产生独立上下文/CSRF |
| GET | `/api/v1/portal/auth/contexts/{id}` | 当前预认证 Cookie 绑定；刷新查状态，不发送验证码 |
| POST | `/api/v1/portal/auth/challenges` | 上下文、purpose、严格 EMAIL/PHONE/identity；Origin/CSRF |
| POST | `/api/v1/portal/auth/verify` | 上下文、challenge、purpose、code；一次消费，独立会话 |
| GET | `/api/v1/portal/me` | 只返回账号 ID/status/revision 与 CSRF，无 Person/联系方式/来源 |
| POST | `/api/v1/portal/auth/logout` | Talent Cookie + Origin/CSRF + X-ONCE-Talent-Account；原 Path 清 Cookie |
| POST | `/api/v1/portal/auth/revoke-other-sessions` | 同上及 Idempotency-Key；统一 COMMAND，保留当前会话，撤销其他会话 |
| POST | `/api/v1/talent-accounts/{id}/disable`、`.../erase` | 内部 members.manage + expectedRevision + 统一 COMMAND；不开放额外菜单 |

旧页面账号不符时先拒绝身份变化，不把请求交给新账号。验证码响应丢失先读 me 和当前上下文的已验证账号，只有两者一致才认定完成，避免误认旧标签页已有账号。上下文 ID 是非秘密引用，可在 URL 恢复；凭证、OTP 和业务正文不进入浏览器存储。

### Provider 与生命周期边界

集中配置见 `.env.example` / `talent-auth-config.ts`。`TALENT_PORTAL_ENABLED=false` 为默认值；已提供受控 test provider 与真实 HTTPS notification gateway 适配接口，后者需要实际自有网关/供应商接入、credential 文件、sender、template、timeout 和额度。接口为 POST JSON，发送 requestKey/kind/recipient/code/expiresAt/sender/template，Bearer 凭证与 Idempotency-Key；返回相同 requestKey 和 ACCEPTED/DELIVERED/FAILED/UNKNOWN。禁止重定向、自动重试或记录供应商正文，响应上限4096字节。没有假装已接入某家短信/邮件厂商。

**PROVIDER_VERIFIED=NOT_RUN**。开发验证使用隔离的本地 HTTP 合成服务，未向真实收件人发送消息；test provider 禁止 staging/production，http provider 要求 HTTPS。真实账号认证是否可对外开放仍取决于实际供应商验证和单独发布审批。

停用/擦除立即递增账号 epoch、撤销全部人才会话并使已有挑战失效；擦除保留最小账号/身份 keyed hash 墓碑及审计归因，避免同一停用身份重新注册绕过限制，无原始联系方式可回显。新主体不连接 Person，所以本轮 Person 合并/删除不隐式转移账号；认领相关生命周期属于 PR-02b。

普通业务 JSON 导出继续按业务白名单构造，**不导出认证表、OTP、session hash/token 或 secret**；不能把该文件当账号迁移文件。账号恢复使用受控实际数据库备份；恢复 prepare 同事务撤销会话、挑战并清除发送密文，UNKNOWN 不补发。恢复检查包含人才认证关系、存活凭证阻断和全表状态摘要，防止检查后更改新实体。worker 只清理过期挑战/发送密文，不补发丢失或结果未知请求。

### 本地最终结果与待复核边界

`PR-02a IMPLEMENTED + BROWSER/POSTGRES_TESTED + PROVIDER_VERIFIED=NOT_RUN`。核心 590/590、零失败/跳过；完整 PostgreSQL14.19 回归退出0（含55→57升级、实际备份恢复与新旧业务）；真实 Nest/Prisma/Chrome HTTPS 浏览器通过360/390/430px及双标签/刷新/丢响应恢复；类型、transport、211路由生成合同、静态门禁与构建通过。独立真实HTTP供应商协议测试涵盖接收、送达、坏响应、连接重置、超时与重定向，均无自动重发。

CI 新增独立 `browser-talent-auth`，最终共有8项；最终 head/SHA及绑定CI运行在 PR #30 描述回填，不沿用启动提交结果。PR-02a 等待本轮复核；剩余为真实供应商/网关凭证与渠道验证，正式入口保持关闭。PR-02 整包未完成，不进入PR-02b，未部署。

### 证据

真实数据库、55→57升级、备份恢复及手机页面证据见 `artifacts/talent-experience-pr02a/`。`postgres.json` 记录数据库实际版本与覆盖项；`upgrade.json` 记录旧回执逐字段保留及新引擎重放；`browser.json` 和 360/390/430px 截图记录 HTTPS 手机认证、刷新不重发、双标签隔离和无 Person/User/Membership 副作用。本地 PostgreSQL 14.19 与 CI PostgreSQL16 分开记录，最终结果与最终提交见 PR #30。

本轮23项验收对应：1–3 身份规则/唯一账号；4–9 过期、尝试、替换、purpose、UNKNOWN、并发一次消费；10–13 Cookie/Bearer 隔离；14–17 统一回执/新会话归属/审计回滚；18–19 停用/恢复epoch；20 实际业务导出/日志/审计/回执检查；21–23 HTTPS手机宽度、刷新不重发和双标签上下文。共享测试位于 `tests/support/talent-auth.ts`，由核心和真实PG调用；供应商异常、累计限流、清理和密钥错配有独立核心测试。

# PR-02：人才账号、邀请、同档认领和本人文本维护

2026-10-01 启动；分支 `codex/talent-experience-pr02`，基线为最新 main `79e064980fda7df9f90ea6a2fef13d3b3eeccb9f`。基线完整 CI [36755091719](https://github.com/BA7IEE/once-production-os/actions/runs/36755091719) 七项 SUCCESS。PR-01 已冻结、已合并、未部署。

本启动提交只回填前包状态、记录当前代码差距和执行入口；没有新增运行功能、schema、迁移、配置或页面。PR-02 未完成，外部人才入口仍未开放，不能将基线 CI 作为新功能验收证据。

## 固定范围与实施顺序

沿用 [v1.1 冻结规范](../spec/15_TALENT_EXPERIENCE_V1_1.md) 第7–9、17、19和20节及 [现有合同](../spec/16_TALENT_EXPERIENCE_CONTRACT.md) 的 PR-02a/02b 拆分，不另开产品规划。

1. PR-02a：独立人才账号、身份规范化与 keyed hash、预认证上下文、验证码挑战和真实发送适配、独立会话；扩展原命令回执、审计及写前日志的真实主体归因。同步账号停用、恢复隔离、旧内部/机器回执重放。
2. PR-02b：定向邀请与通用加入、链接/二维码、同档认领和逐人授权；服务器文本草稿、冻结提交、一次批量审核、本人来源归因和内部使用同意。正式事实继续写入原 Person/TD2/FieldEvidence 链，保留 Person ID、职业、作品和来源历史。

PR-03 的多来源媒体/本人上传不进入本包；客户分享和官网发布也不进入。不提前创建这些功能的路由、菜单或空页面。既有内部媒体功能保留。

## 已核实的代码入口与待改造项

| 当前入口 | 当前事实 | PR-02 必须落实 |
|---|---|---|
| `packages/core/src/identity.ts`、`api.ts` | 内部登录认证；API 中选择内部或机器主体 | 独立人才认证处理器、精确路径段分流、预会话 Origin/CSRF；认证失败不得回退其他身份 |
| `packages/core/src/model.ts`、`commands.ts`、`helpers.ts` | Actor/回执/审计使用 Membership 或 ServicePrincipal | 真实人才主体及 FK/XOR、稳定主体幂等键；不能伪造成员或另建简化回执 |
| `api.ts` 的 `writeAhead()`、`safety-intent.ts` | intent 摘要目前只区分员工与机器 | 新主体使用同一稳定身份元组；新登录 session 不改变业务幂等归属 |
| `prisma/schema.prisma`、`apps/api/src/prisma-store.ts`、`packages/core/src/store.ts` | 无 TalentAccount/邀请/认领实体 | 前向迁移、MemoryStore/Prisma 一致；有数据升级保留旧 ID 和历史归属；前55次迁移不变 |
| `apps/api/src/config.ts`、`worker-main.ts` | 无人才认证发送配置及执行器 | 独立密钥、限流和实际供应商适配；短期加密发送载荷，事务外网络调用，UNKNOWN 不盲重发 |
| `apps/api/src/main.ts`、`apps/admin-web` | 现有 HTML 深链仅内部页面 | 人才手机页面及独立 Cookie；纯文本/CSP、白名单本人 DTO；内部 Cookie 不能代用 |
| `packages/core/src/exports.ts`、`rebuild.ts`、`recovery.ts` 及删除/合并链 | 当前覆盖 PR-01 既有实体 | 新实体逐项导出/删除/合并/恢复；普通 JSON 不含 OTP、会话或原始 token |

## 不可省略的业务约束

- 定向邀请必须匹配已认证接收渠道或经过人工批准。持有链接且验证任意电话不能直接认领；GET/预抓取不消费邀请。签发属于 SECRET，普通回执不保存秘密，响应丢失可撤销重签。
- ACTIVE SELF 对账号与 Person 双向唯一；监护/代管逐人授权。未知年龄不当成年，已知未成年不自动授予 SELF。账号变更、撤权及恢复隔离即时生效。
- 认领、授权、邀请消耗、申请名额转换和回执同事务。原键重放先查回执，再复查当前访问权；失败无半绑定或多建 Person。
- 每个邀请使用显式 contextId，双标签页不串目标。账号切换携带 `X-ONCE-Talent-Account` 对照，不能借新账号执行旧请求。
- 本人预填只读取 selfExposureManifest 覆盖且当前仍可用的字段，不因同档认领开放内部来源全文、完整生日、价格或内部备注。
- 草稿保存在服务器；SUBMITTED 内容不可原地改写；一次审核终结整份提交，依赖组原子采纳；冲突/撤回后 fork 新草稿。审核人和提供人分别归因。
- 新来源的用途依据与同意撤回接入新旧读取、查询、候选、导出等消费者；旧来源不伪造追溯同意。媒体改造留 PR-03，不能提前放开新媒体入口。

## 待完成的验收（均未执行，不计通过）

| 层次 | 本包证据要求 |
|---|---|
| 核心与合同 | 邮箱不去除 local-part 点号/加号；挑战用途隔离/限次/限流/过期；未知字段拒绝；内部/机器原键回放；新主体审计失败回滚 |
| PostgreSQL | 有数据旧库前向升级、空库安装；双账号/双邀请认领竞争，SELF双向唯一；撤回与审核 CAS 竞争；独立主体回执/FK/XOR；JSON重建与实际备份恢复 |
| 真实页面 | 员工给已有 Anna 邀请→手机认证→同 Person 认领→保存文本草稿→提交→员工审核→查看同档结果；360px、刷新续填、丢响应原键核对、双标签页、多账号隔离 |
| 生命周期 | 停用账号、撤销 grant/同意、来源失效、人物删除/合并及恢复后旧会话/邀请/挑战不可复活；恢复不补发旧短信邮件 |
| 真实适配 | 发送状态区分 QUEUED/ACCEPTED/DELIVERED/FAILED/UNKNOWN；未验证真实渠道时标 PROVIDER_VERIFIED=NOT_RUN，不能用测试替身宣布整包完成 |

验收至少覆盖冻结规范 AT-08、AT-13–24、AT-26、AT-37–38、AT-54、AT-63–64、AT-81 的本包部分及认证/提交扩展用例。所有结果绑定本包最终 head；不借 PR-01 的七项 CI 宣布 PR-02 通过。

当前下一步为 PR-02a 的账号、认证和真实主体基础实现。供应商与实际发送凭证尚未配置/验证；开发测试只使用合成身份，不向真实收件人发送消息。没有生产迁移或部署。
