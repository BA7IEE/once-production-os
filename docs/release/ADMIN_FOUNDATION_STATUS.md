# ONCE Foundation 验证与交付边界

基线：main 3d117134f343ab382c52682bc57c1a1515472ec0；独立分支 codex/once-admin-foundation。实际代码与边界见 [Foundation](../design/ADMIN_FOUNDATION.md)。

## 准入与证据

最新提交的完整结论以 [Draft PR #39 Checks](https://github.com/BA7IEE/once-production-os/pull/39/checks) 为准：原有17项完整验收、core/业务流程门禁和Foundation专项均须通过，专项不豁免完整回归，旧提交的部分通过不能替代最新提交。

- 本地前端类型、Foundation AST准入、31项transport/目录状态/表格解析与审核选择回归已通过。
- 远端执行完整类型、契约、API/admin构建、31项专项、4项Pro组件SSR、资源生命周期及真实PostgreSQL/Chromium。SSR不代表浏览器验收。
- 提交 de40314d8f4f96bf1a6b6eb12644a01e4512adc2 的 [Foundation证据](https://github.com/BA7IEE/once-production-os/actions/runs/37408616405) 与 [core/业务流程证据](https://github.com/BA7IEE/once-production-os/actions/runs/37408616304) 均PASS。Foundation真实浏览器17项检查包括品牌折叠、1024/1280/1440桌面、360/390/430窄屏、首卡首屏、标签/备注4.5:1、筛选分页与跨页选择、详情返回、表单保存、未保存离开、拒权、未知结果核对、上传队列、作品/项目稳定URL、真实Worker导入和已关闭归属任务。该提交完整目录回归另外暴露了视口切换时的150ms Shell过渡溢出；最终Shell取消窄屏主区过渡，并在进入窄屏时折叠导航，保留原立即测量断言。
- 所有浏览器数据为SYNTHETIC，使用真实Nest/Worker/PostgreSQL和私有本地媒体。部分不可读字段场景使用受控读投影搭配真实写入和数据库验证，不能据此声称所有真实权限投影都已验收。AI供应商连接采用批准的测试适配器，不代表实际付费供应商验收。

## 展示层修复范围

共享模式覆盖30个界面文件。API、业务模型、权限模型、数据结构、迁移均无改动。保留请求快照、原样重试、离开确认、拒权和会话过期语义。

严格CSP保持原style-src self：构建烘焙AntD/Pro组件CSS，同源加载，验收检查样式文件及真实Menu计算样式，避免把无样式DOM当作通过。弹窗门户继承Foundation；嵌在滚动body内的footer使用静态流，避免挡住确认框。Pager启用AntD响应尺寸并允许上下文换行。语义标签使用不透明背景及深色文字；关闭验收定位真实button。

## 未验边界与资源约束

- 本地build / API / PostgreSQL / browser / live preview：NOT_RUN。先因Swap超过4GiB，Mac人工重启后继续遵守不启动服务、所有重型验证放到GitHub的指示；没有本地应用预览URL。
- 真人无提示使用、实际供应商、生产、持久开发数据库：NOT_RUN。未运行真实迁移/seed，未合并、未部署。
- ProComponents 3.1.15-5是beta，锁定官方AntD6兼容peer；版本与样式变动风险仍存在。
- 本分支附件排除截图及录像，JSON检查/资源证据保留3天。本机截图不上传Library。早期附件路径错误导致合成视觉目录上传；已核对本任务分支及祖先SHA并删除24个误上传目录附件，保留JSON资源日志及其它任务证据。
