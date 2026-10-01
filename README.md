# ONCE Production OS

人才与制作资料系统，当前按 [Talent Experience v1.1](docs/spec/15_TALENT_EXPERIENCE_V1_1.md) 扩展；已合并统一快速建档；[PR-01b](docs/release/TALENT_EXPERIENCE_PR01B.md) 补业务字段、照片目录、统一筛选与主详情及新增事实生命周期。PR-02已合并并开发冻结；[PR-03](docs/release/TALENT_EXPERIENCE_PR03.md)已启动媒体维护，首个切片为内部受控视频播放。A/B/C仍未完成，未部署，Provider未验证，外部入口尚未开放。

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
