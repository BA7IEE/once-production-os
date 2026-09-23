# WP1 首轮 CI 后的接力修复

首轮 head `b6935ba` 对应运行 `35893033806`：旧导入/交接/媒体浏览器及真实 PostgreSQL 通过，新 `browser-production` 在“新增作品 / 制作归属”的精确标签定位处失败。不是数据库未启动，也不能认定整个作品旅程已经通过。

问题在共享 Field：隐式 label 包住 select 和提示后，可访问名称混入选项/提示，精确的“制作归属”无法定位。现将原生 input/select/textarea 的名称显式关联到可见标题，提示放入 aria-describedby；保留自带控件 ID、附加描述及 disabled 语义。组件抽至 field.ts 后仍由 ui.tsx 导出，旧复合控件维持原行为。本修复不宣称全站无障碍已验收。

新增 `tests/ui/field-accessibility.test.mjs`：六项真实 Chromium 组件验收，含原错误结构的反向对照（确实无法按精确名称定位）、选项改变后名称稳定、提示描述、标签点击聚焦、多个字段唯一引用及禁用控件。没有改成模糊选择器，也没有删掉业务断言。新测试接入 browser-production，五项原 CI 全部保留。

本轮未改动领域权限、迁移、依赖或锁文件。当前已在隔离编辑环境执行六项组件测试；本提交的完整 CI 结果仍须由固定 head 的最终运行确认，不能沿用首轮部分成功记录。

原规格和本批范围仍见 [WP1_WORKS_PROJECTS.md](WP1_WORKS_PROJECTS.md)。本补记只登记实现修复与证据，不修改一期范围。
