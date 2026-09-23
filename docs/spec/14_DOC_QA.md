# ONCE Production OS｜本轮文档静态检查

版本：v0.3｜日期：2026-09-22｜当前范围：一期内部 OS + AI｜状态：文档已修订，产品实现和运行测试未执行

## 1. 本轮实际执行范围

此文件记录**文档静态检查**：读取本地输入、修订主稿、计算指纹、检查编号/关系/链接/示例并打包。没有运行ONCE业务代码、数据库迁移、SRVF构建、真实COS/AI、性能压测或恢复演练。上一轮有限对抗模型的结果没有复用为本轮产品PASS。

已直接回填整套主文档；不是在旧稿后附一句“官网先不做”。当前活跃基线只有本包，旧v0.2与R1文件不作为并行规格。

## 2. 本轮静态检查结果

| 检查项 | 结果 | 实际结果/边界 |
|---|---|---|
| 文件集与UTF-8读取 | PASS | 16份MD；无旧09_STATES_PUBLISHING.md、无非MD交付文件 |
| 版本头一致 | PASS | 16份包含统一v0.3和未实现说明 |
| 相对文件链接 | PASS | 53处指向现存文件；不声称远端URL在线或自动锚点均经验证 |
| 代码围栏配对 | PASS | 16份逐文件检查偶数围栏；不等于SQL/Mermaid编译 |
| 需求编号与当前范围 | PASS | FR-01～30均有唯一正式章节；22项当前，8项延期 |
| 当前需求都有工作包 | PASS | 当前需求有DEV归属；延期需求没有当前任务依赖 |
| 任务编号唯一 | PASS | DEV-00～DEV-11共12个工作包 |
| 工作包依赖无环 | PASS | 顺序：DEV-00 → DEV-01 → DEV-02 → DEV-03 → DEV-04 → DEV-05 → DEV-06 → DEV-07 → DEV-08 → DEV-09 → DEV-10 → DEV-11 |
| 需求任务引用有效 | PASS | FR表全部DEV引用均有正式工作包定义 |
| 落盘任务表完整 | PASS | 12个正式DEV行完整，历史D编号只作迁移映射 |
| 风险用例完整 | PASS | AT-01～24共24条；验收均未运行 |
| 52项历史验收追踪 | PASS | 52项均有当前/部分/延期处置，不整体记为通过 |
| 26项历史风险映射 | PASS | RT01～RT26均有当前或延期去向 |
| 19项审查发现处置 | PASS | A01～A19均回填/简化/拆分/延期，未宣称产品修复完成 |
| API清单唯一 | PASS | 95个操作；method+path与operationId均唯一 |
| 当前API无外部发布/门户 | PASS | 注册操作中无网站发布、客户分享或SEO接口；文字中明确延期的说明不误报 |
| 当前模型无延期专用表 | PASS | 按正式实体表行检查，无Publication/Share/Channel等一期运行实体 |
| JSON示例语法 | PASS | 1个示例解析成功；不证明DTO实现兼容 |
| 实现证据状态 | PASS | 代码/DB/Provider/AI/恢复测试仍NOT_RUN，文档检查不改变状态 |


## 3. 语义回填检查与限制

逐层核对当前范围：BRD不再以流量/获客衡量一期；MRD聚焦内部任务；FR-15内部候选、FR-22内部语言明确拆分；8组外部需求延期；12任务不依赖官网供应商；私有存储/AI/恢复保留当前必要控制；部署无CMS凭证；AGENTS禁止预建延期空模块。

原A01～A19有逐项处置，但SPEC_UPDATED只表示写入主文档；DEFERRED不是修复成功。52项历史验收和26项旧风险有迁移去向，不计作已执行测试。任何未来公开功能需重新评审当时的实现与授权，不继承“安全已验收”的错觉。

这些检查不能证明规格无遗漏、无矛盾或实现一定正确。特别是Provider字节限额、解析器资源开销、AI供应商幂等、资料使用依据和删除保留决定仍须在相关切片做实测或业务确认。

## 4. 输出文件指纹

以下覆盖除本文件外的15份MD。排除本文件以避免自引用哈希；最终ZIP还可另行计算SHA-256。每次修改任何主稿应重跑检查并刷新指纹，不能手动保留旧PASS。

| 文件 | 字节数 | SHA-256 |
|---|---:|---|
| [00_README.md](00_README.md) | 4563 | `c47d9b2aa9bea200c8cba373d5fa1159af12bf9e7d4a8221441db98e46e0244c` |
| [01_REVIEW.md](01_REVIEW.md) | 6492 | `096a4ece68f052796d88a1361b7ee92243b5340f84cace7d4adf6225e1098c68` |
| [02_BRD.md](02_BRD.md) | 7423 | `21e809f59b8a7bae190613cfe856b25f856b7971b6e52389814716d6f1dbc809` |
| [03_MRD.md](03_MRD.md) | 5975 | `f99a8f21564be0f9ed40e4a875031d5fb0c8fe0b0708b49e65a029d33a3ebe46` |
| [04_PRD.md](04_PRD.md) | 18588 | `b629d472d8d62616d1c444d5f478baab259d58dc0e85aa5338d7d24644ad2037` |
| [05_REUSE.md](05_REUSE.md) | 5275 | `e9a5c0f78ff1974f10472c6127227c62c3f0857d1ed68f84d23284c5842bffd5` |
| [06_DEVELOPMENT.md](06_DEVELOPMENT.md) | 11266 | `59ba26d4fc23d05d90e3c5c83c4421e1ed71b5b3f21f9eeaa2e30fc0da3f1110` |
| [07_DATA_MODEL.md](07_DATA_MODEL.md) | 15889 | `820541bc14431c2c7368bcb706c2d82f414f26d316fae55923d4c92ecacb5c25` |
| [08_API_PERMISSIONS.md](08_API_PERMISSIONS.md) | 18837 | `c79da569e9ac669a7d4aa4fbb8edc8feca1957d4bed761dda50c6e2bab4ced7d` |
| [09_STATES_WORKFLOWS.md](09_STATES_WORKFLOWS.md) | 10356 | `66c7ec2352a209b2e0a7bef786d285fe2f1e2c9b6ac5d525af5b778a013f6b4c` |
| [10_BACKLOG_TESTS.md](10_BACKLOG_TESTS.md) | 18868 | `c88af0a73d9bb829eb13d9948d51ee1156b72604997fbc85c9a9304d63e2e574` |
| [11_OPERATIONS.md](11_OPERATIONS.md) | 7559 | `6e4ef6fb36d0d4c488be1aa2fd175053687c81ed9e1d77523f3f7d9583851e45` |
| [12_DECISIONS_CHANGELOG.md](12_DECISIONS_CHANGELOG.md) | 7942 | `376959121f88d31035a666dc6c4591943bf940c1a828ae46e249e67e21b280e3` |
| [13_SOURCES.md](13_SOURCES.md) | 11019 | `0cc7d8c49c260bf1d629803748149e5b0b95a517d527e039511be6c43d1331fe` |
| [AGENTS.md](AGENTS.md) | 2227 | `b946dd42b36a21d7240652c3797e914263274acd3597c96ae040a1e787b603c3` |


## 5. 开发时仍必须执行

DEV-00锁定版本；DEV-01/02真实数据库身份/权限/事务并发；DEV-04最终字节与负载；DEV-07导出/删除/重建；DEV-08真实获准AI与未知请求；DEV-09独立恢复；DEV-10/11端到端和真实使用耗时。所有这些当前均为NOT_RUN。

没有官网、CMS、SEO、公开缓存或外部客户访问的本期上线门。内部AI不是延期模块，其关闭降级和启用路径必须分别验证。
