# ONCE Production OS｜输入指纹与继承研究依据

版本：v0.3｜日期：2026-09-22｜当前范围：一期内部 OS + AI｜状态：文档已修订，产品实现和运行测试未执行

## 1. 本轮证据边界

本轮依据用户最新范围决定，对实际可读的v0.2 Markdown及R1审查材料进行修订。没有重新查询官网、最新软件版本、竞品、法律或GitHub；以下外部资料明确继承前轮研究，不当作本轮重新核验的现状。

设计的状态、参数、权限、接口和表结构是当前开发规格，不是供应商已经提供的功能，不是已实现代码，也不是法律意见。后续采用具体依赖/供应商时再验证相应现状，不能因为这里有引用便直接开启真实使用。

## 2. 用户决定与已知事实

| 编号 | 当前依据 | 证据类型及限制 |
|---|---|---|
| U01 | 第一期不做CRM、财务、合同、排期、报价，但底座须可扩展；评估复用SRVF | 用户在本会话明确要求 |
| U02 | ONCE已成交两三单海外客户，现用AnqiCMS中英网站，希望把人才、作品和项目组织成内部可复用资料 | 用户陈述；未审计成交、流量、费用或实际任务时长 |
| U03 | “修复文档，现在主要是做的OS啊 可以先不用考虑官网发布啥的呢” | 本轮范围优先依据；网站发布不再作为内部OS前提 |
| U04 | 文档全部Markdown，先评审再形成开发文档 | 用户此前明确格式要求，继续适用 |

将客户外部分享、在线反馈和人才自助门户同时延期，是本版为先完成内部OS采用的范围默认；没有把这些永久取消写成用户原话。后续真实需求出现时可单独恢复。

## 3. 输入包指纹

以下为本轮对本地文件实际计算的字节数和SHA-256。旧包保持原样，不放进新包，避免开发Agent误读历史稿。

| 输入文件 | 字节数 | SHA-256 |
|---|---:|---|
| `ONCE_Production_OS_v0.2_MD.zip` | 138195 | `4b32a1513fbfac5c4bdff86b40465fe5d2a41565253f30e4498ac8aae8fde9ac` |
| `ONCE_Production_OS_Adversarial_Audit_v0.2_R1_MD.zip` | 196999 | `b123d8056cfe20321c5d0326109d4fb8c09cf56ee45fcb532a0ca8ef4e169337` |

### v0.2的16份活动输入

| 原文件 | 字节数 | SHA-256 |
|---|---:|---|
| `00_README.md` | 3905 | `dfebee4b3c9218906ebe025e74d371a7b062e92fb5151bebe24148fe98848648` |
| `01_REVIEW.md` | 12644 | `fb85358e79f61e82fc6b68ec7efa59e26eff8634ef32ef6c2a13fd9a4f4bac3a` |
| `02_BRD.md` | 19044 | `54f98eaa532e06d1d52f33ad94846444100b723c9c928bac5808222c4b235177` |
| `03_MRD.md` | 21367 | `23243163d61266dca9b8d74cdbb37f0a449573a5a7bfa50befc0d360ede80d75` |
| `04_PRD.md` | 61324 | `3723ae74fcc1197f9beff5aeaa2c3792347acec2067c7c3923c722a3926f3bf0` |
| `05_REUSE.md` | 23283 | `fa4bc0d3dfdafbc765acd3608f6fd54d1e92adaea7b3dc2b6bdd952d85b2a68e` |
| `06_DEVELOPMENT.md` | 18593 | `010168d9443aa3d585cbcdd3a9a674405465321cef8f6641ec5c0baa0ae944e9` |
| `07_DATA_MODEL.md` | 22933 | `0ac5aa407bd076737152d6632c2d736d2cc00dd7e2cd0912e4aa12c97363fb56` |
| `08_API_PERMISSIONS.md` | 18976 | `714c84d2c0648443e551ec6de72128227fd5c07d8f6aaf711c7bc6322d373433` |
| `09_STATES_PUBLISHING.md` | 15208 | `a9ffe78f6af8c8b6c718ba04a8f9453832dd9935dbc5ecdb4283771c62373cc7` |
| `10_BACKLOG_TESTS.md` | 22694 | `9019b9ce19dcb077c421acb04fb790fe9aab8ac7136c1f6b6a6cb00c81c8f57c` |
| `11_OPERATIONS.md` | 11003 | `fc63403f61ece23e0ceb8c559a702ad0294acdc1de3c6cada958bfbd2ed7c205` |
| `12_DECISIONS_CHANGELOG.md` | 8768 | `85b08d3a127e7c4e1bcdea00dfbca5d5f725060dcad4cf04ff4815ffb41181f0` |
| `13_SOURCES.md` | 16444 | `462b44a58cee74294020841fa4a9d15bb2c5b2bd7c01fd95ad92dec8fdb2e264` |
| `14_DOC_QA.md` | 4572 | `dc299a007b0c5f3c6c17db2f5ebcf1aecf5cbdcdc8cc942eab259a47ff83e18b` |
| `AGENTS.md` | 2624 | `00bb9cd068fa14438e47fc74d770cff0e5eee85da432c9181489f435b7adc60a` |

### R1的8份审查输入

| 原文件 | 字节数 | SHA-256 |
|---|---:|---|
| `00_README.md` | 2797 | `aee9c873d44c1eba5ab03372fcd7b02038d443a3fd0cc692c57c66eef2f4ad27` |
| `01_ADVERSARIAL_REVIEW.md` | 40856 | `cd5f62f69212aed27e2c709718dfa2dd62f315421ed263e38b6a833ec87ac7ad` |
| `02_CONTRACT_PATCH_CANDIDATE.md` | 20050 | `54100f4d11ee585d3d332be867703a988f9aa21f3fae2d77a5083f1f95ffe5d9` |
| `03_ADVERSARIAL_TEST_PLAN.md` | 10350 | `f05ab2547f420fb0b7a837e2db6cc8cbb1621451b8be92452dc555bf679838d6` |
| `04_VERIFICATION_RESULTS.md` | 8991 | `8ef7a51705fb464df0521da067dd892e1848956a7ba3fa229af297790ecd8fb1` |
| `05_EVIDENCE_AND_SOURCES.md` | 17878 | `ca8da42d8b67a794a9797f34c9b28721d55779146b77060012d841560699a4c2` |
| `06_REPRODUCE.md` | 16468 | `53da94d807fe6198b4f42774a98e45f3c1322922537140bfb05af5b3a1536ec5` |
| `07_MANIFEST.md` | 3877 | `2bb77d532329d08eb5b70cd86c45489428c2228f84caca82add2aa95773712eb` |


## 4. SRVF历史定向源码证据

固定提交：`fc7471efadaf22834d5effb0b92a9fdd034bea2b`。以下范围继承先前读取记录，不代表本轮再次打开源代码、不代表覆盖全仓，也不证明生产环境采用相同提交。复用前应以这个提交或重新选定的明确提交做实现验证。

| 编号 | 路径/来源 | 原证据支持什么 |
|---|---|---|
| R00 | [commit快照](https://github.com/BA7IEE/srvf-nest-api/commit/fc7471efadaf22834d5effb0b92a9fdd034bea2b) | 固定提交快照；不使用漂移的main作为已审版本 |
| R01 | [package.json](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/package.json) | 版本0.72.0和依赖/脚本声明，不是ONCE当前生产锁文件 |
| R02 | [COPYRIGHT.md](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/COPYRIGHT.md) | 未授予通用开源许可、第三方与组织数据边界的仓库声明 |
| R03 | [src/app.module.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/app.module.ts) | 模块装配/依赖，前轮选择性阅读，不等于全部实现可复用 |
| R04 | [CODEMAP.md](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/CODEMAP.md) | 模块导航及AI占位；文档计数非本轮实测 |
| R05 | [src/modules/storage/storage.module.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/storage/storage.module.ts) | Storage对数据库、权限和审计的依赖 |
| R06 | [src/modules/storage/providers/cos.provider.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/storage/providers/cos.provider.ts) | 已读1–180行；签名能力、内存buffer路径和范围限制 |
| R07 | [src/modules/integration-idempotency/integration-idempotency.service.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/integration-idempotency/integration-idempotency.service.ts) | 事务幂等/回执与摘要实现，需ONCE适配 |
| R08 | [src/modules/authz/authz.service.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/authz/authz.service.ts) | 前部判权与救援主体/组织/考勤约束耦合 |
| R09 | [src/modules/audit-logs/audit-logs.service.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/audit-logs/audit-logs.service.ts) | 前轮1–145行；事务审计和范围查询，不等于全文件审计 |
| R10 | [src/modules/notifications/notifications.module.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/notifications/notifications.module.ts) | 通知Outbox与生日/SMS/微信等业务耦合 |
| R11 | [src/modules/ai/README.md](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/ai/README.md) | 明确没有AI运行时；无AI核心可运行的边界 |
| R12 | [src/modules/notifications/notification-outbox.worker.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/notifications/notification-outbox.worker.ts) | 租约/续租/失败路径；不证明远端请求恰好一次 |
| R13 | [docs/ip/PROJECT-ORIGIN.md](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/docs/ip/PROJECT-ORIGIN.md) | 项目来源历史记录；文件比对未在本轮复跑 |
| R14 | [src/modules/auth/auth.module.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/auth/auth.module.ts) | 短信/微信/企微/JWT装配，不是独立ONCE会话模块 |
| R15 | [src/modules/storage/storage.interface.ts](https://github.com/BA7IEE/srvf-nest-api/blob/fc7471efadaf22834d5effb0b92a9fdd034bea2b/src/modules/storage/storage.interface.ts) | 对象locator/受限读取；缺通用copy/multipart声明 |


前轮工具返回的三项blob指纹如下，仅保留其历史证据；本轮没有重新下载字节比对：

| 来源 | 历史blob SHA |
|---|---|
| R07 幂等服务 | `ad059be2b5e55936b3842134ba6d2ca1af6d29b5` |
| R12 Worker | `cdc35118a8a0300db9b6c8595b5a2446ba163413` |
| R15 Storage接口 | `597977d6067b844cd9fc5a565d41f23eb323afae` |

## 5. 继承的技术与市场研究

| 编号 | 资料 | 当前使用边界 |
|---|---|---|
| H-JCS | [RFC8785：JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785.html) | 统一摘要的协议参照；once-jcs-v1尚待选实现和测试，不宣称已兼容 |
| H-CSV | [OWASP：CSV Injection](https://community.owasp.org/attacks/CSV_Injection) | 保留原A19背景；当前CSV下载延期，不将JSON导出描述为CSV漏洞修复 |
| H-AUTH | [OWASP：Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | 最小授权和资源读取审查参照，不证明本系统控制有效 |
| H-UPLOAD | [OWASP：File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | 文件处理边界参照，不能代替实际Provider/解析器验证 |
| H-PG | [PostgreSQL：Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)与[Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) | 历史官方资料，current可能漂移；开发锁定数据库版本后复验 |
| H-MARKET | v0.2的W01～W07：StudioBinder、Casting Networks、ResourceSpace、Frame.io、Mediaslide、Syngency、Directus | 仅承接前轮市场参照；本轮未试用、未核对套餐/价格，不形成采购推荐 |

以前的Google/AnqiCMS/公开缓存研究不构成当前验收依据；没有在本包继续细化官网协议。重启对外模块时应重新核实，不依赖旧研究直接启用。

## 6. 不从证据外推的结论

未测量节省工时比例、真实搜索质量、人才入库量、单位成本、服务器负载或AI正确率。12中的数值是待试点校准的初始建议；14只包含真实文档检查。不得引用本包宣称已完成代码抽取、真实供应商适配或内部上线。
