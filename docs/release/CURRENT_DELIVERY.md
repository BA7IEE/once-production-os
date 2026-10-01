## 2026-10-01：PR-03D finalization（Draft，待复核）

修复 LINK 不写共享 Work 媒体/事实，新增独立媒体+Work同意版本，支持已有 exact Credit 原样接手及 legacy 内部受控升级。无schema/迁移变化，1–66逐文件不变。当前证据见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-finalization/verification.json`。保持未合并、未部署，Provider未验证，不进入PR-03E。

## 2026-10-01：PR-03D 作品案例（Draft，待复核）

PR-03A/B/C 已冻结。本轮复用 Work/Credit/Asset，增加本人案例草稿、精确职业署名、人工新建/关联、Grant-bound 本人投影及人物主详情卡片；同步导出重建、删除/合并与恢复。新增前向迁移64–66，1–63不改。当前实测证据与明确边界见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-work-cases/verification.json`。保持 PR #31 Draft、未合并、未部署，Provider/COS/真实手机仍 NOT_RUN；完成本轮后不进入 PR-03E 或后续业务。

## 2026-10-01：PR-03 媒体归属与暂存底座（Draft待复核）

迁移62新增真实上传主体与PersonMedia关系，READY与STAGED/ADOPTED/RETIRED分离；本人/审核专用读、原子采纳及生命周期已接入。1–61冻结。真实Chrome手机宽度与异步worker/PG、实际私有文件备份恢复已验证；完整当前提交测试及CI绑定见[本轮交付说明](TALENT_EXPERIENCE_PR03.md)和`artifacts/talent-experience-pr03-staging/verification.json`。本分支未合并、未部署，Provider未验证，PR-03整体未完成；不进入集合/作品下一切片。

## 2026-10-01 PR-02a 开发状态

PR-01 已合并冻结、未部署。PR #30 在独立分支实现 PR-02a 的人才账号/认证/真实主体与最小登录页，保持 Draft 待复核；[本包交付与证据](TALENT_EXPERIENCE_PR02.md)。默认外部入口关闭，PROVIDER_VERIFIED=NOT_RUN。PR-02b 及后续功能未开始，PR-02 整包未完成；本轮没有生产迁移或部署。

## 2026-10-01：PR-01 已合并冻结，未部署

[PR #29](https://github.com/BA7IEE/once-production-os/pull/29) 已从 Draft 转为 Ready 并合并。合并前精确核对 head 为 `b74cb79702b517ee1a1ed2125587a9a107ec2801`，没有夹带新改动；合并提交与远端 main 均为 `79e064980fda7df9f90ea6a2fef13d3b3eeccb9f`，合并后的文件树与该 head 一致。

该 main 的 [完整 CI 36755091719](https://github.com/BA7IEE/once-production-os/actions/runs/36755091719) 已完成，7/7 SUCCESS：postgres-contract、browser-resume、browser-production、browser-talent-intake、browser-media、browser-handoff、browser-talent-directory。此处引用合并后的 main 运行，不沿用 PR 运行。核对记录见 `artifacts/talent-experience-pr01b/merge-verification.json`。

PR-01 正式冻结；未执行部署或生产迁移。55 次已有迁移保持不变。PR #27 未合并、未修改。仅在上述 main CI 全部通过后回填本状态；此前 Draft/待复核描述保留为历史记录，不代表当前状态。PR-02 从此 main 建立独立分支，当前进度见 [PR-02 启动记录](TALENT_EXPERIENCE_PR02.md)。Release A/B/C 仍未整体验收。

# 2026-09-30 Talent Experience 开发增量

当前新增范围与验收边界见 [TALENT_EXPERIENCE.md](TALENT_EXPERIENCE.md)。基线 PR #26 已合并；下面保留其历史交付证据，不能用历史“未合并”描述当前 main。人才外部入口尚未实现/开放，A/B/C 均未完成。

# 当前交付与剩余工作

本页按当前代码整理，不叠加旧批次的待办。2026-09-29本批开发状态，云端测试最终结果回填PR #26。

| 范围 | 代码状态 | 验收边界 |
|---|---|---|
| 人才2.0、工作台、合并、来源/共享媒体清理、完整关系导出重建 | 已实现 | 既有PG与浏览器证据见历史专项 |
| 内部中英文本、四类AI任务、人工确认、费用核对 | 已实现 | 真实模型端点NOT_RUN |
| 配置式AI SDK连接 | 已实现，三种协议 | HTTPS；无自动金额估算；真实供应商NOT_RUN |
| AI进程中断 | 四个位置已接入PG测试 | 本批CI待确认；不把旧单位置测试当全通过 |
| 图片、PDF附件、MP4封面 | 已实现 | PDF仅保留附件，明确未解析；不属于系统内OCR/抽取工作 |
| COS私有存储与文件维护 | 已实现 | SDK合同测试通过；真实桶/权限/网络PROVIDER_VERIFIED=NOT_RUN |
| 品牌与项目客户/品牌关联 | 已实现 | 7项核心专项通过；当前PG／浏览器／恢复验收见PR |
| 性能、恢复完整故障与正式接管 | 未整体验收 | 需参考环境和真实业务样本，不能以测试替身替代 |

本批没有新增网站、客户门户或商业流程，没有旧导出格式兼容，没有执行合并或部署。

开发范围收口：已知的品牌、媒体和AI中断实现已补齐。真实COS桶、真实模型端点、参考规模性能和实际业务接管属于待验收，不计为已经通过。机构仍被资质／经纪等专业记录引用时，删除会要求先逐项处理这些记录，不自动抹除专业事实。
