# 受限 staging 执行入口

本页只定义执行包与验收顺序，不表示已部署。固定候选提交和镜像摘要，不从旧main取代码；API、Worker及ops必须来自同一提交。只对独立新测试库使用以下步骤，旧库不清空，54次已应用迁移不改写。

## 镜像与身份

在目标架构构建 `docker build --target ops -t once-ops:<sha> .` 和 `docker build -t once-runtime:<sha> .`，记录 `docker image inspect` 的ID。ops包含锁定Prisma CLI、源运维脚本、Node和PostgreSQL16客户端；runtime只保留生产依赖。二者默认使用UID/GID1000，卷目录需由该身份访问。禁止把凭证写入镜像。基础镜像使用固定digest，升级单独验证。

示例容器命令中的环境文件、网络与卷需要由部署人员提供；以下不是可直接粘贴连接正式环境的默认配置：

```
docker run --rm --env-file <私有ops环境文件> --network <测试网络> <卷挂载参数> once-ops:<sha> migrate
docker run --rm --env-file <私有ops环境文件> --network <测试网络> <卷挂载参数> once-ops:<sha> migration-status
docker run --rm --env-file <私有ops环境文件> --network <测试网络> <卷挂载参数> once-ops:<sha> bootstrap
```

bootstrap仅用于空安装，口令从BOOTSTRAP_PASSWORD_FILE读取，不放命令行。任何命令非零退出都停止下一步，不清库或跳过失败。`docker run --rm once-ops:<sha> help`查看支持命令；参数错误返回2。

## 必须配置

- APP_ENV=staging，APP_ORIGIN为精确HTTPS Origin，COOKIE_SECURE=true；应用现在在staging启动时也强制这两项。
- 初始ACCESS_MODE=MAINTENANCE，DATA_EGRESS_MODE/DATA_CLEANUP_MODE/DATA_MERGE_MODE全部DISABLED。数据库恢复批次匹配并完成检查后才改INTERNAL；各业务开关按实际场景另行启用。
- HOST=0.0.0.0；受限TLS入口只向受邀人员开放，不缓存/api和私有媒体；数据库和应用端口不直接暴露公网。TRUST_LOOPBACK_PROXY只有确实使用本机可信代理且覆盖转发头时才开启。
- 独立数据库、域名、密钥文件和COS桶。API、Worker共享私有MEDIA_ROOT；SAFETY_JOURNAL_FILE使用另一独立私有目录，API/Worker/ops共享同一个本地主机卷及锁inode，禁止NFS/SMB及运行中删除锁。
- API默认入口；Worker使用 `node dist/apps/api/src/worker-main.js` 启动第二个容器，使用相同环境与卷。ready不替代Worker存活、队列或供应商检查。
- COS凭证需要Put/Get/DeleteObject、GetBucket（列对象）、GetBucketAcl、GetBucketVersioning、GetBucketPolicy；桶私有、无桶策略、从未启用版本控制。真实桶闭环仍待验收。

## 备份和恢复

先停止API与Worker写入，确认没有活动任务；保留安全日志，不以备份副本覆盖当前日志。ops容器挂载私有备份目录。

- 备份：设置DATABASE_URL_BACKUP、BACKUP_QUIESCED=yes、ACCESS_MODE=MAINTENANCE及三个执行开关DISABLED，执行 `backup --output-dir <私有空目录>`。保留生成的manifest、数据库dump、媒体bundle以及对应密钥。
- 数据库恢复：只对另外新建的隔离空库，用同一ops镜像的 `--entrypoint pg_restore` 执行 `--exit-on-error --no-owner --dbname=<目标数据库名> <dump文件>`；PGHOST/PGPORT/PGUSER/PGPASSWORD使用私有环境文件，不在命令行放密码。严禁 `--clean`，目标确认由维护人员完成。
- 媒体恢复：`restore-media --backup-manifest <manifest> --media-bundle <bundle> --target-root <新私有目录>`。
- 恢复准备：`prepare --actor-login <账号> --expected-source-sha256 <备份来源摘要> --apply`。先按原脚本CHECK模式核对；所需显式环境许可继续由脚本检查。
- 检查：`check --actor-login <账号> --recovery-run-id <准备产生的编号> --record`。
- 批准：`approve --actor-login <账号> --recovery-run-id <编号> --backup-manifest <manifest> --database-dump <dump>`先CHECK；只有报告通过、维护人员确认后才添加原脚本要求的许可与 `--apply`。批准不会自动开放INTERNAL。

恢复命令使用DATABASE_URL_RECOVERY指向隔离目标，并设置新的RECOVERY_EPOCH_FILE；写入prepare/check/approve分别要求ALLOW_RECOVERY_PREPARE=yes、ALLOW_RECOVERY_CHECK=yes、ALLOW_RECOVERY_APPROVE=yes。准确参数以各脚本Usage和现有恢复说明为准，ops入口不取消任何校验。进程中断或结果未知先检查状态，不自动重发不可逆操作。

## 本批已验和仍待验

R1/R2新增测试覆盖丢失成功响应后认证/权限/限流拒绝、畸形2xx、同身份重放、跨身份阻断和刷新后人工核对。原请求正文仅在内存中保留；sessionStorage只保存一个未决标记，不保存正文、密钥或账号。

浏览器关闭前提示未决操作；刷新后限制新命令，用户检查记录后显式解除。登录回原账号后可使用页面“原样核对上次提交”；其他账号看不到该请求且不能重放。服务端继续检查当前身份、权限、范围与回执内容。

真实COS、真实模型、目标架构全链路部署、媒体操作系统级隔离和累积数据容量/p95仍需在受限staging实测。本轮不开放公众上传，不把容量风险写成已经发生的性能缺陷。

本机Linux/arm64已实际构建runtime及ops：运行镜像API/网页/文件锁冒烟通过；ops执行54次空库迁移、migration-status、bootstrap、pg_dump备份及pg_restore到另一空库均通过。使用临时隔离Docker网络与合成数据，无业务库写入。目标服务器架构仍需对应构建验收。
