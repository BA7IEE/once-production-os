当前工作： [业务流修复与验收边界](docs/release/BUSINESS_FLOW_FIXES.md)。独立分支 `codex/business-flow-fixes`；修复代码已实现，新增迁移75未实跑，完整构建/浏览器/CI未验收，未合并部署。以下PR-04D记录属于上一基线。

当前 PR-04D 进度见 [同档接手与生命周期交付说明](docs/release/PR04_AGENT_INGESTION_D.md)，独立 stacked Draft PR35、未合并、未部署。A–C及迁移1–74冻结；本轮本地全量通过，最终head CI另绑定PR与交付回复，D等待代码级复核。

# ONCE Production OS

人才与制作资料系统，当前按 [Talent Experience v1.1](docs/spec/15_TALENT_EXPERIENCE_V1_1.md) 扩展。PR-01、PR-02已合并并开发冻结；PR-03 A–E全部开发冻结，PR #31已转Ready for Review，未合并、未部署。冻结SHA、精确head CI和实测边界见 [PR-03冻结记录](docs/release/PR03_DEVELOPMENT_FREEZE.md)。外部Agent摄取的 PR-04A 已由用户冻结，PR #32保持Draft；PR-04B 已由用户冻结，PR #33保持Draft；PR-04C已由用户冻结，PR #34保持Draft；PR-04D接通同档邀请认领、明确exposure和本人后续维护，完成生命周期全量回归，[本轮交付与实测边界](docs/release/PR04_AGENT_INGESTION_D.md)明确无新迁移、真实页面和最终head CI，D仍待代码级复核。真实供应商、COS、物理手机及生产迁移继续NOT_RUN。

内部底座：当前开发分支已接通来源/权限、人才2.0、作品项目、专业检索、候选清单、受控合并/导出重建/删除、内部语言文本，以及四类文字AI辅助。

模型连接由管理员填写URL、协议、模型名称和密钥，保存、测试后批准启用，无需独立网关。AI只提供待确认建议。

媒体支持私有图片、PDF附件和受控MP4播放。**PDF不在系统内解析，内容处理交给外部Agent。** 本地开发使用Local Provider；COS使用私有专用桶与共享隔离目录，原件仍通过受控导出获取。存储配置见 `.env.example` 和下方交付说明。

当前不是完整一期验收或正式部署声明。真实供应商、性能/运维及生产接管待验；品牌、所属机构和项目客户／品牌关联已接通，当前提交的集中验收结果见 PR。

- [本轮快速建档与迁移/验收计划](docs/release/TALENT_EXPERIENCE.md)
- [当前交付与剩余清单](docs/release/CURRENT_DELIVERY.md)
- [媒体处理、COS配置与边界](docs/release/MEDIA_COMPLETION.md)
- [模型连接](docs/release/AI_MODEL_CONNECTION.md)
- [历史交付证据](docs/release/README_HISTORY.md)
- [开发契约](docs/spec/06_DEVELOPMENT.md)

正式入口使用PrismaStore，不提供生产内存回退；已应用迁移只允许追加。开发和检查使用锁定依赖，常用命令见package.json。
