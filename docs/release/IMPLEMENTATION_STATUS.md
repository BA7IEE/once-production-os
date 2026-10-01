## 2026-10-01：PR-03C finalization（Draft待复核，尚未冻结）

本轮完成当前 Grant-bound exposure、Tag 新来源/父集合版本、失效来源退出 current、Collection 类型 identity 五项修正。没有 schema/迁移变化，1–63不改。本人明确获准后可使用内部正式素材，不借 uploader 或开放人物全部内部媒体；新增正式读与既有删除/合并/恢复保护一致。完整实测、反例、失败定位及最终head CI绑定见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-finalization/verification.json`。保持 Draft、未合并、未部署；不进入 PR-03D，Provider/COS/真实手机仍 NOT_RUN。下方内容为历史主体阶段结果。

## 2026-10-01：PR-03C 媒体集合（Draft待复核）

复用既有 Collection/Item/Tag，迁移63增集合封面、当前版本与标签历史状态；迁移1–62不改。本人服务器集合草稿、跨 Submission 自有 ADOPTED 原件复用、原子审核、内部主详情画廊和逐 Item 来源授权已接入；删除/合并/导出重建/实际备份恢复同步验证。当前实际测试数字与截图见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 和 `artifacts/talent-experience-pr03-collections/verification.json`。PR-03A/03B已复核冻结，PR #31继续Draft、未合并未部署，本轮等待复核，不进入PR-03D。Provider/COS/真实手机均NOT_RUN。下方旧“未进入MediaCollection”是历史状态。

## 2026-10-01：PR-03 ADOPTED 正式媒体授权修正（Draft待复核）

正式媒体改用统一 PersonMedia Person/Role/Source 当前授权，脱离原 Upload/Claim intake scope；STAGED继续严格接收范围。直接媒体、TD2、导出和合并预览一致，旧内部上传语义保留。无schema/迁移变更，1–62不改。A仅intake/B仅正式范围的Core、PG、Chrome图片与MP4 Range反例和本轮完整实测结果见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md) 及 `artifacts/talent-experience-pr03-formal-auth/verification.json`。PR #31保持Draft、未合并未部署，Provider未验证，尚未进入MediaCollection。

## 2026-10-01：PR-03 媒体归属与暂存底座（Draft待复核）

迁移62新增真实上传主体与PersonMedia关系，READY与STAGED/ADOPTED/RETIRED分离；本人/审核专用读、原子采纳及生命周期已接入。1–61冻结。真实Chrome手机宽度与异步worker/PG、实际私有文件备份恢复已验证；完整当前提交测试及CI绑定见[本轮交付说明](TALENT_EXPERIENCE_PR03.md)和`artifacts/talent-experience-pr03-staging/verification.json`。本分支未合并、未部署，Provider未验证，PR-03整体未完成；不进入集合/作品下一切片。

## 2026-10-01：PR-03 已启动

独立分支先实现内部受控视频播放，PR-03整体尚未完成、保持Draft、未部署；本人多来源媒体及生命周期待继续。当前能力、实际证据和明确剩余见 [PR-03交付说明](TALENT_EXPERIENCE_PR03.md)。

## 2026-10-01：PR-02 已合并、开发冻结、未部署

用户复核通过后，PR #30 从 Draft 转 Ready，并以 `9fc2f9295068a16a16e6409b6df1c230bbe055ca` 为 expected head 合并。合并后远端 main 为 `1a297d86ecfeac5d7a3c748322a867c9852a20c9`；[main 完整 CI 36815702669](https://github.com/BA7IEE/once-production-os/actions/runs/36815702669) **9/9 SUCCESS**，已核对精确 SHA，包含 PostgreSQL16 和全部8组浏览器。

**PR-02 已合并、开发冻结、未部署，PROVIDER_VERIFIED=NOT_RUN。** 真实认证发送及生产接管未验证，正式外部入口默认关闭。下方 Draft/待复核内容保留为历史记录，由本节覆盖。PR-03 从该 main 独立分支推进，不修改已合并 PR-02 的迁移1–61。

## 2026-10-01 PR-02b finalization

PR-02b主体复核通过、尚未冻结。本轮在PR #30修正终态审核只允许Commands原键重放、ENROLL全拒绝完整终结Claim及本人来源textPayload写保护。无schema/迁移变化，1–61冻结；继续Draft、未合并未部署，PROVIDER_VERIFIED=NOT_RUN。不进入PR-03。

详情及本轮证据见 [PR-02交付说明](TALENT_EXPERIENCE_PR02.md)。

## 2026-09-30 Talent Experience 首轮增量

本次已新增唯一人才建档入口和内部组合命令，姓名即可建立默认model草稿，支持多职业和普通联系人。无来源时为当前员工7天限定临时整理；结果未知显式原样核对。合同/ADR/迁移计划已回填，目录业务字段、未知量尺日期2.1、邀请/门户/投稿、多来源媒体/摄取、价格/分享/官网尚未完成；当前仍不向真实外部用户开放。

本轮证据与边界见 [TALENT_EXPERIENCE.md](TALENT_EXPERIENCE.md)，PR #28；以下保留历史记录，历史未合并状态不覆盖当前main。

# 当前实现状态

以 [当前交付清单](CURRENT_DELIVERY.md) 的代码能力与验收边界为准。

- 人才2.0、受控合并/迁移/清理、工作台、内部语言文本已接通。
- 四类文字AI、配置式SDK连接、人工采纳和费用核对已接通。
- 图片/不解析PDF附件/精选MP4封面、私有COS与本地存储、原件导出备份恢复已接通。
- 正式云供应商、性能参考环境、生产部署与接管不由合成测试代替，尚未验收。
- 品牌实体、所属机构和项目客户／品牌关联已接通，含权限、导出重建、删除与恢复；当前提交数据库／浏览器结果在 PR 回填。

本批证据、数据库升级与CI状态见 [媒体交付说明](MEDIA_COMPLETION.md) 及PR #26；历史逐批证据保留在 [历史实现记录](IMPLEMENTATION_HISTORY.md)，不再把旧的“AI未启动”等状态当作当前待办。

上线前两项运行故障已修复，定向回归通过；边界见[修复说明](PRELAUNCH_REVIEW_FIXES.md)，当前提交CI结果见PR。

外部staging审查R1/R2已修复，独立ops执行镜像和staging安全约束已补齐，参见[staging执行说明](STAGING_EXECUTION.md)。新提交验证见PR。

未决标记持久化限制为专用模块的固定单比特；静态规则继续拒绝业务正文及其他浏览器持久化访问。
