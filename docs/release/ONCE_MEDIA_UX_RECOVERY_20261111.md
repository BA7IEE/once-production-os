# ONCE 素材 UX 与上传回执恢复验收（2026-11-11）

## 版本与范围

本轮基于 PR #41 的 `1c492fbebaf558aac6ab9763be979a70eff9c408`，修改本人素材界面与原请求核对，不含迁移、生产部署或合并。结果以本文源码指纹绑定到被测本地工作区；远端 CI 必须按最终提交 SHA 单独核对，不能沿用基线结果。

测试使用受管隔离 PostgreSQL、Nest API/Worker、真实 Chromium、合成账号和图片、本地文件存储及本地 COS SDK 替身。没有访问真实 COS、真实认证或通知服务，没有使用真实个人材料。

## 发现与修改

- 素材操作区分正在提交、结果待核对和明确拒绝，清除过期提示，恢复键盘焦点，并让重复的移除按钮关联对应文件名。上传状态读取中断时提供同页核对入口，未完成的原上传可继续处理或取消。
- 同页完成回执核对后旧文件仍被选择、上传按钮可用；创建上传响应丢失后也有相同风险。现核对原上传并阻止新建重复记录；只有当前上传被读回为终态或已提交处理时才清除其文件选择。
- 上传中切换草稿会让旧请求的状态污染新草稿。现上传操作期间阻止切换，并在组件层按草稿隔离；重新打开时，服务器的 OPEN、RECEIVING、UPLOADED 上传会阻止再次新建，直到处理或取消。RECEIVING 的真实中断时序未运行。
- 明确拒绝与网络结果未知分别提示。既有后端对过期或额度变化可能同时拒绝完成和取消，界面不保证所有情形均可自助恢复，必要时需联系 ONCE。
- UNKNOWN 清理状态仍明确显示“待核对”，清理确认前继续占用额度；本轮不宣称物理删除完成。

## 实际验证

- 上传完成响应丢失：10/10 个结构化检查通过。在丢弃响应前，先让本地服务返回 200，并在数据库确认 `UPLOADED → QUEUED`、版本恰好加一和唯一回执指向原上传。刷新后读取原回执，同页重放使用原幂等键；回执 HTTP 状态、目标和版本匹配，重放期间上传数、字节、素材数及版本不变。Worker 停止期间核对版本，恢复后四份不同合成上传各有一份素材。额度按当前后端规则计算为未清除上传的 `expectedBytes` 之和；这不是单独的额度准入接口测试。
- 控制场景注入明确 422：原上传保持 `UPLOADED`、没有完成回执或结果未知按钮，页面提示查看原上传；实际点击原上传的后台处理后，仍只增加一次版本、没有重复占额。
- 文件 PUT 已成功但状态 GET 中断：同页核对读回原上传，刷新后仍禁止新建，随后处理原上传成功。创建上传的响应丢失、同页/刷新核对、取消原记录、焦点恢复及切回草稿：6/6 个结构化检查通过；使用原回执，不重复创建或扣额。
- 当前源码 1366×768 相关 UX 定向回归 15/15 通过，包含键盘核对、UNKNOWN 提示、网络中断后阻止重复上传和不相关文件选择保留。此前五视口 18/18 适用于其记录的前一版本素材文件 SHA `cdd747c1...`，不能冒充当前源码的五视口结果。指定点位命中不等于完整无障碍或真实手机验收。
- 当前源码本地 build、typecheck、contract:check、review:static 通过；`portal-command` 与 `portal-draft-state` 定向测试 13/13 通过。本轮没有重跑全部 Core 或完整浏览器矩阵；旧入口相关远端回归须以新 SHA 的 CI 为准。

命令（仓库根目录串行执行，先 `source /workspace/.once-cloud/env.sh`）：

```bash
ONCE_RUNNER=managed-linux /usr/local/bin/docker-init -s -- pnpm build
ONCE_RUNNER=managed-linux /usr/local/bin/docker-init -s -- node scripts/heavy-task.mjs pnpm typecheck
ONCE_RUNNER=managed-linux /usr/local/bin/docker-init -s -- node scripts/heavy-task.mjs node --experimental-strip-types --test --test-concurrency=1 tests/core/portal-command.test.ts tests/core/portal-draft-state.test.ts
pnpm contract:check
pnpm review:static
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR=/absolute/disposable/evidence CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-upload-create-loss-20261111.mjs
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR=/absolute/disposable/evidence CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-upload-complete-recovery-20261111.mjs
ONCE_RUNNER=managed-linux ONCE_UX_VIEWPORT_ONLY=1366 ONCE_UX_SUBJECT='uncommitted local working tree' ONCE_ACCEPTANCE_EVIDENCE_DIR=/absolute/disposable/evidence CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-cos-ux-incremental-20261111.mjs
```

被测文件 SHA-256：

```text
9fb9840c067969160046a33bd741a5377dd8627c1e8b7a6d058de370feee54f6  apps/admin-web/src/talent-media-staging.tsx
69fe74a02576e137b00cf459b3d75c3925ec3e9a9605143632edd638feb7fa14  apps/admin-web/src/supplier-profile-ui.tsx
9625a272458f9695a84bed2d40a67dd248efea4f19c0fba570e10dd028249bc8  apps/admin-web/src/talent-maintenance-ui.tsx
6808b2c43c0c30f5a0d75cc7359c27a32f7c7cb38a2733da46161a7b481a0b36  tests/acceptance/browser-upload-complete-recovery-20261111.mjs
04df648abacbe3dfe8a5775df0569d20276e5c91290e8053b7b26815d5dbb2f5  tests/acceptance/browser-upload-create-loss-20261111.mjs
87517ae52582abecd00dd07ac1fb7b84523000b062faeee106592b0b4fa4f198  tests/acceptance/browser-cos-ux-incremental-20261111.mjs
```

## 资源、失败与未测

最终创建专项 `c2fcb23d2bfed3d781fb27ff`、完成专项 `a7ce65bd9486bb13c900cf00` 和 UX 回归 `0a9c6e1dfac4281008d444d3` 均为 PASS / ZERO_RESIDUE。专项基线 `ab2213291d4c1c6ec21ac1c5` 为 FAIL / ZERO_RESIDUE；它复现了同页核对后旧文件仍可被重复上传，测试没有实际新建重复对象。精简结果及台账见 [evidence/once-media-ux-20261111](evidence/once-media-ux-20261111/)。

首次 UX 脚本因错误假设素材排序超时，原台账 `4f4443c6f4de72446fdb94f7` 保持 CLEANUP_FAILED。另一次拦截夹具挂起后主动中止的原台账 `80a96f46009486b9ced0dd9f` 也保持 CLEANUP_FAILED。两次分别在之后按登记的浏览器进程组、临时目录、容器精确名称及标签核实已不存在，并释放各自遗留锁；原台账和人工核对记录均保留，不能改写为首次通过。另有夹具时序及拦截不匹配失败，均保留本地记录，不能算产品通过。

真实 COS 物理删除及自动清理闭环、真实认证供应商、真实短信邮件、真实手机/微信与人工读屏器、真实材料和业务试点仍为 NOT_RUN。真实供应商验收需明确隔离测试租户、测试账号、独立桶或前缀、最小权限和费用上限。不能据本报告认定已正式上线。
