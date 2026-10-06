# ONCE Foundation 验证状态

- 基线：main 3d11713；分支 codex/once-admin-foundation。
- 本地前端类型：PASS。
- transport、目录状态、表格解析/审核选择：31/31 PASS。
- Foundation AST 准入：PASS。
- Pro模式服务端渲染：3/3 PASS（不代表浏览器验收）。
- 本地 build / API / PostgreSQL / browser / preview：NOT_RUN（Swap >4GiB）。
- GitHub Actions：Draft PR #39；首次真实浏览器暴露 AntD 两字按钮自动空格，已修复。当前完整及专项工作流以最新 head 为准，旧 head 结果不作为完成证明。
- API、业务模型、迁移：无改动。
- 生产、供应商、真人验收：NOT_RUN；未合并、未部署。

代码及适配限制见 [Foundation](../design/ADMIN_FOUNDATION.md)。预发布 ProComponents 版本必须经本轮类型、build 与真实浏览器验收；主要模块共享模式已迁移，复杂业务控件保持原生结构。
