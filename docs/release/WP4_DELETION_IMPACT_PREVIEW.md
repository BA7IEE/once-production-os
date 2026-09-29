# WP4｜DEV-07B 删除影响预览与 DRAFT 申请

日期：2026-09-24。应用版本 `0.1.0-dev.1`。分支 `feat/deletion-impact-preview`，PR #11，基于 DEV-07A / PR #10。

本批只实现**删除前的影响证明与草稿申请**。没有真正删除、阻断、清理或 ERASED 执行。

## 1. 为什么先做预览

FR-13 要求“先预览影响、再阻断、最后清理”。直接做删除按钮会让系统无法回答：这个 Source/Person/Work/Project/Asset 已经进入哪些关系、Shortlist、用途许可和旧导出？因此 DEV-07B 先把依赖图做成可测试事实。

## 2. 当前能力

新增 `data.delete` 高风险权限。ADMIN 默认具备，其他角色需显式附加。

新增接口：

```text
POST /api/v1/deletion-requests/preview
GET  /api/v1/deletion-requests
POST /api/v1/deletion-requests
GET  /api/v1/deletion-requests/{id}
```

`preview` 是 POST 查询：需要 Origin/CSRF，但不带 Idempotency-Key，不写业务数据。

目标类型：SOURCE / PERSON / WORK / PROJECT / ASSET。

当前扫描覆盖：

- SourceHistory、Person/Work/Project/Asset；
- Contact、FieldEvidence、ImportBatch、Upload、Handoff；
- WorkCredit、WorkAsset、ProjectParticipant、ProjectWork；
- ShortlistItem / ShortlistItemAsset；
- UsePermission；
- ExportDependency 与派生 Export payload。

每条具体影响包含 dependencyKind、proposedAction、evidenceState、detailCode。自动能证明的项标 `PROVEN`；可能存在独立合法依据或备注内容的项标 `REVIEW_REQUIRED`。

## 3. 隐藏依赖规则

删除预览不能变成跨 scope 枚举器。

如果当前账号能看到目标，但某个依赖对象自身 scope 不可见：

- 不返回该对象 ID；
- 只增加 unresolved 计数和类型；
- `complete=false`；
- 禁止创建 DRAFT 删除申请。

Source 可见不代表同 Source 下后来被收窄 scope 的 Person/Work/Project/Asset 自动可见。Asset → ShortlistSelection 也重新检查 Shortlist 根权限。

单次最多冻结 1000 个具体影响；超过上限同样进入 unresolved，不假装“已完整扫描”。

## 4. 预览陈旧与 DRAFT

创建申请时服务器会重新执行同一影响扫描，并比较 `previewDigest`。

因此：

- 目标 revision 变化 → 409；
- 预览后新增关系/依赖 → digest 改变 → 409；
- 出现隐藏/未解析依赖 → 拒绝创建。

只有完整影响图才能写入：

- `deletionRequests`
- `deletionItems`

Request 冻结目标 revision / protectionEpoch、影响计数、previewDigest 和申请原因；Item 冻结具体影响。

当前 state **只有 `DRAFT`**。数据库 CHECK 不允许本批伪造 `BLOCKED_FOR_USE`。

## 5. DRAFT 不做什么

创建 DRAFT 后：

- Person/Work/Project/Source/Asset 不改变现有状态；
- protectionEpoch 不递增；
- 读取不被阻断；
- Export payload 不被擦除；
- Media 不被清理；
- Shortlist / Work / Project 关系不被删除；
- 页面不存在“执行删除”按钮。

持久化申请详情只返回摘要计数，不回显被冻结依赖 ID，避免未来 scope 收窄后旧申请变成读取旁路。

## 6. 数据库约束

新增迁移 `202609240008_deletion_impact_preview`：

- deletionRequests
- deletionItems
- `data.delete` 加入受控 extraPermissions 白名单
- typed target FK 绑定同 workspace、同 source 的真实 Person/Work/Project/Asset
- `unresolvedCount=0` 才能持久化 DRAFT
- 影响项 action/evidenceState 有 CHECK
- Request + Items + Audit + Receipt 保持同事务

## 7. 实际验证

功能 head：`9ef5a6fbdc5c78e4ad0fbd10fc3e5e758efdd273`。

Actions [36019151162](https://github.com/BA7IEE/once-production-os/actions/runs/36019151162)：

| 检查 | 结果 |
|---|---|
| 请求契约 | 96 条 PASS |
| 核心/传输 | 237/237 |
| PostgreSQL | 52/52 |
| 原生表单 Chromium | 6/6 |
| browser-resume / handoff / media / production | 全部 success |

真实浏览器日志：

```text
PASS DEV-07B browser: impact preview -> DRAFT request; target remains readable and no delete execution exists
```

真实 PG 验证 typed target/source 约束、DRAFT 不阻断目标，以及 deletionRequests / deletionItems / audit / receipt 四个写后故障点整事务回滚。

## 8. 仍未完成

下一批 DEV-07C 才能实现：

1. DRAFT 的明确批准/版本复查；
2. `BLOCKED_FOR_USE` 与 protectionEpoch 变化；
3. 清理任务独立于原申请人当前是否在岗；
4. Source 正文、Contact、Media、Shortlist 备注、Export payload 等实际处置；
5. 有独立合法依据的保留决定；
6. ERASED 最小头与可审计结果。

在这些完成前，FR-13/T13 不能标完成，也不能接管正式资料。
