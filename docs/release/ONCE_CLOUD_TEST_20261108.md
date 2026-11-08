# 专业人才主页开发分支与云测试交接

用户要求推送准确交付、运行远端 CI，并在当前云工作区建立独立测试实例。原始交付 `19061493020a43d6f8a5fc03cf30ba28f3c710da` 已原样推送，基线仍为 `d998cf059ab912b62fcc33d2094c32c62c564bc1`；没有从 main 重建。开发分支为 `codex/once-professional-homepage-20261108`，[PR 41](https://github.com/BA7IEE/once-production-os/pull/41) 保持 Draft，不合并 main。

首轮 CI 的核心及全量 PostgreSQL 契约、历史升级和重建 CLI 已通过。失败记录保留在 Actions：旧浏览器脚本等待已拆分的整段导航文字、导航数量未包含材料收件箱、人才账号响应白名单漏掉默认关闭的主页功能开关、供应商升级脚本仍按 82 次迁移断言。跟进修正保留精确响应白名单，并验证 75→85 的历史数据、已应用校验和以及新主页表为空。迁移文件 1—85 不修改。

继续执行浏览器流程发现职业选择器使 1280×800 首张人才卡片底部超出首屏，修正桌面间距与封面尺寸；仍要求首张卡片完整出现在首屏，不放宽断言。失败尝试、手动资源核查和后续通过结果保存在 `artifacts/professional-homepage-ci/`。远端结果必须按最终分支 head 的 SHA 查询，首轮通过项不能代替跟进提交的检查。

## 实例与访问

独立实例目录是 `/workspace/once-homepage-test`，源码检出位于其 `source/`，不使用开发工作树的运行目录。`instance.json` 记录固定 SHA、端口及新建 PostgreSQL 容器和持久卷的精确归属；`build.json` 记录该 SHA 的编译文件指纹，`ci.json` 记录同一 SHA 的远端检查结果。运行控制器在这些条件不一致时拒绝启动。

实例以 `APP_ENV=test` 运行，API、TLS 代理和验证码网关只监听回环地址。工作区内入口为 `https://127.0.0.1:8443`，本人入口为 `/talent/login`。TLS 使用该独立实例的本地证书。此地址用于云工作区内浏览器，不是公网域名；工作区暂停后服务可能不可用，也不代表已配置长期云托管。

使用当前云工作区的 Desktop 浏览器访问该地址。连接器未提供可调用的云桌面控制工具时，可在 Codex 右侧面板的 New tab → Desktop 打开工作区桌面。浏览器实际验收使用同一工作区的 Chromium；必须以部署记录中的实际结果为准，打开面板本身不代表页面已验收。

## 账号、数据与生命周期

管理员登录名为 `cloud-owner`，随机口令只存于实例 `secrets/admin-password`。`secrets/test-login.txt` 保存本地账号操作说明。本人示例账号使用 `homepage.synthetic@example.com`，验证码仅进入权限 0600 的实例 `inbox.json`，不会发送到真实邮箱。验证码网关拒绝非 example 测试域。密钥、口令、验证码、会话及完整数据库连接串不进入 Git、PR 或共享验收包。

数据库、媒体、恢复 epoch 和安全日志均新建，与原 Mac 预览及其他开发库隔离。主页与客户提报功能在本测试实例显式开启。所有人物、作品、照片、PDF 和短视频均为合成测试资料；该部署不验证真实认证服务、COS、外部模型、真实手机或六周业务效果。

```bash
export PATH=/tmp/once-upgrade-toolchain/node_modules/.bin:$PATH
node /workspace/once-homepage-test/control.mjs status
node /workspace/once-homepage-test/control.mjs stop
node /workspace/once-homepage-test/control.mjs start
```

`stop` 先结束本实例 API、Worker、代理与验证码网关，再停止精确归属的数据库容器；保留数据库卷、媒体、日志及密钥。`start` 核对源提交、已通过 CI、构建指纹及容器标签后恢复该实例。PID 或归属不符时须人工核查，不能全局杀进程或执行 Docker prune。此实例是明确登记的持久测试资源，与 `ResourceRun` 临时验收容器分别管理。

首次部署需要在新空库完成全部迁移、管理员初始化和合成示例建立。后续继续开发先停止该实例并备份其数据库和媒体，再更新到通过 CI 的明确提交、重装锁定依赖、构建、执行新增前向迁移；不可再次 bootstrap 现有库，不可 reset 或覆盖密钥。应用过的迁移继续冻结。

实际部署检查、匿名公开地址、移动端截图、迁移数、Worker 与重启检查保存在 `/workspace/once-homepage-test/evidence/`；控制器及配置的非秘密副本可随验收包交接。应查询该目录和运行状态后报告是否已部署，不能只凭本说明宣布成功。
