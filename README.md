> 当前增量：**WP2 结构化人才检索与内部候选清单**，见 [开发、Review 与验收边界](docs/release/WP2_SEARCH_SHORTLISTS.md)。私有图片仍仅 local/test；一期未完成，未生产部署。

> 上一批作品与轻量项目见 [WP1](docs/release/WP1_WORKS_PROJECTS.md)，私有静态图片见 [M1_PRIVATE_IMAGES](docs/release/M1_PRIVATE_IMAGES.md)。

# ONCE Production OS

**交付版本：0.1.0-dev.1｜持续开发源码，不是一期完工版。**

当前已实现 v0.3 内部 OS 的多段贯穿链路：账号/范围 → 来源/人才 → 导入/交接 → 私有静态图片 → 作品/署名 → 项目/参与 → 结构化找人 → 内部候选清单。管理端不是空菜单原型；未实现模块不会用占位状态伪装完成。

截至 2026-09-24，功能代码 head `3db6b1810ac46423eedf6f8ff91b57f1b766d95f` 已在 GitHub Actions [35985423108](https://github.com/BA7IEE/once-production-os/actions/runs/35985423108) 完整跑过冻结安装、Prisma validate/generate、server/web/transport 类型检查、221/221 核心测试、39/39 PostgreSQL、真实 API/Worker/Chromium 浏览器回归和构建。当前仍只适合隔离合成数据继续开发，**不应导入正式模特资料或公开上线**。

## 先读哪几份

| 文件 | 作用 |
|---|---|
| [WP2 检索与候选清单](docs/release/WP2_SEARCH_SHORTLISTS.md) | 当前开发切片、权限边界、已执行验证和仍缺能力 |
| [交付与进度](docs/release/IMPLEMENTATION_STATUS.md) | 哪些已有代码、哪些仍未整体验收 |
| [Review 记录](docs/release/REVIEW.md) | 反例、修复、仍未关闭的验收门 |
| [测试报告](docs/release/TEST_REPORT.md) | 实际执行结果及不能推出的结论 |
| [本地接力运行](docs/release/LOCAL_RUN.md) | 本地隔离环境运行方式 |
| [代码结构](docs/release/ARCHITECTURE.md) | 当前模块、30 个 Prisma 模型和 85 条请求契约 |
| [开发 Agent 入口](AGENTS.md) | 后续开发事实顺序与禁止事项 |
| [原始 v0.3 规格](docs/spec/00_README.md) | 完整一期输入规格；原文保留，不把规格当成已完成代码 |

## 当前可走通的内部路径

空库专用 CLI 初始化管理员；成员通过一次性凭证激活；有依据地建立人才与来源；私有图片在 local/test 封存和预览；图片组成作品并记录真实署名；项目区分提名、确认和实际参与；人才可按姓名、角色、城市、语言、技能、状态、当前可见实际合作和核验时效检索；内部成员建立候选清单，选择人才、其当前可见署名作品及作品图，维护顺序和协作备注。

候选清单是内部工作对象，不是客户包。没有匿名链接、客户确认、档期锁定、预订、报价或官网发布按钮。依赖来源、范围或素材失效时，清单按当前权限重新读取；无法证明可见性的整条候选只保留“不可用条目”占位。

## 仍未完成

机构/品牌主体、内部双语文本版本、行业/作品类型等剩余结构化检索事实、SQL 授权分页与负载验证、COS/PDF/视频/原件下载、受控合并/删除、JSON 导出与重建、备份恢复、正式数据升级演练和四类有界 AI 仍在一期任务内。迁移前已经缺失的来源历史不能被新代码凭空恢复。

网站、AnqiCMS、客户分享、外部人才门户、CRM、报价、合同、排期、财务继续属于明确延期范围；当前内部 OS 不依赖官网配置。

## 验证边界

核心/传输测试使用合成数据和测试专用 MemoryStore；正式 API 路径只使用 PrismaStore。真实 PostgreSQL 与 Chromium 在全新回环测试库执行，不能据此宣称正式数据升级、恢复、生产存储或完整一期验收。

没有默认账号密码、生产密钥、数据库备份或预构建生产镜像。依赖、构建目录、`.env` 和 `.secrets` 不属于交付内容。

## 包完整性

根目录 `MANIFEST.sha256` 覆盖当前交付源码、说明和保留证据文件（不含清单自身）。`sha256sum -c MANIFEST.sha256` 只证明文件与该清单一致，不是代码签名或安全认证。
