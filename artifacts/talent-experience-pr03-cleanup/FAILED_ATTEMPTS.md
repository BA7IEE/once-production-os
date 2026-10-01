# 本轮失败记录及修正

本文件保留首次失败事实；下列问题修正后重新执行，不将失败日志替换成通过。

- Core：Node strip-only不支持测试构造器参数属性，改为显式字段；未放宽生产类型检查。
- PG finalize：既有ERASED形状约束拒绝仍携personId的Asset，按既有删除合同清空Asset/Upload人物技术绑定；旧迁移不改。
- Local provider：测试目录经过macOS `/var` 符号链接，被正确拒绝。测试改为realpath临时目录，生产检查不放宽。
- Browser：三个相邻Portal组件的React key重复，切换新草稿出现两个上传控件。各组件采用独立前缀，保留唯一元素断言。
- Browser恢复：清理计划Prisma Date对象进入canonical JSON摘要时触发INVALID_JSON。转为ISO序列化数据后再摘要，完整旅程复跑通过。
- Core旧finalizer故障测试：替身缺少新增的Upload物理完成状态查询，补替身接口；原“物理副作用后数据库不可用，write-ahead不能假定未提交”断言不变。
- PG formal dependency：新增检查误查castingProfiles不存在的封面字段，删除该错误查询；实际talentProfiles及Collection封面检查保留。
- PG batch：测试只将PersonMedia置RETIRED，未同步Asset，既有关系一致性触发器拒绝。测试改为同事务模拟合法退休；不修改数据库约束。
- 数据库约束复查：67的JSON计划CHECK可能接受NULL。67已应用，因此追加68，明确拒绝缺字段/NULL，并冻结逐对象大小、摘要及不可逆状态。保留库67→68与新空库1→68均另测；未回写67。
- 一次checkpoint命令误用了`.ts`扩展名，未找到文件；用实际`checkpoint.test.mjs`重新执行，17项通过。

真实Provider/COS、物理手机、生产迁移与部署仍未执行。

最终CI首轮36879331682：媒体job的PDF备份测试替身缺少mediaPurgeIntent delegate，17项中1项失败。仅补齐测试替身，不加生产fallback、不修改原断言；Local媒体17/17和surface policy3/3复跑通过。新head重新执行完整CI。
