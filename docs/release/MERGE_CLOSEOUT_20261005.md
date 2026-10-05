# PR #38 主分支收尾（随合并提交生效）

用户在2026-10-05明确要求“合并撒 收尾收干净呀”。本记录替代下方旧文档中的 Draft / 不合并限制；部署尚未授权。

## 整合范围

PR #38 直接以 main 为目标，保留 merge commit，一次包含 PR #31–#38 的开发提交：本人媒体/集合/案例、外部 Agent A–D、来源/导入业务流、后台操作入口和七项复核修复。原 main 为 `1a297d86ecfeac5d7a3c748322a867c9852a20c9`，是修复 head `31390f425d0940735c655024bb16a0dd56e4d9c7` 的祖先。仅关闭已核对为主分支祖先的旧 PR；未被包含的独立工作保留。

完整整合含既有迁移62–75；此前已应用迁移保持原字节。最新七项修复及本次 CI 收尾没有 schema、迁移或依赖变动；旧无障碍回归发现城市单选的可访问标签失联，已补明确单控件的id/aria透传，保留复合多选自身标签。

## CI 收尾

主分支原17组验收仍直接调用低层数据库/浏览器脚本，无法继承现有资源登记。这次将17组全部改为 `test:postgres:owned`，浏览器复用已验收的临时目录和 BrowserServer 登记；各组原业务断言保留。旧旅程通过当前导航、实际高级JSON面板和当前审核任务入口操作；当前迁移严格预期75并保留checksum/旧数据no-op断言。完整类型、Core、契约与静态检查由同次 flow-review CI运行，各历史浏览器独立构建。两个工作流均核对本次实际 head；flow-review也在main合并提交执行。

完整PG保留全部既有案例及真实JSON重建CLI。新建的逐案例 sibling DB在案例退出后释放，登记集合只含本次创建的DB，既有基线库和外部库不在删除范围；整个容器仍在finally按本轮标签回收。PG资源上限保持512MiB；总PG验证有界20分钟，浏览器单组3分钟，失败不能写PASS。更长ResourceRun ID的派生库名使用16字符后缀，避免PostgreSQL标识符截断。

本地仅核对YAML/JavaScript语法及12项owned编排模拟，未在高Swap的共享Mac启动数据库、浏览器或构建。合并前与main合并后的最终CI记录以 [PR #38](https://github.com/BA7IEE/once-production-os/pull/38) 和 [Actions](https://github.com/BA7IEE/once-production-os/actions) 的实际SHA/状态为准；该记录不预先将待运行步骤写PASS。业务修复 head31390的 [CI 37265584287](https://github.com/BA7IEE/once-production-os/actions/runs/37265584287) 已通过，旧记录只支持对应head。

## 本地收尾与验收边界

主目录原有未提交内容须先保存为可恢复的Git stash并核对文件指纹，再将main快进到远端。私密配置、数据库/媒体目录、依赖和历史数据不删除。本聊天的临时worktree交由Codex archive保存快照后回收；原CI私有证据先迁出该worktree的Git登记目录。其他聊天的工作树保留，不批量删除。

本次为代码合并与开发收尾，未部署。真实模型/认证供应商、COS、物理手机、业务人员无提示验收、生产迁移、正式镜像与恢复演练仍为NOT_RUN，M0/M1/M2/M3不因此关闭。先前七项实测边界及首次失败详见 [修复记录](BUSINESS_FLOW_REVIEW_FIXES.md)。

首次主线CI37269168395保留失败：旧导航名称、75与硬编码74不符、城市单控件标签失联。CI37269168410原七项工作流通过；随后以新head复验上述修正，不把旧绿色结果套用。
