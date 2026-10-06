# ONCE Admin Foundation

2026-10-06。基于 main `3d11713`，独立 `codex/once-admin-foundation`。本轮仅展示层和验证入口，API、业务数据、权限模型、迁移均保持既有契约。

## 品牌与信息密度

ONCE 影像制片工作台采用暖白纸面、浅灰结构、墨黑内容、低饱和深钴蓝操作色。字体 Avenir Next / PingFang SC；中文以系统已有字体回退，不请求外部字体。细边框、6px 圆角、紧凑行距；蓝色用于可操作入口和选中状态。成功、警告、错误保留语义色与文字，不只靠颜色区分。

token 权威源为 `apps/admin-web/src/foundation/theme.ts`。所有路线通过 AdminProvider 注入 AntD theme；CSS 负责保留的原生复杂控件以及 Shell。品牌图标由内联 SVG 绘制，展开与折叠均显示。桌面 228px / 72px 导航；窄屏隐藏折叠导航，顶部按钮可展开。

## 组件与边界

| 模式 | Foundation 入口 | 领域责任 |
| --- | --- | --- |
| 工作空间 | AppShell + AntD Menu / Breadcrumb | 原权限过滤、原导航函数的离开确认 |
| 页面标题 | PageTitle + PageContainer | 标题、说明、现有操作 |
| 列表 | AdminTable + ProTable | 数据请求、筛选、排序、分页、行内动作、跨页选择 |
| 表单 | AdminForm + ProForm | 原生 required/min/max/pattern，原 ref、onChange、onSubmit、快照与重试 |
| 详情 | AdminDescriptions + ProDescriptions | 当前可见字段、脱敏和来源说明 |
| 反馈 | ErrorBox / Tag / Empty / Modal / Submit / Pager | 原错误语义、busy 锁、会话过期、关闭守卫 |

AdminTable 是迁移适配层：从已有 JSX 的表头与单元格建立 ProColumns，保留稳定行 key、单元格和行事件。禁用 ProTable 的自动查询、默认筛选、自动分页和工具栏，避免对当前页数据另行排序或二次分页。领域排序仍使用原请求契约；不新增不存在的排序 API。colSpan/rowSpan 或无标准 head/body 的表格保留原生语义，显式标记 `data-foundation-exception`。

AdminForm 保留一个原生 form，ProForm 设置 component=false、submitter=false，不接管命令提交。Form ref 是 React 19 ref 属性，传递到原 form。现有 Field 保留稳定可访问标签与描述，复杂多选/上传/职业范围控件没有改成新的数据模型。

Modal 使用 AntD 焦点管理、Escape 与关闭按钮；mask 不关闭。传入原 onClose，业务模块的 busy/unknown/未保存保护仍适用。错误反馈保留冲突说明与请求编号。

## 模块覆盖

工作台、人才目录和详情、职业资料/量尺/联系方式/来源依据、候选清单、作品及项目、审核、交接、素材与上传、导入/补齐、导出、合并、删除、成员/范围、字典、审计、账号、语言和 AI 界面共享 Provider、Shell 和反馈。30 个原界面文件的原生 form/table/dl 已迁至适配入口。照片卡片和复杂专业编辑器保持既有交互，以统一 token 和组件容器呈现；此轮没有逐页重写业务交互。

`pnpm review:foundation`（同时接入常规 `review:static`，后续模块 CI 也必须执行）用 TypeScript AST 检查所有 TSX，拒绝 Foundation 目录之外新增原生 form/table/dl，并打印每个模块的组件覆盖。新模块应优先直接使用 ProTable/ProForm/ProDescriptions 或共享适配入口，不复制 Shell、颜色或反馈实现。新增例外须写明数据/权限原因和浏览器验证范围，不能靠 CSS 另起一套页面规范。

## 依赖兼容与风险

官方 npm 元数据：AntD `6.6.5` 支持 React >=18；ProComponents 稳定版 `2.8.10` peer 仅为 AntD 4/5，beta `3.1.15-5` 明确 peer AntD ^6、React >=18。因此锁定后者，不能升级为不兼容的 stable 标签。参考：[官方仓库](https://github.com/ant-design/pro-components)、[官方 npm](https://www.npmjs.com/package/@ant-design/pro-components)。beta 有接口/样式变动风险，类型与真实浏览器回归通过前保持 Draft。安装禁用脚本并限制并发，CI 的 Prisma 生成只作用于 runner。

## 验证与未验边界

本地轻量：前端类型检查通过；31 项既有表格解析、审核选择、transport、目录状态专项通过；Foundation AST 准入通过。API/业务代码、Prisma 及生成契约未变。

本机 Swap 超过项目 4GiB 门限，未运行本地 build/API/DB/浏览器，没有可用本地应用预览 URL。专用 Actions 使用标准 ubuntu-24.04，一个串行 job，原有适用工作流和门禁保持不变，专项不豁免完整回归；安装、完整类型、build、生命周期和真实 PG/Chromium 业务流程使用 synthetic 记录。超时35分钟，过时运行取消，JSON 证据保留3天。本分支的全部工作流 artifact 均排除截图，原有必需回归不跳过；其他分支 artifact 策略保持默认。截图在 runner 内留存，不上传；本机截图不上传 Library。

浏览器需确认 1024/1280/1440 宽度、折叠品牌/菜单、标签和备注对比、筛选分页与跨页选择、校验保存、详情返回、加载空错状态。既有拒权、未知结果核对、部分字段不可读保存、响应丢失、未保存离开和本人端维护回归不删除。真人无提示使用、真实供应商、生产、持久开发库均 NOT_RUN。Draft 不等于验收完成。

## 严格CSP与静态组件样式

服务端现有 `style-src self` 保持不变。AntD运行时style标签会被该策略拒绝，不能只用无样式DOM验收。`build:web` / `dev:web` 先用官方cssinjs 2.1.2的 `createCache`、SSR与 `extractStyle` 烘焙Provider和共享AntD/Pro模式，再由同源 `/once-components.css` 加载。主题关闭随机hash并固定cssVar key为once-theme，确保构建与浏览器匹配；生成文件不入版本库。官方说明：[Server Side Rendering / Whole Export](https://ant.design/docs/react/server-side-rendering/)。新增组件必须加入烘焙清单并在真实CSP下验收。

## 离线设计评审预览

`design-review.html` / `src/design-review.tsx` 为独立虚构预览入口，复用实际Shell、token和共享Pro模式，不打包进正式main入口。人才、作品、项目、审核等导航与表单/详情仅使用明确标注的内存虚构记录，不连接API、不写库、不代表权限或业务验收。正式应用仍需后端及登录。

Foundation Actions额外云端构建此入口，与正式前端一起生成 `once-public-frontend-<SHA>`，仅HTML/JS/CSS和带逐文件SHA256的provenance JSON，保留1天，不含秘密、真实资料、截图或录像。下载核对SHA/摘要后可用单个回环静态服务查看 `/design-review/`；没有本地build。云端Chromium验证页面和样式可见、真实共享导航和内存交互，单独标记STATIC_REVIEW_VISIBLE，不能替代真实业务浏览器检查。
