# PR-04A finalization：imported basis 与结构化秘密检测

日期：2026-10-02。当前修复范围仅两项；本地验证通过，最终CI绑定最终head后交冻结复核，PR #32 保持 Draft、未合并、未部署，不进入 PR-04B。本轮基线 d1e493622e29990455d5999d0113cfca8118f2ae，依赖 PR #31 aeaf49da7d5346785adac6df4e2d34321f9d92d2；历史实现与首次失败说明保持原样。

## 迁移72与合同

仅前向追加 `202610020004_imported_review_basis_shape`，迁移1–71保持字节不变；无新实体、新字段或伪造历史主体。新增 `imported_internal_review_basis_valid(jsonb)` 与 `basis_imported_internal_review_shape` CHECK，检查已有 SourceUseBasis.importedBasis 的 INTERNAL_REVIEW 分支。

列 basisKind 或 JSON version/basisKind 任一标识 INTERNAL_REVIEW 时，必须一致使用 INTERNAL_REVIEW，不能借 TALENT_CONSENT 行绕过。非 imported 的真实审核继续由迁移69的 FK / 延迟审核约束控制；历史引用仍为不可冒充的快照，不创建 ServicePrincipal / Submission / Attribution / TalentConsent。

JSON 必须精确包含且只包含：version、basisKind、providerServicePrincipalId、submissionId、sourceAttributionId、reviewerId、reviewBasisDigest、purpose、fieldScope、validUntil。版本为 internal-review-basis-v1；purpose 为 INTERNAL_DIRECTORY；4个引用按现有 rebuild UUID 规则；摘要为64位小写hex；fieldScope 为1–50个非空字符串，每项最多120个UTF-16单位；时间为合法日历、毫秒精度UTC形式。拒绝缺字段、JSON null、未知字段和任何 TalentConsent 字段混入，包括 consentRevision=0。

SQL 的数组/字符/日期检查与 ReviewBasisTransferSchema 对齐。rebuild 另提前拒绝 PostgreSQL JSON/text 无法存储的NUL字段字符。TALENT_CONSENT v1/v2 输入合同保持原样，两种合法历史分支均实测。

新 PG 专项直接写入坏 JSON，要求由本次 CHECK（而非无关 FK）拒绝；覆盖全部缺字段/null、错误类型/UUID/摘要/用途、空数组/空字符串/长度/非BMP字符、非法日历/时区、Consent混填、列/JSON分支伪装。测试还实跑保留71库升级72、旧行逐项一致、真实pg_dump/restore后约束有效且无虚构运行授权。证据：`artifacts/agent-ingestion-pr04a/finalization/imported-basis.json`。

## 秘密检测

统一 helper 为 `tests/support/secret-leak.mjs`，由原4个OTP浏览器脚本和新的Agent摄取浏览器复用。输入分为 RECEIPT / AUDIT / LOG / REQUEST / RESPONSE；扫描 receipt.result/body、audit.changedFields/detail、日志message/metadata、请求响应payload及其他未知内容字段。

仅对形状合法的UUID标识/命令键、hash/digest、时间戳、数字计数豁免OTP子串检测；正文message/body/detail不因看起来像UUID/hash而豁免。完整Bearer/receive/session token或secret的已知匹配不受这项豁免影响。额外检查authorization header、receive/access/session token字段及常见AWS/GCP/COS签名URL。验收从受控数据库只读收集真实receive token，仅在内存匹配，不导出uploads凭据。

日志chunk重新拼接，结构化日志与嵌套JSON使用既有严格JSON解析。重复字段或失败解析不会丢弃前面的秘密：回退扫描原文，同时识别Unicode/URL编码。matcher仅在内存闭包持有值；失败只输出 record类型、字段路径、secret类型，未知/恶意字段名也不会把秘密带入错误路径；不输出值、片段、摘要或验证码。

稳定反例证明旧整串includes会被合法UUID/hash/命令键/计数/时间戳误命中，新的结构化检测通过；receipt/audit/log及request/response正文中的OTP必须失败。Bearer、UUID形状receive token、authorization header、签名URL、编码/拆分/重复JSON字段和错误信息无秘密也有专项断言。

## 当前验证

| 检查 | 结果 |
|---|---|
| Core 全量 / 生成合同 / 类型 / 构建 / 静态门禁 | 689/689；pnpm verify及transport通过 |
| PostgreSQL 全量（本地14.19；CI16另核对） | 80个程序 / 170项 / 0失败 |
| 空库1→72、保留71→72、实际pg_dump/restore | PASS，旧行保持一致，新CHECK恢复后仍拒绝混填 |
| 原12组Browser + browser-agent-ingestion | 13/13 PASS，真实PG/Nest/Chrome；真实receive token检查再跑4条媒体旅程通过 |
| secret leak 专项 | 3组专项及浏览器实际guard通过，含假阳性/真泄漏、秘密类型和不输出秘密 |
| 最终SHA / exact-head CI14项 | 绑定最终PR描述与交付回复；不沿用d1e4936结果 |

实际结果和源码摘要见 `artifacts/agent-ingestion-pr04a/finalization/verification.json`、`core-report.json`和`browser-regression.json`。

完成所有本轮检查后，只进入开发冻结复核，不自行把PR-04全阶段或生产验收标为完成。

## 首次失败历史保留

基线d1e4936的CI36926840575 attempt1：13项通过，作品浏览器在页面操作结束后的 `recorded.includes(message.code)` 失败。原始日志未保留命中字段，因此不能证明当次是UUID/hash碰撞，也不把重跑通过宣称为已定位当次泄漏。该head attempt2为14/14通过；上述记录及原PR描述保持原样。本轮稳定反例证明并修复整串扫描的假阳性机制，历史Actions attempt1不删除。

首实现a79edae的CI36919823171因media-purge依赖安装超时取消的历史记录同样保留，不将那次未执行Browser标为通过。

## 边界

PROVIDER_VERIFIED=NOT_RUN；COS_PROVIDER_VERIFIED=NOT_RUN；MOBILE_DEVICE_VERIFIED=NOT_RUN；PRODUCTION_MIGRATION_VERIFIED=NOT_RUN；DEPLOYED=false。PR #31不修改。PR-04B/C/D未开始。最终代码级复核通过后才正式确认PR-04A FROZEN。
