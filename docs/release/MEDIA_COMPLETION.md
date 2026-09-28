# 媒体交付说明

## 用户最新范围

PDF只作为私有附件：服务端核对声明、大小、摘要及文件头，不解析PDF语义，不执行脚本，不提取文字、不做OCR；预览接口只产生固定占位JPEG，页面明确“未解析”，原件走既有受控导出。格式有效性和内容处理交给外部Agent。未安装Poppler或PDF库。

图片保持30MB上限、重编码和元数据移除。PDF上限50MB。精选MP4上限200MB/30分钟/60MP，仅取封面，不提供大型原片转码或在线播放。ffprobe/ffmpeg位于无凭证环境的子进程，执行超时、最大输出和Linux进程树RSS受限；这不宣称完整操作系统安全沙箱。

数据库第51次追加迁移扩展mime及按类型大小约束，保留原ID、内容和前50次迁移。界面、请求契约、导出/重建均接收新类型；备份恢复复用原件和JPEG预览双摘要。

## COS配置

`MEDIA_PROVIDER=cos`、绝对`MEDIA_ROOT`（API与Worker共享的私有暂存/封存目录）、`COS_BUCKET`、`COS_REGION`、`COS_PREFIX`（应用独占目录名）、绝对`COS_CREDENTIALS_FILE`。凭证文件0600 JSON：SecretId/SecretKey；不提交仓库。使用精确锁定的官方cos-nodejs-sdk-v5 3.0.0与HTTPS，无公开或签名下载地址下发。

专用桶必须private、未启用过版本控制且无bucket policy（授权使用CAM）；启用过后即使Suspended也拒绝，避免普通删除只留下删除标记。每个上传/处理尝试拥有独立对象路径，写入禁止覆盖，读取严格字节上限及SHA256；原始SDK错误不进入响应日志。云端读取仍在服务端当前身份/来源/范围两次复查之间进行。

备份从实际提供方读取原件并生成可离线校验的local bundle。设置MEDIA_PROVIDER=cos后，原有恢复/重建工具同时将已校验文件送入指定COS；同键恢复重试必须逐字节核对，不覆盖旧对象。迁移到新桶使用新的恢复目录，不改已有目录绑定。

清理先移走本地上传目录，禁止迟到写入启动，再删除COS并复查空目录，最后确认物理完成。存在结果未知的云写入标记时明确阻断，不伪报删除成功；需维护人员核对云端写入并处理未决状态。真实COS故障/权限/物理删除需要专用桶验收，当前NOT_RUN。

官方接口参考：[COS上传](https://cloud.tencent.com/document/product/436/64980)、[COS下载](https://cloud.tencent.com/document/product/436/64981)、[版本控制](https://www.tencentcloud.com/ind/document/product/436/35804)。

## 验证

受影响82/82核心测试、本地真实媒体16/16（含PDF原件备份恢复、MP4实际封面、伪造视频拒绝）、完整typecheck/构建、当前198条契约通过。COS测试使用SDK合同替身，不冒充真实云服务。证据在artifacts/media-completion-20260929。

AI四位置实际子进程测试、PDF真实页面和新数据库类型/升级验收已接入本次集中CI，结果待确认。未合并、未部署。

项目客户／品牌关系另见 [当前交付清单](CURRENT_DELIVERY.md)，新增第52次迁移。本批冻结前50次并验证50→52升级，全部52次新库安装由集中CI执行。
