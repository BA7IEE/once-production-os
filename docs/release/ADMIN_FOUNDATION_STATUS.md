# ONCE Foundation 验证状态

- 基线：main 3d11713；分支 codex/once-admin-foundation。
- 本地前端类型：PASS。
- transport、目录状态、表格解析/审核选择：31/31 PASS。
- Foundation AST 准入：PASS。
- Pro模式服务端渲染：本地原3项 PASS；新增平铺详情/零值回归后，远端4/4 PASS（不代表浏览器验收）。
- 本地 build / API / PostgreSQL / browser / preview：NOT_RUN（先因Swap >4GiB；Mac人工重启后遵守不重启服务、全部重型验证移到GitHub的指示）。
- GitHub Actions：Draft PR #39；首次真实浏览器暴露 AntD 两字按钮自动空格，已修复。当前完整及专项工作流以最新 head 为准，旧 head 结果不作为完成证明。
- API、业务模型、迁移：无改动。
- 生产、供应商、真人验收：NOT_RUN；未合并、未部署。

代码及适配限制见 [Foundation](../design/ADMIN_FOUNDATION.md)。预发布 ProComponents 版本必须经本轮类型、build 与真实浏览器验收；主要模块共享模式已迁移，复杂业务控件保持原生结构。

## 远端复验原则

Draft PR [#39](https://github.com/BA7IEE/once-production-os/pull/39) 保留原有完整验收、core与业务流程门禁，并新增Foundation专项。原按钮导航已迁为Menu语义，业务断言与真实PostgreSQL/浏览器保持；旧提交失败不能用其它提交的部分通过替代。主要修复涵盖中文按钮文字、导航图标可访问名称、原分页上下文、响应式Shell作用域/宽度收缩、弹窗门户样式、详情平铺dt/dd与首屏密度。截图及录像保留在执行机器且不上传；本分支云端仅留JSON检查证据。

CSP真实证据发现运行时组件style被现有策略拒绝，修复改为构建烘焙同源CSS，未修改API或CSP。复验额外要求CSS成功加载及Menu计算样式生效。一次错误附件路径导致本分支合成截图/录像上传，核对分支与祖先SHA后已删除24个本任务视觉目录附件；JSON资源证据保留，所有上传入口已修正为多行排除。

提交1d42cc0远端确认静态组件CSS生效：实际弹窗层级1000、来源选择点击成功，14项完整浏览器门禁已通过。剩余目录360px溢出、实际标签对比和关闭控件定位兼容继续修复；不是整体PASS。窄屏Pager启用AntD响应尺寸并允许上下文换行，语义标签采用固定不透明背景与深色文字；关闭验收定位真实button而非同时匹配button和图标span。

AI真实验收补充发现嵌在滚动body内的原sticky footer盖住确认checkbox；统一弹窗footer改为静态流且移除负边距，保留确认、预览、幂等提交逻辑。
