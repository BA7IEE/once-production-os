# ONCE 供应商库

当前重点是把模特、导演、编剧、摄影师、灯光师、剪辑师、调色师等人的资料管理起来。沿用 ONCE Production OS 的人物、作品、来源、权限和私有文件底座，新增本人维护与材料解析流程。

**邀请登录 → 上传 PDF/图片 → 提取内容和 AI 预填 → 本人调整确认 → 直接入库 → ONCE 查找和整理。**

## 当前开发版本

2026-11-07（北京时间），工作分支 `codex/supplier-library-v1`。H5 入口为 `/talent/login`，本人使用独立账号；现有管理端继续维护同一人物库。小程序可复用接口，本轮交付 H5。

- 基础资料支持多职业、城市、语言、技能、联系方式和模特量尺，保存服务器草稿并检查更新冲突。
- PDFium 实际提取 PDF 文字、页码、页图和嵌入图片。模型可识别扫描页并提出字段、作品及图片区域建议，供本人选择和调整。
- 识别出的作品可以跨页、跨批次、跨文件归入一个可编辑案例，保留图片和各处来源。
- 本人确认后直接建立或更新档案、素材和作品；记录真实本人主体与来源，不冒充员工审核。
- ONCE 可以继续检索、纠正资料。旧有归属认领和代理/监护人流程保留在 `?legacy=1`。
- 职业模板支持可配置字段、多选标签和成组经历；新字段可先配置发布，再用于本人填写、AI 预填和后台筛选。

详细范围、架构、运行方式和测试证据见 [实施记录](docs/release/SUPPLIER_LIBRARY_V1_IMPLEMENTATION.md)，产品目标见 [供应商库第一版方案](docs/design/ONCE_SUPPLIER_LIBRARY_V1_20261106.md)。

首阶段核心回归 827/827、真实 PostgreSQL、原生文件处理和 H5 浏览器已通过隔离验收。本次继续增加整份 PDF 自动分批：最多 100 页、每批不超过 4 页，失败暂停后可明确续做，详见[整份材料续做记录](docs/release/SUPPLIER_DOCUMENT_BATCHES.md)。作品候选整理的最新实现见[作品整理记录](docs/release/SUPPLIER_WORK_GROUPING.md)。真实模型、通知服务、COS、物理手机及业务试点尚未验收；万人合成查询 P95 约 3.2 秒，尚未达到 1 秒目标。未执行生产迁移、合并或部署。

字段升级的最终验收为 Core 839/839、文档 21/21、生命周期 34/34，数据库升级及 9 条浏览器流程通过；代码与匿名证据以本地提交交付。真实材料已用于结构校准，尚未自动入库。PPTX 摄取、外部模型准确率、含新扩展字段的档案合并和业务迁移导出仍待完善，详见[交付边界](docs/release/SUPPLIER_FIELD_TEMPLATES.md#交付边界)。

## 开发入口

- [产品与范围](docs/spec/00_README.md)
- [开发契约](docs/spec/06_DEVELOPMENT.md)
- [字段、标签与职业模板升级设计](docs/design/ONCE_FIELD_TAG_TEMPLATE_UPGRADE_20261107.md)
- [字段模板实施与验收](docs/release/SUPPLIER_FIELD_TEMPLATES.md)
- [真实材料对字段设计的校准](docs/design/REAL_MATERIAL_FIELD_CALIBRATION_20261107.md)
- [模型连接配置](docs/release/AI_MODEL_CONNECTION.md)
- [资源登记与清理规则](docs/development/RESOURCE_LIFECYCLE.md)

使用 Node 22、pnpm 10 和锁定依赖。解析依赖及复测命令见实施记录。正式入口使用 PrismaStore，不提供生产内存回退；已经应用的迁移只追加，不改写历史。

## 历史记录

[2026-10-05 主分支合并收尾](docs/release/MERGE_CLOSEOUT_20261005.md)、[业务流程复核修复](docs/release/BUSINESS_FLOW_REVIEW_FIXES.md)、[同档接手与生命周期](docs/release/PR04_AGENT_INGESTION_D.md) 和 [更早交付证据](docs/release/README_HISTORY.md) 保留各轮事实。历史的“PDF 仅附件”和“本人文字投稿必须员工审核”范围不适用于当前供应商库增量。
