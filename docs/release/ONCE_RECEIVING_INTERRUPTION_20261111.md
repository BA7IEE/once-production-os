# ONCE 上传接收中断增量验收（2026-11-11）

## 版本和边界

以 Draft PR #41 的 `56f73354688a3c90ab139da94616d96319d7ca2b` 为基线，验收其后的工作区补丁。各结果中的 `head` 是测试时的基线提交，不冒充包含补丁的提交；最终专项和两项回归的被测源码及构建文件 SHA-256 在对应 JSON 中。最终提交和 CI 应按 Git 历史及该提交的 Actions 单独核对。此专项脚本尚未接入既有 CI，不表示远端 CI 自动执行了它。

所有场景仅使用登记的临时 PostgreSQL、Nest、Chromium、合成账号/图片、受控本地验证码网关和本地媒体存储。浏览器驱动真实界面；测试截获浏览器的 PUT，并以测试进程拥有的本地 HTTP 连接向 Nest 发送部分文件。先从数据库读到真实 `RECEIVING`，再中断这条连接；未通过 SQL 改写上传状态。截图为 390×844 合成视口，不代表真实手机或完整无障碍验收。

## 发现与修改

基线真实中断暴露三处提示问题：原标签在接收中显示可取消但按钮不可用；服务端记录的 `UPLOAD_INTERRUPTED` 被提示为文件格式问题；已读回 `FAILED` 后原标签仍保留结果未知提示。独立审查还发现并以延迟真实响应复现：旧 GET 已返回 `RECEIVING`，随后数据库变为 `FAILED`，旧响应晚交付，后续刷新出现终态与未知提示并存。

修复仅改本人素材界面：处理中使用中性说明；`UPLOAD_INTERRUPTED` 只说明本次上传未完成，不猜测具体原因；服务端已确认该上传终态后，针对该上传状态核对的旧错误、说明和按钮同步隐藏，再清理状态。其他来源的错误和未决请求不因此被隐藏；真实状态尚未确认时仍阻止新上传。首次修正依靠 effect 清理，MutationObserver 捕获终态和旧提示短暂并存；[该失败记录](evidence/once-receiving-20261111/transient-conflict-candidate.json)予以保留，最终修正同步处理显示。

## 实际结果

- **真实接收中断专项：15/15 PASS。** 一条部分 PUT 到达服务端并从数据库确认 `RECEIVING` 后，另开标签及刷新均看到原记录并禁用新上传；测试所属连接断开后，该记录为 `FAILED`、版本增加一次、无素材或完成命令回执，未清理记录仍占额度。明确失败后由用户主动重传，是另一条明确创建，旧记录的额度未提前释放。
- **取消与并发：PASS。** 第二条实际接收中的连接由另一标签取消，取消 HTTP 200、取消命令回执一条，随后断连的观察窗口及最终快照均保持 `CANCELLED`。另一条独立连接在取消成功后继续送完，服务端实际返回 409，最终状态和版本仍为已取消；该响应证明本地处理已结束。
- **响应与提示竞态：PASS。** 状态 GET 丢失时，即使数据库已失败，页面仍显示结果未确认并阻止选择文件；用户核对后才显示原上传终态，记录、额度和版本不重复增加。旧的 `RECEIVING` 响应在数据库变为 `FAILED` 后才交给浏览器；MutationObserver 覆盖终态行与旧 alert、状态说明、核对按钮的瞬间并存，最终均未出现。
- **额度准入：PASS。** 收紧隔离账号额度至五个合成文件的大小；五条未清理的失败/取消记录合计 16165 字节，尝试第六条时 HTTP 429 `TALENT_MEDIA_BUDGET`，没有新增上传或数据库命令回执，额度不变。额度取证为本地存储替身，不代表真实 COS 物理清理。
- **提前打开的旧标签：PASS。** 两标签在首个创建前打开；A 实际进入 `RECEIVING` 后，B 用旧草稿版本和新幂等键再次上传同一文件，HTTP 409 `REVISION_CONFLICT`，数据库仍是一条上传、3233 字节和一条创建命令回执，B 未发送文件内容。B 获得刷新提示，但不会自动刷新；手动刷新后显示原上传并阻止新上传。该结果不证明携带最新版本的新独立 API 命令会被全局去重，不应按文件名或哈希推断。
- **受影响的原请求恢复定向回归：完成响应丢失 10/10，创建响应丢失 6/6 PASS。** 类型检查、transport 类型检查、378 项路由契约生成检查、静态检查及受管构建通过。本轮未重跑本地完整 Core/浏览器矩阵。

命令在仓库根目录执行（各浏览器专项串行，`EVIDENCE` 为各自新建的绝对目录）：

```bash
source /workspace/.once-cloud/env.sh
ONCE_RUNNER=managed-linux /usr/local/bin/docker-init -s -- pnpm build
ONCE_RUNNER=managed-linux /usr/local/bin/docker-init -s -- node scripts/heavy-task.mjs sh -c 'pnpm typecheck && pnpm typecheck:transport'
pnpm contract:check
pnpm review:static
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR="$EVIDENCE" CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-receiving-interruption-20261111.mjs
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR="$EVIDENCE" CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-receiving-stale-tabs-20261111.mjs
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR="$EVIDENCE" CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-upload-complete-recovery-20261111.mjs
ONCE_RUNNER=managed-linux ONCE_ACCEPTANCE_EVIDENCE_DIR="$EVIDENCE" CHROME_EXECUTABLE=/usr/bin/chromium /usr/local/bin/docker-init -s -- node scripts/test-upload-create-loss-20261111.mjs
```

[脱敏结果、失败记录、资源台账及截图](evidence/once-receiving-20261111/)包含每次实际检查、版本和指纹。失败基线分别为 `99186847ef54d26b4c12d47f`、`98f023cb20c58f21cacd4def`、`c25b512ae8d4c373493ec5fc`，均为 FAIL / ZERO_RESIDUE；最终接收、双标签、完成回执和创建回执专项分别为 `d7137a10605ac3e5bf487fc9`、`14b5ff9539056c460dc6bf79`、`195380044c894ae47cac018b`、`f5a3ab43bccf79fe35a6c9e6`，均为 PASS / ZERO_RESIDUE。双标签较早的通过记录 `e896dc853bedc42ca95570d4` 同时保留；它缺少独立构建指纹，不替代加严后的最终记录。这是按各运行登记资源统计，不是对整台机器作全局零残留声明。先前 `4f4443c6f4de72446fdb94f7` 与 `80a96f46009486b9ced0dd9f` 的 CLEANUP_FAILED 原件和后续人工核对记录仍保留在 [先前证据目录](evidence/once-media-ux-20261111/)，没有改写成首次通过。

## 未执行与限制

真实 COS 访问、物理删除与自动清理闭环、真实认证服务/短信邮件、真实材料、物理手机和业务试点均为 NOT_RUN；需明确隔离测试租户、测试账号、桶或前缀、最小权限及费用上限后另行验收。数据库命令回执的检查不代表已检查或不存在其他安全意图日志。没有生产部署、合并或真实通知。此前 Actions 原产物下载遭 Forbidden，未换通道重试；PR 正文更新遭 GraphQL 弃用错误，未绕路修改。以上本地结果不能称正式上线。
