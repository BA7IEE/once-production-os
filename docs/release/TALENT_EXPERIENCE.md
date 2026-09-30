## 2026-10-01 当前状态

PR-01 已正式冻结，[PR #29](https://github.com/BA7IEE/once-production-os/pull/29) 已合并至 main `79e064980fda7df9f90ea6a2fef13d3b3eeccb9f`，对应完整 CI 36755091719 七项通过；仍未部署。详情见 [PR-01b 合并记录](TALENT_EXPERIENCE_PR01B.md)。[PR #30](https://github.com/BA7IEE/once-production-os/pull/30) 的 PR-02a 已复核冻结，PR-02b 已实现、等待本轮复核，继续 Draft、未合并未部署；PROVIDER_VERIFIED=NOT_RUN。详见 [PR-02](TALENT_EXPERIENCE_PR02.md)；下面为 PR-00/01a 当时的历史交付，不覆盖当前状态。

# Talent Experience 首轮开发交付

日期：2026-09-30。工作分支 `codex/talent-experience`。本轮为 PR-00 文档/合同回填与 PR-01a 内部快速建档子切片；PR-01 以及 Release A/B/C 均未完成。

## 当前基线与差异

通过 gh API 核对云端 main=`6aeaab51565699ce8b9f5a830e13d5d706a09ed0`，与输入规范一致，PR #26 已合并。当前打开的客户归档目录并非目标仓库；本次使用独立 worktree，没有改动客户归档资料或旧本地分支。

[PR #27](https://github.com/BA7IEE/once-production-os/pull/27) 仍 OPEN/Draft，云端 head=`0bcb97f0dcbbb2cfa5f1c3f452bf10be908c1333`，Actions 36555751961 六项 SUCCESS。其本地 worktree head 与云端不一致。本次不修改或合并它；其页面导航/卡片/来源分页可在后续主目录包中按最新提交比较复用，但不视作main已有功能。

当前main有54次迁移、199条生成路由（本次新增1条内部建档命令）。没有schema变更或新增迁移。基线指纹见 `artifacts/talent-experience/baseline.json`；全部旧迁移需逐文件对照保持不变。

## 交付与状态

- DOC_REVIEWED：完整v1.1进入 `docs/spec/15_TALENT_EXPERIENCE_V1_1.md`，输入字节与SHA256保持；主README/PRD/开发/参数/测试/AGENTS同步范围，保留安全约束。
- IMPLEMENTED：单一“新增人才”入口；姓名即可保存默认模特草稿，支持多职业或普通联系人；可选现有来源，无来源按当前员工真实归因建立限定范围临时整理。
- 组合写入沿用正式PrismaStore、既有TD2事实、事务审计、回执和写前日志；未引入生产MemoryStore或复制人才主库。
- 命令合同、权限/异常、ADR、前向迁移计划和逐项配置映射见 [16](../spec/16_TALENT_EXPERIENCE_CONTRACT.md)。未知结果冻结原输入、显式原键核对；来源失效不借旧回执重新创建。

## 本次测试清单与证据

本次本地：完整核心569/569（MemoryStore）；建档专项6/6；类型/transport/199路由生成合同/静态12项/构建通过。真PostgreSQL 14.19 + 系统Chrome建档五组检查通过，既有交接和图片/PDF/worker浏览器通过。云端PG16结果待绑定提交核对；不沿用旧CI。

| 检查 | 证据 | 覆盖边界 |
|---|---|---|
| 6项核心建档专项 | artifacts/talent-experience/intake-core.tap | 限定scope、临时期/归因、多职业、同档升级、原键重放、来源CAS/失效、审计回滚、只读拒绝 |
| 全核心回归 / 类型 / 合同 / 静态 / 构建 | artifacts/talent-experience/core-test-report.json、static-review.json和local-verification.json | 现有内部底座；MemoryStore核心与PG分开 |
| 真PostgreSQL+Chromium建档 | artifacts/talent-experience/browser-verification.json、intake-*.png | 同键并发只建一人、数据库审计故障全回滚、UI失去响应重放、多职业/联系人、360–1280宽度、只读拒绝 |
| 既有交接/媒体浏览器 | artifacts/talent-experience/legacy-browser.txt | 调整创建入口定位，其余业务/字节/范围断言保留；旧接口兼容不移除 |

TE-AT-01/02/03仅覆盖本次建档部分，未标整个用例完成；TE-AT-04/05/06/07及65/66/86需要后续PR-01b事实/目录。其余邀请、门户、多来源媒体、摄取、价格/时间、客户及官网用例全部NOT_RUN。

## 明确剩余

PR-01b：业务字段与TD2 2.1未知量尺日期、日期精度/年龄区间、多维统一SQL查询/facet、视觉封面、主详情与同对象作品语义，以及完整转移/删除/恢复。

PR-02–04：独立人才账号/真实验证码、二维码、同档认领、服务器草稿/投稿审核、用途撤回、外部主体回执/worker、多来源媒体/真实视频有界Range、案例、草稿READY回收、受限Agent摄取。A尚不可开放。

PR-05–07：三层参考价、基础时间、候选多Work/集合迁移、精确媒体审核、客户快照/稳定反馈、公开投影、真实CMS发布/撤回。B/C尚不可开放。

PR-08：汇总各阶段生命周期/数据升级/容量/手机/正式镜像与交接。真实邮件短信、COS、移动设备codec、目标staging/生产、性能与CMS均PROVIDER_NOT_VERIFIED/NOT_RUN。本次未合并、未部署、未发送外部消息、未接管真实资料。

本次测试夹具中的表名、错误状态、双关闭按钮定位修正及macOS临时路径失败单独记录于 `browser-failures.json`；失败运行未计为通过，未放宽业务断言或超时。

云端运行 36720518123 发现专业工作台验收辅助脚本仍引用旧“新建人物”入口。本轮改为通过统一建档入口建立默认模特，再用原职业表单添加翻译；后续职业、权限、历史和媒体断言全部保留。失败记录单独保留，修正后的最终云端结果以 PR #28 为准。
