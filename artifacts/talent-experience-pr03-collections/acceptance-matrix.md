# PR-03C 验收映射

真实浏览器：Chrome + Nest + PostgreSQL + 独立异步 worker；素材均为本轮生成的合成 PNG、H.264 MP4 和不解析的 PDF 附件。手机宽度不等于真机认证。

| 用户场景 | 证据入口 |
|---|---|
| 1–3 模卡、排序、PDF附件 | browser.json 360px；collection-draft-360.png；私有attachment响应核对PDF字节 |
| 4 素颜照多图 | browser.json polaroids-two-images；430px已采纳画廊 |
| 5 Portfolio照片+视频，无Work | browser.json portfolio-photo-and-video-without-Work；390px画廊 |
| 6–7 Showreel/介绍视频播放、seek | browser.json Chrome-real-H264-play-decode-seek-and-Range；390px复用同一MP4 |
| 8–10 封面、复用、只移除关系 | tests/support/media-collections.ts collectionScenario，Core/PG；浏览器同原件多集合 |
| 11–14 STAGED/RETIRED/他人/错Role拒绝 | collectionScenario / collectionSecurityScenario，Core/PG；生产浏览器增加跨人物引用422 |
| 15–16 逐Item来源、集合自己来源失效 | collectionSecurityScenario，Core/PG |
| 17 保存刷新 | 三种宽度服务器草稿roundtrip，显式核对首项和封面 |
| 18 当前账号、他人素材 | collectionScenario负例 + collectionEnrollScenario；browser.json双标签页账号切换 |
| 19 ADOPTED跨Submission复用 | collectionScenario：第二Submission使用原Asset，Asset总数不增；历史版本保留 |
| 20 SUBMITTED冻结 | collectionScenario：新命令修改409；DB insertion guard拒绝冻结后追加 |
| 21–22 审核失败全回滚/成功原子采纳 | FaultStore在PrismaStore事务审计处注入失败，Core/PG核对Asset/Collection/Items/Tag/cover；原键重放 |
| 23 账号切换旧页拒绝 | browser.json two-tabs-account-switch-clears-old-view-and-rejects-old-read-write |
| 24–25 merge与精确Role冲突 | collectionMergeScenario + 冻结的media-staging/talent-v2-merge全量回归，Core/PG/生产浏览器 |
| 26 删除保护和真实清理 | collectionEnrollScenario及旧talent-source-person-erasure，Core/PG；生产浏览器真实私有文件purge，独立来源保留 |
| 27–28 导出重建仅正式资料 | collectionExportScenario / collectionRebuildScenario，真实export worker、JSON重建、无Grant/Submission |
| 29 pg_dump/restore | restore.json：私有字节hash、Collection/Item/Tag/cover/current、恢复隔离、旧授权拒绝 |
| 30 完整手机操作 | 360/390/430px：上传→排序封面→保存刷新→提交→审核→本人正式画廊；主详情截图 |

增量迁移：upgrade.json 从已填充的62升级63，旧集合/顺序/说明/标签和上传列逐项比较，新cover为空、current=false，不伪造历史选择。PG另测cover FK、同人物Item FK、唯一当前版本与重复Asset/orderIndex。

最终汇总见 verification.json。失败历史单独保存，最终通过不依靠跳过测试、增加重试或延长超时。
