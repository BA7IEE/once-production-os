# 恢复批准默认阻断：本地实现与验证记录

基线为 Draft PR #41 的 `25130290c29ef6686d61e8843ed12c0e5c825cb8`。本文记录该基线上的本地改动，不是远端 CI 结果；测试时 `packages/core/src/recovery.ts` 的 SHA-256 为 `31e4b49e7cbc16282551feac8a31a4025777dd02e8813e2021759d9bd3588491`。没有合并、部署、启用停止开关或连接真实供应商。

## 行为和兼容性

恢复检查在现有本地检查之外增加 `RECOVERY_TRUST_EVIDENCE_UNAVAILABLE`。诊断仍可运行，记录检查仍可保存带阻断项的报告，但它们不能表明恢复已经可批准。恢复批准在首次写入前强制拒绝；没有环境变量、操作员声明或自称已验证的输入可以解除阻断。原有本地身份、证据、增量和状态变化检查仍参与诊断。

这是一项有意的不兼容变更：包括旧备份和旧检查报告在内，当前实现均无法成功批准恢复。要安全解除阻断，仍需可验证且独立的最新见证、源端停写、同一一致性快照和恢复目标绑定，以及对应的运维部署和故障处置方案；本轮合成测试不能替代这些条件。批准后的访问及批准写入后审计失败回滚分支目前没有可信的可达路径，不得称为已验证。

## 实际执行结果

- 在受管临时目录中运行完整 Core：**1065/1066，1 失败，0 跳过**。失败是保留的旧合同：它要求先到达批准写入后的审计失败，而新合同在写入前拒绝。见 [Core 汇总](evidence/once-recovery-guard-20261112/core-summary.json) 和[脱敏失败输出](evidence/once-recovery-guard-20261112/core-recovery-failure-redacted.tap)。
- 真实隔离 PostgreSQL 合同：恢复隔离与人才维护各通过；审批合同中的拒绝及状态核对已执行，旧的成功批准断言按原样失败，其后的批准后 HTTP 断言未执行。见[恢复](evidence/once-recovery-guard-20261112/pg-recovery.tap)、[审批](evidence/once-recovery-guard-20261112/pg-approval.tap)和[人才维护](evidence/once-recovery-guard-20261112/pg-talent-v2.tap)的脱敏 TAP。
- 同一代码指纹下，默认阻断 PostgreSQL 专项完成 7 组；停止与恢复 PostgreSQL 专项完成 11 项。二者使用受管隔离库和合成资料，不是供应商或生产验收。
- `pnpm typecheck`、`pnpm contract:check`（381 条请求契约）、`pnpm review:static` 和 `pnpm build` 通过。构建有既有体积提示。所有上述重型运行的已登记资源核对为 `ZERO_RESIDUE`，各项结果及资源记录摘要见 [results.json](evidence/once-recovery-guard-20261112/results.json)。
- 首次完整 Core 启动使用系统 Node 24，与依赖的 Node 22 原生模块 ABI 不匹配；该次中止且资源归零，不计入产品结论。随后使用 Node 22.22.3 完整执行上述结果。

完整 Core 由仓库 `scripts/run-core-tests.mjs` 的副本执行：仅将输出路径改到本轮证据目录，测试选择、顺序、命令与超时保持一致；受管 supervisor 将临时目录限制在本轮登记的资源中。PostgreSQL 合同通过 `scripts/test-recovery-contract-pg-20261112.mjs` 执行；现有测试文件和原有断言未在执行时改写。

公开包中的 7 组、11 项及构建／类型检查仅提供结果和资源摘要，不包含全部原始输出或逐项证据，不能据此独立重放或复核全部观察。PostgreSQL 合同的原始输出只保留摘要，脱敏 TAP 与原输出的转换不能仅凭摘要独立证明；源码单文件指纹也不代表依赖快照。

## 原失败与剩余工作

较早的本地候选运行记录为 44 项中 6 通过、38 失败。部分失败来自旧合同期望无阻断或批准成功，另外一些是前置阻断使原有负例无法继续触达。该候选的[原始失败输出路径脱敏及行尾空白整理副本](evidence/once-recovery-default-deny-20261112/legacy-core-contract-redacted.tap)保留全部 38 项失败；原件 SHA-256 为 `aabc06310d4a2304c573282a4397c264ec5354016a749ebb2e2a9ec94603ad14`，脱敏及空白整理副本为 `52ed2088d37fdc479ae43ca1e4e3f33301f70afae869a4d5291b094f6a886406`，二者字节不同。后续本地版本重新触达了既有的身份、证据、冲突和状态变化负例；批准后审计回滚仍未触达，不能以伪造见证补齐。

真实独立见证、源端停写及快照绑定的生产实现、真实认证和 COS、物理设备、生产部署均为 **NOT_RUN**。新提交的远端工作流须按该提交 SHA 单独核实，不能继承本地结果或父提交 CI。

父提交的远端历史失败仍保留：[browser-resume 首次作业](https://github.com/BA7IEE/once-production-os/actions/runs/43052841184/job/130634329603)和[另一次工作流的第二次 acceptance 作业](https://github.com/BA7IEE/once-production-os/actions/runs/43052841043/job/130643540937)均在系统依赖安装阶段遇到 Ubuntu 软件源 DNS 解析失败，浏览器断言未启动；这不代表产品断言通过或失败。不得以本地测试覆盖这些历史失败。
