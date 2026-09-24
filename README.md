> 当前增量：**WP4 / DEV-07B 删除影响预览与 DRAFT 申请**，见 [WP4_DELETION_IMPACT_PREVIEW.md](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)。PR #11 基于 DEV-07A/PR #10，保持 Draft；一期未完成，未生产部署。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前内部链路已贯通：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单 → 受控 JSON 导出 → **删除影响评估与 DRAFT 申请**。

功能 head `9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273` 在 GitHub Actions [36019151162](https://github.com/BA7IEE/once-production-os/actions/runs/36019151162) 五个 job 全绿：96 条请求契约、237/237 核心/传输、52/52 PostgreSQL、原生表单 Chromium 6/6，以及 browser-resume / handoff / media / production 全部成功。当前仍只适合隔离合成数据继续开发，**不应接管正式模特资料或公开上线**。

## 当前能做

内部 JSON 导出继续受 `data.export + INTERNAL_EXPORT UsePermission + DATA_EGRESS_MODE` 三道门控制。旧导出会在来源、范围、保护版本或用途许可失效后整件拒绝继续下载。

新增“删除影响评估”后，具备 `data.delete` 的成员可以针对当前可见的 Source / Person / Work / Project / Asset：

- 做零写入影响预览；
- 看到当前可证明的关系、用途许可、旧导出等依赖；
- 对隐藏范围依赖只看到 unresolved 计数，不获得对象 ID；
- 预览后若新增依赖，旧 `previewDigest` 失效；
- 只有影响图完整时才能冻结为 `DRAFT` 删除申请；
- DRAFT 只冻结目标版本、影响摘要和申请原因，**不会阻断、删除或擦除任何数据**。

页面没有“执行删除”“立即删除”或“开始清理”按钮。

## 仍未完成

DEV-07B 目前没有 `BLOCKED_FOR_USE`、清理 Worker、ERASED 最小头、保留决定执行或 Person merge。FR-13/T13 因此仍未完成。

DEV-07A 也没有完成完整 T29：尚无“10 人 / 3 作品 / 1 项目”的隔离重建工具。DEV-09 备份恢复、正式 COS/PDF/视频/原件生命周期、机构/品牌基础主体、内部双语文本、四类有界 AI、正式数据升级与恢复演练仍在一期内。

网站、AnqiCMS、客户门户、报价、合同、排期、财务继续延期。

## 继续开发入口

先读：

- [WP4 删除影响预览](docs/release/WP4_DELETION_IMPACT_PREVIEW.md)
- [WP3 导出与依赖](docs/release/WP3_EXPORT_DEPENDENCIES.md)
- [当前实现状态](docs/release/IMPLEMENTATION_STATUS.md)
- [测试报告](docs/release/TEST_REPORT.md)
- [开发 Agent 入口](AGENTS.md)
- [原始 v0.3 规格](docs/spec/00_README.md)

根目录 `MANIFEST.sha256` 是文件一致性清单，不是代码签名或安全认证。
