# 实际测试与验证记录

应用版本：0.1.0-dev.1。规格输入：v0.3。下列结果只适用于这批源码，不是完整一期验收。

## 2026-09-23 接力实测

环境：macOS，Node 22.22.3，pnpm 10.14.0，隔离 PostgreSQL 16 容器（镜像 `postgres@sha256:a3b7f434b2dc57ce85a67e171163eb8ab1a1ebcb39d27484661f26b1dfbe30d6`）。本地配置由 `node scripts/init-local.mjs` 生成；密钥和数据库 URL 只保存在忽略目录中。

最终完整验证日志：[online-run-20260923.txt](../../artifacts/online-run-20260923.txt)。

| 检查 | 实际结果 | 边界 |
|---|---|---|
| `pnpm verify:online` | PASS；真实锁文件、冻结安装、Prisma validate/generate、37 条请求契约、完整服务端与 React 类型检查、transport 类型检查、111/111 核心测试、11/11 静态检查、Nest/React/Vite 构建、生产依赖审计 0 个已知漏洞 | 审计是当日已知漏洞快照，不是供应链安全认证；核心测试仍用 MemoryStore |
| `pnpm db:deploy`、`prisma migrate status` | PASS；新建 `once_local` 应用唯一初始迁移，状态为 up to date | 只验证空的本地开发库；未演练升级已有业务数据 |
| 新建 `once_test_eb45122e`、`pnpm verify:postgres` | DB_TESTED；6/6 断言通过，覆盖同键竞争、回滚、跨空间组合外键、并发 CAS、双 Worker 租约 | 独立测试角色；保留合成记录；未做进程崩溃或压力测试 |
| 本地真实 API、Worker 与无头 Chrome | BROWSER_TESTED；登录、开通/激活编辑及审核员、共同范围、编辑建档、来源核验、字段确认、JSON 预览与提交、Worker 完成、来源暂停阻断后续读取、退出全部通过；页面脚本异常 0 | 只跑一条合成主链路；异常响应、网络未知、移动宽度、焦点、联系方式等完整清单未覆盖 |
| `/health/live`、`/health/ready` | PASS，分别返回 `alive`、`ready` | readiness 不证明迁移漂移或备份恢复 |
| 排除 `.env`、`.secrets`、依赖和构建目录的包检查 | PASS；76 个本地文档链接、62 个源码指纹检查无问题 | 检查的是隔离打包副本，不是秘密扫描或生产镜像验收 |
| `sha256sum -c MANIFEST.sha256` | PASS；当前清单覆盖 113 个交付文件 | 文件指纹不是代码签名 |

首次真实 typecheck 发现前端 `Field` 重复 `hint`，已去掉过期的 UTC 日期文案。首次审计发现 Nest 及传递依赖漏洞；将 Nest 三包锁到 11.2.5，并显式覆盖 Multer 2.3.0 与 Prisma 配置依赖 deepmerge-ts 8.0.1 后，全链重跑通过。两个传递依赖覆盖仍需随上游版本持续复核。许可证清单为 MIT 114、Apache-2.0 11、BSD-3-Clause 3、BSD-2-Clause 1、ISC 5、0BSD 1；该清单不等于完成法律审查。

支持周期核查：2026-09-23 时 [Node 22 为 LTS](https://nodejs.org/en/about/previous-releases)，[PostgreSQL 16 仍受支持至 2028-11-09](https://www.postgresql.org/support/versioning/)；[Prisma 6 只收安全补丁至 2026-11-19](https://www.prisma.io/docs/orm/release-status)。因此本次锁定适合继续隔离开发，后续需安排 Prisma 主版本迁移与回归，不作为长期生产版本承诺。

未执行：完整浏览器异常/可访问性清单、CI、正式镜像构建、供应商服务、备份/恢复/删除、生产数据导入和部署。M0/M1/M2/M3 均不能标为完成。

以下第 1–4 节是 2026-09-22 首次离线交付的历史记录；其中当时的 `NOT_RUN` 不覆盖上表的新实测结果。

## 1. 实际执行结果

核心测试汇总：**111 个测试，111 通过，0 失败**，没有跳过项。实际运行命令：

```bash
node scripts/run-core-tests.mjs
```

| 测试文件 | 测试数 | 通过 | 失败 |
|---|---:|---:|---:|
| `client-transport.test.ts` | 6 | 6 | 0 |
| `commands-imports.test.ts` | 22 | 22 | 0 |
| `http-contract.test.ts` | 1 | 1 | 0 |
| `identity.test.ts` | 25 | 25 | 0 |
| `json-validation.test.ts` | 27 | 27 | 0 |
| `local-config.test.ts` | 4 | 4 | 0 |
| `talent.test.ts` | 26 | 26 | 0 |

这些测试是规则、客户端传输与测试专用 HTTP 入口的断言，不是一一对应 FR 的产品验收。并发用例使用串行事务 MemoryStore，不能证明 PostgreSQL 在相同负载下的表现。

`http-contract.test.ts` 确实打开本机回环 HTTP 端口执行 CSRF、登录、建档、读取、重复请求、错误 Origin 和退出链，但它使用 Node HTTP Harness，而不是 Nest/Express，不替代浏览器 cookie/CSP/界面行为验证。

`client-transport.test.ts` 使用受控 fetch 返回模拟超时、500、409、坏 JSON 等响应；验证前端请求模块，不运行 React 页面。

`local-config.test.ts` 实际在临时目录创建随机密钥文件，检查权限与拒绝覆盖，并验证配置/生产 HTTPS 拒绝规则；结束删除的是该测试自己创建的临时目录，不是项目数据或用户文件。

原始结果：[汇总 JSON](../../artifacts/core-test-report.json)，[完整运行日志](../../artifacts/core-run.log)，逐文件 TAP 在 `artifacts/core-tests/`。

## 2. 其他已执行检查

| 检查 | 结果 | 准确边界 |
|---|---|---|
| 请求契约再生成比对 | PASS，37 条路由 | 路径、输入 Schema、Inputs；不是完整响应 Schema |
| 核心 TS strict typecheck | PASS | 本机全局 TS 5.8.3 + 全局 @types/node 25.1.0，不是项目锁定依赖 |
| 客户端 transport/DTO typecheck | PASS | 无 React 依赖的传输部分；不是全部 TSX |
| 静态源码检查 | 11 项通过，0 项失败 | 28 份生产/前端/配置源码语法与有限 AST/契约检查；不是完整 build |
| 数据库测试入口安全拒绝 | PASS（预期退出码 2） | 未给测试许可/URL 时不连接数据库；不是 PostgreSQL 测试通过 |
| 原始文档指纹 | 16/16 保持一致 | 对原文件内容验证，不证明文档全部需求已实现 |

实际命令与源文件摘要在 [verification.json](../../artifacts/verification.json)。在有真实依赖的环境必须重新使用项目自己的 @types/node 和完整 tsconfig 检查。

TAP/JSON 的 generatedAt 使用执行容器的时钟，原样保留为证据；测试数据使用固定 FakeClock，不用它声称实际业务发生时间。

## 3. 未执行 / 被环境阻挡

| 项目 | 状态 | 原因/接力要求 |
|---|---|---|
| pnpm 真实安装与锁文件 | BLOCKED | npm 域名解析失败；[探测日志](../../artifacts/dependency-network.log) |
| Prisma validate/generate | NOT_RUN | 真实 CLI 与依赖不可用 |
| 初始 SQL 执行、迁移一致性、组合 FK | NOT_RUN | 环境没有 PostgreSQL；[专用测试源码](../../tests/postgres/integration.test.ts) |
| NestJS 全部类型/构建/HTTP适配 | NOT_RUN | 依赖未安装，未用假声明绕过 |
| React/Vite 全部类型/构建/浏览器 | NOT_RUN | 无依赖/浏览器应用产物 |
| Docker 镜像和 Compose 启动 | NOT_RUN | 未执行 Docker；文件为候选配置 |
| 依赖漏洞/许可证/镜像检查 | NOT_RUN | 没有真实解析后的供应链清单 |
| 压力测试、私有存储、AI调用 | NOT_RUN | 对应基础设施/模块未实现或未连接 |
| 真实数据导入、备份、恢复、生产部署 | NOT_RUN | 未授权/未准备生产环境；尚不具备试用门槛 |

## 4. 复现纪律

不能把 MemoryStore 改名为 PostgreSQL 来写 DB_TESTED；不能把 AST 语法检查写为完整编译；不能把缺少的程序用 Mock 菜单补齐后标记完成；不能将本包未开发的 AI/媒体改为 DEFERRED 来让验收全绿。

后续先执行 LOCAL_RUN 的在线与真实 DB/浏览器环节，保留新锁文件、测试环境和日志，再更新进度。任何代码修改都要重跑对应测试并更新摘要。
