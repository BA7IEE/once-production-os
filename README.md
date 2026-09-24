> 当前增量：**WP3 / DEV-07A 内部 JSON 导出与精确依赖清单**，见 [WP3_EXPORT_DEPENDENCIES.md](docs/release/WP3_EXPORT_DEPENDENCIES.md)。PR #10 基于 WP2B/PR #8，保持 Draft；一期未完成，未生产部署。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单 → **受控内部 JSON 导出**。

功能代码 head `19585fb4382ac781d9e2688320ec8e1071340c92` 在 GitHub Actions [36005508490](https://github.com/BA7IEE/once-production-os/actions/runs/36005508490) 五个 job 全绿：92 条请求契约、230/230 核心/传输、46/46 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前能做

人才可按结构化事实确定性检索；内部 Shortlist 可协作整理候选。新增内部导出中心后，资料审核者可以按“对象 + 字段 + 截止时间 + 依据”批准 `INTERNAL_EXPORT` 用途，具备 `data.export` 的成员只能使用现行许可生成 JSON。

导出支持显式选择的人才、作品、项目；关系只在两端都被选中时进入 JSON。可选媒体身份清单只含文件名、类型、Hash、尺寸等迁移身份，不含原件地址或签名 URL。联系方式、Source.textPayload、密码、Session、密钥和机器凭证没有可导出字段。

导出在创建时冻结记录/字段和精确依赖，Worker 执行前复查，下载时再次复查。来源暂停、范围/保护版本变化、许可撤销/过期或申请人失去权限会阻断旧导出继续下载；普通内容修改不会偷偷改写旧快照，只提示 `contentChanged`。

## 三道导出安全门

1. 账号必须具备 `data.export`；
2. 每个对象/字段必须存在当前有效的精确 `INTERNAL_EXPORT` UsePermission；
3. 部署侧 `DATA_EGRESS_MODE=INTERNAL_APPROVED` 才允许创建/执行/下载。默认配置仍是 `DISABLED`。

关闭部署出口时，历史导出元数据仍可审计，但不可下载。可读资料不自动等于可导出资料，`TEMP_ORGANIZE` 临时依据不能升级成导出许可。

## 仍未完成

DEV-07A **没有**完成完整 T29：尚无“10 人/3 作品/1 项目在隔离空间重建”的导入/重建工具。DEV-07B 的依赖影响预览、受控删除、ERASED 处置和人物合并也未实现。

DEV-09 备份恢复、DEV-04 正式 COS/PDF/视频/原件生命周期、机构/品牌基础主体、内部双语文本、四类有界 AI、正式数据升级与恢复演练仍在一期内。网站、AnqiCMS、客户门户、报价、合同、排期、财务继续延期。

## 继续开发入口

先读：
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
