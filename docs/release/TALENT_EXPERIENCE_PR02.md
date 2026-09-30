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
