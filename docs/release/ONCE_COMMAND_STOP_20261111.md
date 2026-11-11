# ONCE 取消回执持续缺失：受控停止及恢复验收

本记录对应本提交内的源码和独立专项证据；验收时的父提交为 `2e327e01897002ca8027095e431010583197dbc0`，工作树包含本次修改，具体源码与构建摘要见各次 `result.json`。本地测试、远端 CI 和真实供应商验收分别计数，互不替代。PR #41 保持 Draft，不涉及合并或部署。

## 处理与边界

- 回执的 404 只表示本次读取未找到，不能证明取消未发生。同一账号的原请求键若已有任何业务回执、出现歧义、权限失效或状态读取失败，保留待核对，不盲目重发原取消。
- 在原回执和停止状态的受控读取满足条件时，用户可明确选择停止。服务端在同一事务中核对原键并记录独立的停止栅栏；新的支持栅栏的写入者拒绝此后到达的同键 TALENT portal COMMAND。停止回执只证明栅栏，不能证明原业务请求此前是否发生，不自动取消上传、释放额度或宣称物理清理完成。
- 新取消请求保留原请求键及一项有版本的关联摘要。摘要绑定请求键、取消目标和预期版本，但不保存文件名、原目标、版本数字、请求正文或凭据；摘要仍是可关联元数据，不应称为绝对匿名或用于日志。回执同时核对摘要和实际返回的目标/版本；首个 POST 仍在途中时不能再次发送。
- 旧门户三字段标记如读到无法证明归属的 200 回执，继续待核对并提示联系 ONCE；若两个受控读取均表明未找到，才可选择受控停止。为保持既有非取消流程，新非取消标记只增加分类并沿用通用回执语义；这不是业务操作的加密绑定证明，通用回执同键跨操作误认的历史边界不属于本次关闭范围。独立主页标记也保留原通用语义。
- 本功能默认关闭。`PORTAL_COMMAND_STOP_ALL_WRITERS_VERIFIED=true` 是操作者的明确断言，并非系统自动证明：启用前必须确认同库所有 portal 写入实例均执行栅栏检查且旧实例在途请求已排空。停用开关不会让不识别已有栅栏的旧版本安全；回滚前必须停止相关写入并安全处理存量栅栏。绕过同一 Store/数据库锁的写入者、不同数据库、文件内容 PUT 不在此栅栏保证内。
- 安全 journal 及恢复分析对已提交停止、拒绝的迟到取消及缺失完成标记保持 BLOCKER；没有伪造 abort，也没有扩大自动恢复白名单。日志和数据库的备份/恢复闭环与混合版本上线、回滚的实际演练仍未完成。

## 实际执行与失败保留

- 新客户端与既有 transport 定向测试：`node --experimental-strip-types --test --test-concurrency=1 tests/core/portal-command-stop-client.test.ts tests/core/portal-command.test.ts`，Node 22，83/83 通过。涵盖错目标/版本、错摘要、旧标记、发出中的互斥、摘要失败、回执与旧异步响应迟到等；是本地 mock 测试。
- 服务端及真实文件 journal 定向测试：`node --experimental-strip-types --test --test-concurrency=1 tests/core/portal-command-stop-server.test.ts tests/core/portal-stop-recovery-boundary.test.ts`，Node 22，21/21 通过。业务 API 使用 MemoryStore，journal 文件与恢复分析器是真实实现；并不等同 PostgreSQL 验收。
- 在最终源码上合跑上述四个文件为 104/104、无跳过；[TAP](evidence/once-command-stop-20261111/focused-tests.tap) 与[测试命令及文件摘要](evidence/once-command-stop-20261111/focused-tests.json)留档，范围仍是客户端、MemoryStore 与真实文件 journal，不代表数据库或远端 CI。
- `pnpm contract:check`、`pnpm typecheck`、`pnpm review:static`、API/Web 构建通过。首次静态检查曾因动态存储键违反现有 AST 护栏而失败；实现改为允许的固定键后复验，未修改或放宽护栏。Node 24 下首次 journal 测试因现有 `fs-ext` 与运行时 ABI 不符而未运行，改用仓库指定的 Node 22 复验，未重编依赖。
- [首轮隔离浏览器结果](evidence/once-command-stop-20261111/baseline/result.json)：真实 PostgreSQL/Nest/Chromium、合成账号、本地存储替身，27/28 项通过。失败项 `same_page_after_stop_feedback` 为成功停止后同页残留先前网络警告；上传仍为 OPEN、取消入口可用且额度未释放，重开后警告消失。首轮 [资源记录](evidence/once-command-stop-20261111/baseline/resources.json) 为 FAIL / ZERO_RESIDUE，原件保留。[归档的首轮脚本副本](evidence/once-command-stop-20261111/baseline/executed-script.mjs)通过精确摘要复原，摘要与首轮结果一致；复验使用当前测试脚本。先前 `4f4443c6f4de72446fdb94f7`、`80a96f46009486b9ced0dd9f` 的 CLEANUP_FAILED 原件及后续核对继续保留于 [原台账](evidence/once-media-ux-20261111/)。
- 两个人才页面的停止完成处理已在成功刷新和确认当前标记后，通知素材组件清除旧错误，保留实际上传状态及额度。供应商人才页面的[隔离复验](evidence/once-command-stop-20261111/reviewed/result.json)为 28/28，通过项包括原取消未送达、停止后原请求迟到返回 409、已提交取消或停止但响应丢失后的恢复、绑定/目标/版本伪造负控、旧标记的其他操作回执，以及新请求键下用户主动取消。真实 PostgreSQL 排队竞争观察到两请求均在锁上等待，最终取消先成功、停止返回 409；另一顺序以先建立栅栏再投递原请求的真实请求证明，并非声称两种锁竞争顺序都已实测。[复验资源记录](evidence/once-command-stop-20261111/reviewed/resources.json)为 PASS / ZERO_RESIDUE。
- 旧人才页面另用独立 PG/Nest/Chromium 夹具[定向验收](evidence/once-command-stop-20261111/legacy/result.json) 7/7：同页停止后旧错误清除，原上传仍 OPEN 且额度保留，迟到取消被拒、重开状态一致，用户主动新建请求键后可取消。[资源记录](evidence/once-command-stop-20261111/legacy/resources.json)为 PASS / ZERO_RESIDUE。
- 更新后的[既有取消恢复脚本](evidence/once-command-stop-20261111/cancel-regression/result.json)在另一套受管隔离 PG/Nest/Chromium 栈运行 6/6 通过，涵盖原请求在服务端已提交后响应丢失、同页与刷新读取绑定回执、重复点击及旧状态读取。其[资源记录](evidence/once-command-stop-20261111/cancel-regression/resources.json)为 PASS / ZERO_RESIDUE；使用新目录，未覆盖此前验收原件。
- 真实浏览器专项采用 `source /workspace/.once-cloud/env.sh` 后，由 `ONCE_RUNNER=managed-linux`、独立 `ONCE_ACCEPTANCE_EVIDENCE_DIR` 和 `/usr/local/bin/docker-init -s -- node scripts/test-command-stop-20261111.mjs` 启动；旧人才页使用 `scripts/test-command-stop-legacy-20261111.mjs`。均使用已登记容器和临时目录，三个结果分别绑定自己的工作树与构建指纹。

## 未执行

真实认证供应商、真实 COS、真实短信/邮件和真实个人资料均 NOT_RUN；需要事先确认独立测试租户、测试账号、隔离存储、费用边界和不触达真实用户的授权。微信/物理手机、六周真实业务试点、生产部署、自动物理清理闭环、全量混合版本和回滚演练均 NOT_RUN。GitHub Actions 的完整结果须单独绑定本次实际推送 SHA；不能继承父提交结果。
