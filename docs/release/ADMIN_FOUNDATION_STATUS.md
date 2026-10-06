# ONCE Foundation 验证状态

- 基线：main 3d11713；分支 codex/once-admin-foundation。
- 本地前端类型：PASS。
- transport、目录状态、表格解析/审核选择：31/31 PASS。
- Foundation AST 准入：PASS。
- 本地 build / API / PostgreSQL / browser / preview：NOT_RUN（Swap >4GiB）。
- GitHub Actions：待本轮提交触发，不使用旧 head 的结果。
- API、业务模型、迁移：无改动。
- 生产、供应商、真人验收：NOT_RUN；未合并、未部署。

代码及适配限制见 [Foundation](../design/ADMIN_FOUNDATION.md)。预发布 ProComponents 版本必须经本轮类型、build 与真实浏览器验收；主要模块共享模式已迁移，复杂业务控件保持原生结构。
