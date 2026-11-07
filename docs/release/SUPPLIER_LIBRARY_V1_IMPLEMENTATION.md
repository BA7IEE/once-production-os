# ONCE供应商库第一版实施记录

日期：2026-11-06。基线：`3d117134f343ab382c52682bc57c1a1515472ec0`。工作分支：`codex/supplier-library-v1`。本轮是工作区增量实现，未执行生产迁移、部署、合并或外部模型付费调用。

用户确认的目标为 1,000—10,000 位多职业供应商，**本人确认后直接入库，ONCE 随时整理纠正**。第一版聚焦人、资料、作品和材料。完整设计见[供应商库方案](../design/ONCE_SUPPLIER_LIBRARY_V1_20261106.md)。

## 已落地的流程

ONCE 发出通用加入邀请 → 本人通过独立人才账号登录 → 建立多职业资料草稿 → 上传 PDF/图片 → 整份自动分批或选择指定页面 → 选择 AI 字段建议预填 → 修改和保存资料、图片、作品 → 本人确认入库 → ONCE 在现有目录查找和整理 → 本人再次进入维护同一 Person。

- **资料**：姓名、别名、介绍、多职业、常驻城市、语言、已配置技能、联系方式，以及模特职业下的四项量尺。导演、摄影、编剧、灯光、剪辑、调色等不再默认归为模特。个人资料存为加密服务器草稿；浏览器不持久化正文。
- **PDF/图片**：真实 PDFium 提取原生文字、页码、文字区域、页图和嵌入图片。扫描页通过多模态模型识别；不能提取的页明确显示。原件作为出处保留，提取的照片和经本人选择的 AI 图片区域可以成为正式素材。
- **AI**：使用现有模型连接和预算账本，支持已有三类协议的图文请求。输出通过严格结构、字典、页码、引用原文和图片区域校验。缺项留空；建议先进入草稿，不直接覆盖正式事实。作品候选可转成可编辑案例，保留图片关联和来源。
- **确认**：首次本人确认在同一事务建立 Person、职业事实、联系方式、本人绑定、来源、用途依据、素材、作品、审计和回执。后续确认更新同一 Person。真实主体为 TALENT，不伪造员工 Membership；本人来源的 `reviewedBy/reviewedAt` 为空。
- **更新冲突**：ONCE 或另一份草稿先更新时，拒绝旧版本覆盖。页面展示各字段当前值与草稿值，明确核对后才能重建基线。原先未开放的员工字段不会被空白表单清除或自动暴露。
- **生命周期**：继承原有用途撤回、草稿保留、文件暂存/正式采纳、私有读取、删除和恢复边界。撤回同意后不能继续派发材料到模型；网络未知不盲重发；来源证据随图片和作品保留。

H5 默认入口为 `/talent/login`，邀请链接进入同一入口。`?legacy=1` 保留既有档案首次归属认领、代理/监护人及历史提交审核流程。新版完整资料不能误入旧文字提交/审批路由。

## 代码与架构

| 责任 | 实际入口 |
|---|---|
| 本人资料页面 | [supplier-profile-ui.tsx](../../apps/admin-web/src/supplier-profile-ui.tsx) |
| 材料核对页面 | [supplier-document-ui.tsx](../../apps/admin-web/src/supplier-document-ui.tsx) |
| 本人资料领域服务 | [supplier-profiles.ts](../../packages/core/src/supplier-profiles.ts) |
| 文档任务、预填、来源 | [supplier-documents.ts](../../packages/core/src/supplier-documents.ts) |
| PDF/图片本地处理 | [parser.py](../../workers/document-parser/parser.py)、[parser.ts](../../apps/api/src/documents/parser.ts) |
| 异步解析与素材处理 | [document worker](../../apps/api/src/documents/worker.ts) |
| 模型图文边界 | [model-client.ts](../../apps/api/src/ai/model-client.ts) |
| 本人作品落库 | [supplier-work-cases.ts](../../packages/core/src/supplier-work-cases.ts) |
| 前向迁移 | [76：本人确认](../../prisma/migrations/202611060001_supplier_self_confirmation/migration.sql)、[77：材料 AI 主体](../../prisma/migrations/202611060002_supplier_document_ai/migration.sql) |

继续使用 Person / TalentProfile / PersonRole / Work / MediaAsset / TalentAccount。文档队列作为现有 Submission 的条目持久化，具有任务状态、租约、账号版本、同意版本、文件摘要和 AI 配置摘要，不新增平行的人物库。Node API 与 Worker 共用领域服务；Python 只承担有界本地文件处理。

前 75 次迁移保持原样；76、77 已实际应用并冻结。新的数据库改动须追加迁移，不能修改这些已经验证的文件。

## 当前处理边界

1. 整份解析支持 **最多 100 页**，自动拆成每批最多 4 页的持久任务；也可只选 1—4 页。失败暂停并保留已完成结果，明确续做只重新处理失败批次。完成页、失败页与待处理页分别显示。现已支持本人选择跨页、跨批次和跨文件候选归入同一案例，保留各处来源，详见[作品整理记录](SUPPLIER_WORK_GROUPING.md)；项目身份仍由本人核对。
2. PDF 上限 50 MB；图片输入上限 30 MB / 6000 万像素；每次最多加入 10 个图片区域。损坏、加密及超限文件返回明确失败；没有伪造 OCR 文字。
3. 图片区域以原始页图坐标截取；实际画质、图文配对和复杂版式准确率需要真实样本验证。没有按人脸相似度认人，也不从照片推断身体量尺。
4. 原生 PDF 提取无需模型；扫描页的文字识别与结构化建议需要配置支持图像输入的模型，且本人明确同意发送所选页面。模型使用量与真实账单结算分开，未知费用保留预留额度。
5. 当前表单覆盖上述基础字段；更细的职业专属字段、外部作品链接、ONCE 批量 PDF 预建档、疑似重复工作台与自动批次归并仍属于后续工作包。
6. 文件解析使用剥离应用凭据的限额子进程；这不是完整的操作系统安全沙箱。部署镜像已补 Python 环境和 parser 文件；本轮未构建或部署该 Docker 镜像。

## 首阶段实际验证

以下保留首阶段证据；整份自动分批续做见[材料分批记录](SUPPLIER_DOCUMENT_BATCHES.md)，最新候选整理和验证见[作品整理记录](SUPPLIER_WORK_GROUPING.md)。所有人物、联系方式、文件和服务响应均为合成测试资料。

| 项目 | 本轮结果与证据 |
|---|---|
| 完整 Core 回归 | **827/827**，无失败、跳过或取消；见 [core.tap](../../artifacts/supplier-library/core.tap) |
| 原生文件与文档工作流 | **10/10**；包含旋转 PDF、文字/嵌入图片、扫描/加密/损坏材料、AI 区域提取及作品关联、网络未知、撤回前禁止派发、预填冲突；见 [documents.tap](../../artifacts/supplier-library/documents.tap) |
| 真实 PostgreSQL 16 | 本人确认、真实身份约束、作品及 AI 账本通过；数据库容器为独立一次性实例；见 [postgres.txt](../../artifacts/supplier-library/postgres.txt) |
| 旧数据升级 | 有数据的 75 → 77 通过；原来源、人物、来源历史和前 75 个迁移校验值未改变；见 [upgrade.tap](../../artifacts/supplier-library/upgrade.tap) |
| H5 浏览器 | 真实 HTTPS/Nest/Prisma/PostgreSQL/Chromium 通过；360/390/430 宽度，无水平溢出；PDF 文字、图片、作品封面、本人确认、重进读取及后台详情 |
| 历史入口兼容 | `talent-maintenance` 真实浏览器通过；覆盖首次归属认领、审核、同档更新、双标签账号切换及未知回执核对，见 [legacy/browser.json](../../artifacts/supplier-library/legacy/browser.json) |
| 资源生命周期 | **34/34**，含失败回收、取消、短临时目录归属及路径替换拒绝 |
| 类型 / 契约 / 静态 / 构建 | 通过；生成契约共 320 条路由。Web 构建仍有现有大包提示，未声称移动端首屏性能完成 |
| 真实供应商认证 / 模型 | **NOT_RUN**。浏览器使用受控本地通知网关；模型传输测试使用受控响应，不代表真实模型识别准确率 |
| COS / 物理手机 / 生产迁移 / 部署 | **NOT_RUN** |

本轮浏览器修复了草稿组件 key 冲突造成的重复面板、异步读取时先显示空表单、量尺职业移除和别名输入、未保存作品直接确认、移动端复选框样式等问题。初次失败不计通过；最终浏览器结果见 [browser.json](../../artifacts/supplier-library/browser.json)，可查看[手机入口截图](../../artifacts/supplier-library/supplier-mobile-overview.png)和[后台截图](../../artifacts/supplier-library/internal-supplier.png)。

本轮汇总与工作区源码指纹见 [verification.json](../../artifacts/supplier-library/verification.json)。真实测试资源均已按所属 ResourceRun 回收；[cleanup.json](../../artifacts/supplier-library/cleanup.json) 区分真实运行与故障模拟，模拟测试的预期清理失败记录保留。类型检查期间误启动的浏览器验收被互斥锁拒绝，未创建测试容器；待类型检查结束后的独立重跑通过。旧验收记录及真实持久数据未清理。

### 规模验证与仍未达到的目标

实际构造 1,000 / 10,000 位人物，每人两个职业和一份独立合成来源，验证目录总数、筛选和分页不重复。PostgreSQL 限制为 **1 CPU / 512 MiB**；单调用者、预热后每组 5 次，不含并发上传、解析及大量媒体。

发现并修复重复候选 SQL、反复生成同一人物投影以及筛选统计中不必要的排序/详情构建。缓存只在本次读取及其筛选统计内部使用；下一次请求重新检查权限、来源和撤回状态。

| 人数 | 优化前 P95 | 优化后 P95 |
|---|---:|---:|
| 1,000 | 2,121 ms | 1,378 ms |
| 10,000 | 13,494 ms | 3,213 ms |

证据：[优化前](../../artifacts/supplier-library/scale-before.json)、[优化后](../../artifacts/supplier-library/scale.json)。这里的 P95 是小样本最大值。**万人功能正确性通过，方案中指定工况下的 P95 ≤ 1 秒性能门未关闭**；还需在目标机器、真实字段/媒体密度及并发工况下测试，继续收窄数据投影和统计查询。不能据此宣称生产万人容量全部验收完成。

## 运行与复测

使用仓库指定 Node 22 / pnpm 10。安装 Python 依赖后，API 和 Worker 才能处理材料：

```bash
python3 -m venv /absolute/private/once-document-python
/absolute/private/once-document-python/bin/pip install -r workers/document-parser/requirements.txt
# 将该虚拟环境的 bin 目录放在运行 Worker 的 PATH 前面。
pnpm db:generate
pnpm build
```

本地数据库和密钥沿用 [LOCAL_RUN](LOCAL_RUN.md)，不要重置已经存在的环境。仅对预定的开发数据库执行 `pnpm db:deploy`；API 使用现有 `start` 入口，后台任务使用 `worker` 入口，两者读取同一配置。原生解析依赖私有媒体启用：`MEDIA_PROVIDER=local`（或现有 COS 配置）、私有绝对路径 `MEDIA_ROOT`。人才入口须设置 `TALENT_PORTAL_ENABLED=true`，并配置 `.env.example` 中的独立通知网关和人才认证密钥。模型连接及调用额度在 ONCE 后台配置并确认。

可复测的隔离入口：

```bash
# 合成 PDF 生成另需测试依赖 reportlab；仅用于测试。
python3 -m pip install -r tests/documents/requirements.txt
pnpm test:documents
pnpm test:postgres:owned --supplier-library
pnpm test:postgres:owned --supplier-document-batches
pnpm test:postgres:owned --supplier-work-grouping
pnpm test:postgres:owned --supplier-upgrade
pnpm test:postgres:owned --supplier-scale
pnpm test:postgres:owned --browser-suite supplier-library
```

Linux 受限执行环境使用真实的 `ONCE_RUNNER=managed-linux`；仍检查有限 cgroup 内存、至少 4 GiB 余量、Swap ≤ 4 GiB 和本地 Docker。所有 PG、构建、浏览器重型任务串行且由 ResourceRun 登记回收。新 CI 工作流为 [supplier-library.yml](../../.github/workflows/supplier-library.yml)，本轮未推送或触发远端 CI。

## 工作包状态

| 工作包 | 状态 |
|---|---|
| P0：合同与样本 | 代码/合成样本合同已验证；真实 ONCE 样本准确率待验 |
| P1：本人资料与直接入库 | 上述基础字段闭环已实现并验证；保留历史归属审核 |
| P2：PDF/图片与 AI | 提取、预填、图片与作品闭环已实现；整份 100 页自动分批与失败续做已通过代码、真实数据库和浏览器验证，已补本人选择的跨批/跨文件作品归并，详见[最新实施记录](SUPPLIER_WORK_GROUPING.md)；真实模型质量仍待验 |
| P3：多职业完善 | 已有多职业、字典及模特量尺；更细的职业模板等待样本驱动完善 |
| P4：万人管理与导入 | 合成万人查询及首轮优化已完成；完整性能门、批量 PDF 预建档及导入容量待完成 |
| P5：真实试点 | 未执行；真实服务、真实资料、物理手机和业务人员试点不能由合成验收替代 |
