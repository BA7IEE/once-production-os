# 整份 PDF 自动分批与失败续做

日期：2026-11-06。延续 `codex/supplier-library-v1` 工作区；用户要求继续推进供应商库。此次关闭“长 PDF 每次必须手动选择 4 页”的操作缺口。首阶段实现和规模基线保留在 [供应商库实施记录](SUPPLIER_LIBRARY_V1_IMPLEMENTATION.md)。

## 本轮行为

供应商上传材料后，默认选择“整份材料（自动分批）”。Worker 先读取总页数和核对文件摘要，然后将最多 100 页拆成每批最多 4 页的任务。10 页文件形成 1—4、5—8、9—10 三批。整份计划与各批结果在数据库保存，刷新页面或重启 Worker 不依赖浏览器或进程内游标。

每批沿用原生 PDF 文字、图片、页图与 AI 结构化建议的处理路径。页面显示提取页数、完成批次、失败页和待处理页。扫描页及复杂版式另行提醒人工核对。原有指定页面入口继续支持每次 1—4 页；已有请求未传 `mode` 时按原合同处理。

如果某批失败，后续页面暂停，已完成批次不重发。本人明确选择续做后，仅失败批次创建新的处理记录，旧失败记录仍可查看。只要失败批次已建立 AI 调用记录，续做必须再次勾选可能重复计费的说明。预算仍在每次派发前检查；用量未知不释放预留额度，不假称免费。

本人可停止后续处理，保留已完成结果，并继续手动整理和确认资料。整份任务仍运行或暂停待决时，后端阻止直接确认。取消后迟到的模型输出不能恢复任务或写入草稿；来源撤回、账号版本、配置和恢复版本检查在每批继续执行。

不同页面的同值字段建议允许逐批确认并保留各自出处；如果现值已被人工或前一批改成不同内容，仍拒绝覆盖。作品候选继续由本人选择、编辑；本轮没有自动推断跨页作品身份。

## 实现与资源边界

- 复用已有 `DOCUMENT_PARSE` 条目存储整份计划及子任务，原始材料、草稿和账号关系保持不变。没有新增业务表或数据库迁移；已应用的 1—77 号迁移不修改。
- `SupplierDocuments` 负责原子计划、状态、逐批领取、权限、暂停、续做和预算联系。`SupplierDocumentWorker` 负责有界文件读取、原生解析、模型请求和临时文件回收。
- 同一账号最多一个正在处理的任务，同一工作区最多两个；排队页不会抢占新 Worker 的全部内存。每份草稿最多 5 次整份解析、200 条处理记录；每批最多 3 次人工发起的处理尝试。
- 首次整份处理最多 25 次模型调用。续做的额外调用必须明确同意，仍受现有额度限制。超过 100 页的文件在发现阶段拒绝整份处理，可拆分或显式选页，不静默截断。
- 页数发现与渲染都在剥离应用凭据的限额子进程中执行；此机制仍不是完整操作系统沙箱。

主要入口：

| 责任 | 文件 |
|---|---|
| 处理计划、恢复、权限 | [supplier-documents.ts](../../packages/core/src/supplier-documents.ts) |
| 共享状态和限额 | [supplier-document-contract.ts](../../packages/core/src/supplier-document-contract.ts) |
| 文件发现与 Worker | [parser.ts](../../apps/api/src/documents/parser.ts)、[worker.ts](../../apps/api/src/documents/worker.ts) |
| 进度与续做界面 | [supplier-document-ui.tsx](../../apps/admin-web/src/supplier-document-ui.tsx) |
| 原生文件与故障场景 | [batches.test.mjs](../../tests/documents/batches.test.mjs) |
| 真实数据库场景 | [supplier-document-batches.test.mjs](../../tests/postgres/supplier-document-batches.test.mjs) |

## 验证记录

当前测试使用合成 PDF 和受控模型响应。真实模型质量、外部认证、COS、物理手机及生产部署仍未执行。

| 项目 | 结果 |
|---|---|
| 原生文件与完整文档工作流 | 18/18 通过；含整份分页、Worker 重启、部分取消、租约过期、结果未知、显式续做、撤回阻断、超过 100 页拒绝及取消后迟到输出 |
| 真实 PostgreSQL 16 | 通过；完整 10 页任务、失败续做、4 次独立模型派发账本和各批页码来源进入本人确认后的正式档案 |
| 类型 / 契约 / 静态 | 通过；321 条路由。构建仍保留现有前端包大于 500 kB 的提示，未做移动首屏性能结论 |
| 当前构建与浏览器 | 通过；真实 HTTPS / Nest / Prisma / PostgreSQL / Chromium，10 页三批、立即刷新与原回执核对、提取图片作为作品封面、本人确认及重新打开，360/390/430 宽度无水平溢出 |
| 完整 Core 回归 | 本轮重新执行 **827/827**，无失败、跳过或取消；见 [core.tap](../../artifacts/supplier-document-batches/core.tap) |

最终浏览器结果见 [browser.json](../../artifacts/supplier-document-batches/browser/browser.json)，进度界面见[整份解析截图](../../artifacts/supplier-document-batches/browser/whole-document-progress.png)。文档专项见 [documents.tap](../../artifacts/supplier-document-batches/documents.tap)，数据库结果见 [postgres-first.txt](../../artifacts/supplier-document-batches/postgres-first.txt)。Worker 恢复测试通过重新实例化调度器和租约过期来验证持久状态；未将模拟服务或这类测试表述为真实模型质量或线上故障演练。

最终汇总和工作区源码指纹见 [verification.json](../../artifacts/supplier-document-batches/verification.json)，真实测试资源的回收结果见 [cleanup.json](../../artifacts/supplier-document-batches/cleanup.json)。之前的阶段证据保留；本轮未提交、推送、触发远端 CI、执行生产迁移或部署。

浏览器首次定位到下拉框可访问标签不明确，随后覆盖了立即刷新时已有的原请求核对流程，并发现多图导入后短暂使用旧草稿版本的问题。现已在父页面读到最新版本后再发布完成状态，同时在材料状态尚未稳定时暂缓作品编辑。对应失败日志保留，最终通过记录不覆盖这些首次失败事实。

隔离复测入口：

```bash
pnpm test:documents
pnpm test:postgres:owned --supplier-document-batches
pnpm build
ONCE_ACCEPTANCE_EVIDENCE_DIR=artifacts/supplier-document-batches/browser pnpm test:postgres:owned --browser-suite supplier-library
```

2026-11-07 后续已补充本人选择的跨批、跨文件作品归并，见[作品整理记录](SUPPLIER_WORK_GROUPING.md)；本页测试数字保留为分批阶段证据。仍待推进真实材料准确率、多职业字段完善、ONCE 集中导入，以及万人并发目录性能。此前万人合成查询 P95 约 3.2 秒的基线未在本次变更中改善，不能宣称达到 1 秒目标。
