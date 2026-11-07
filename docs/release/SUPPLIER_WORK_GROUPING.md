# 供应商作品候选整理

日期：2026-11-07（北京时间）。沿用 `codex/supplier-library-v1` 工作区，响应“继续打磨”。本次补齐同一项目分散在 PDF 多页、多个处理批次或不同文件时的整理流程。此前材料自动分批的独立证据保留在[整份材料记录](SUPPLIER_DOCUMENT_BATCHES.md)。

## 实际行为

材料处理完成后，H5 把所有作品候选集中展示，显示职业、品牌、时间、文件名、页码、引用原文及图片加入进度。供应商先导入所需图片，再勾选属于同一项目的候选，选择“新建一个作品案例”或补充到已有新案例草稿。是否属于同一项目由本人确认。

新案例采用首个所选候选的文字作为起点，收集各候选已导入的图片，同一素材只加入一次。补充到已有草稿时保留已编辑的标题、简介、品牌、时间、封面及素材顺序，只追加图片和来源。未导入的图片数量明确显示；可以先导入，也可以之后在案例编辑区手动补充。

图片导入期间，后续图片整理与字段预填等待当前任务完成并读到最新草稿版本；预览图预留显示高度，减少图片加载引起的页面跳动。操作失败信息保留到下一次明确操作，不因后台刷新消失。

已整理候选默认收起，可切换查看其所属案例。同一候选不能重复生成案例，删除案例草稿后可以重新选择整理。候选按文件和页码固定排序，每次显示 12 个，支持继续展开；手机尺寸下按纵向卡片核对，并收窄多层面板留白。已有内容的案例简介、署名说明和分类控件补充了明确的可访问名称。未识别出职业的候选提示手动补充；不同职业的候选分别整理。

## 数据与边界

- 新增原子命令 `POST /portal/profile-drafts/{id}/documents/work-group`。逐个检查候选所属草稿、账号、文件、使用同意、当前状态和版本；任一项失败则整组不写入。原有单作品命令复用同一实现，回执仍支持原请求核对。
- 复用现有 `WORK` 条目及案例编辑协议；只归并当前新建案例草稿。每份草稿最多 10 个案例、单案例 30 项素材及 60 个候选来源。超过上限明确拒绝。
- `baseline.originDocuments` 保存每个候选的文件 ID、SHA-256、任务 ID、候选键、页码和区域，兼容保留首个 `originDocument`。常规案例编辑不会覆盖服务端保存的来源。本人确认后，全部归并出处写入正式来源归因记录。
- 详细材料出处保留在业务数据库及完整数据库备份中。现有受控业务 JSON 导出/重建继续保留真实本人确认依据；它尚不转移详细页面出处和原件文件，本轮未将其宣称为材料库迁移工具。
- 归并不重新请求模型。仍需本人最后确认资料入库；撤回、过期、变更冲突及媒体可用性沿用已有领域检查。
- 无新增依赖、业务表或数据库迁移；已应用的 1—77 号迁移保持冻结。

关键实现：[归并领域服务](../../packages/core/src/supplier-documents.ts)、[来源识别](../../packages/core/src/supplier-work-origin.ts)、[作品核对界面](../../apps/admin-web/src/supplier-document-works.tsx)。

## 验证

全部使用合成 PDF、受控模型建议和隔离服务；真实模型准确率、物理手机、外部通知服务、COS 及生产部署未执行。

| 检查 | 结果与证据 |
|---|---|
| 文档处理与归并 | **20/20 通过**，包括实际两份 PDF、跨页/跨批/跨文件、图片去重、重复采纳、职业冲突、旧版本、越权、原请求重放、编辑后来源保留、撤回阻断；[documents.tap](../../artifacts/supplier-work-grouping/documents.tap) |
| PostgreSQL 16 | **通过**，同一场景在真实隔离数据库运行，最终只有 1 个案例、1 个导演署名、4 项素材、5 处候选来源；[postgres.txt](../../artifacts/supplier-work-grouping/postgres.txt) |
| HTTPS / Nest / Chromium | **通过**，实际上传、10 页分批、跨批归并、编辑后追加、确认入库与再次进入；360/390/430 宽度无水平溢出、无页面脚本错误；[browser.json](../../artifacts/supplier-work-grouping/browser/browser.json) |
| 类型 / 契约 / 静态 | **通过**；322 条路由、12 项静态检查；[类型结果](../../artifacts/supplier-work-grouping/typecheck.txt)、[契约结果](../../artifacts/supplier-work-grouping/contract.txt) |
| 资源生命周期 | **34/34 通过**；[lifecycle.tap](../../artifacts/supplier-work-grouping/lifecycle.tap) |
| 完整 Core 回归 | **827/827 通过**，无失败、跳过或取消；[core.tap](../../artifacts/supplier-work-grouping/core.tap) |
| 构建 | **通过**；仍有既有前端包超过 500 kB 的提示，本轮未作首屏性能结论 |
| 迁移 | 1—77 逐文件校验保持原样，无新迁移 |

可查看[390 宽度作品核对截图](../../artifacts/supplier-work-grouping/browser/work-grouping-390.png)和[归并后截图](../../artifacts/supplier-work-grouping/browser/work-grouped.png)。

初次文档测试的受控响应给第二份 PDF 的不同页面用了错误原文，引用校验正确拒绝；修正合成响应后通过。浏览器首次发现带内容的简介缺少稳定可访问标签；后续将测试点击延后到文件确实可选，并为连续图片导入增加实际命令回执和处理完成的检查；页面同时阻止处理过程中的后续导入、预填，预留图片显示空间。各次失败日志均保留。最终通过记录不覆盖这些失败事实。

隔离复测入口：

```bash
pnpm test:documents
pnpm test:postgres:owned --supplier-work-grouping
pnpm build
ONCE_ACCEPTANCE_WORK_GROUPING=1 ONCE_ACCEPTANCE_EVIDENCE_DIR=artifacts/supplier-work-grouping/browser pnpm test:postgres:owned --browser-suite supplier-library
```

浏览器的受控候选写入真实 PDF 提取结果，用于验证界面与持久化交互；没有拦截或伪造业务 API 响应。文档及 PostgreSQL 专项另走真实解析 Worker、受控模型回调、图片提取和归并命令。两种证据均不代表外部模型质量验收。

后续仍需真实 ONCE 材料试点、多职业细分字段、外部作品链接、集中导入和疑似重复整理，以及目标工况下的万人检索性能优化。

完整汇总和当前工作区源文件指纹见[verification.json](../../artifacts/supplier-work-grouping/verification.json)。本阶段 19 个真实 ResourceRun 的所属临时资源均已回收，失败尝试仍保留 FAIL，见[cleanup.json](../../artifacts/supplier-work-grouping/cleanup.json)。未提交、推送、触发远端 CI、执行生产迁移或部署。
