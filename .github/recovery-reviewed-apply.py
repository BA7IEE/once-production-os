from pathlib import Path
import hashlib

r = Path.cwd()
before = {
    'packages/core/src/safety-intent.ts': 'f3f7699cf3f14c972bc2293f6c0710305bf2b6133ffac8302711274a83a914b0',
    'apps/api/src/recovery/safety-journal.ts': '9bec0da4bce417237b6d54828f574d0b86aee24a36f4463ad0d85976b26d1de0',
    'packages/core/src/api.ts': 'e4834c31b4e5234fd4321878a7411a389f662c23c1299ffd4405144243ccd688',
    'apps/api/src/worker-main.ts': '313c60aa4854ce23459713ae88954773bfe00135edcf014fdd4bc17618528b3d',
    'apps/api/src/deletion/finalizer.ts': 'cab819491ebc63addf0e2700db25b8160ca8245280e7e89754e80498dc9d19a1',
    'tests/core/recovery-delta.test.ts': '9ce39e0b1ef7ad96b05ef920c1ff0bfe0d4bb59ebf08eb34d9735845ff4ebfec',
    'tests/core/safety-intent.test.ts': '1ba6c2f9d8c577e9c9be4d86d1ef9562fb2044c487466445434abf9682e557d3',
    'docs/release/IMPLEMENTATION_STATUS.md': 'da5df43e1e7963b568aa107b8bc4f50005aeb348174bda3cf8b2651df8dbda13',
}
for path, expected in before.items():
    assert hashlib.sha256((r / path).read_bytes()).hexdigest() == expected, 'Refusing changed preimage: ' + path

p = r / 'packages/core/src/safety-intent.ts'
s = p.read_text().replace('    aborted(intent: SafetyIntent): Promise<void>;', '''    /** Only valid before any database transaction or external side effect is attempted.
     * A rejected transaction promise is NOT proof of rollback. */
    aborted(intent: SafetyIntent, proof: 'NOT_STARTED'): Promise<void>;''')
p.write_text(s)
p = r / 'apps/api/src/recovery/safety-journal.ts'
s = p.read_text().replace("export const SAFETY_JOURNAL_ENTRY_VERSION = 'once-safety-journal-entry-v1';", "export const SAFETY_JOURNAL_ENTRY_VERSION = 'once-safety-journal-entry-v2';\nconst LEGACY_ENTRY_VERSION = 'once-safety-journal-entry-v1';")
s = s.replace('    schemaVersion: typeof SAFETY_JOURNAL_ENTRY_VERSION;', '''    schemaVersion: typeof SAFETY_JOURNAL_ENTRY_VERSION | typeof LEGACY_ENTRY_VERSION;
    /** Absent on immutable legacy v1 entries; never infer it from operation/resource. */
    requestId?: string;
    abortProof?: 'NOT_STARTED';''')
s = s.replace("    keys(row, ['schemaVersion','seq','auditId','workspaceId','createdAt','action','resourceKind','resourceId','changedFields','prevHash','hash'],\n        '安全日志记录包含未知字段');\n    invariant(row.schemaVersion === SAFETY_JOURNAL_ENTRY_VERSION", """    const v2 = row.schemaVersion === SAFETY_JOURNAL_ENTRY_VERSION;
    keys(row, ['schemaVersion','seq','auditId','workspaceId','createdAt','action','resourceKind','resourceId','changedFields','prevHash','hash',
        ...(v2 ? ['requestId'] : []), ...(v2 && row.resourceKind === 'intent-abort' ? ['abortProof'] : [])],
        '安全日志记录包含未知字段');
    invariant((v2 || row.schemaVersion === LEGACY_ENTRY_VERSION)
        && (!v2 || (typeof row.requestId === 'string' && row.requestId.length > 0 && row.requestId.length <= 200))
        && (!v2 || row.resourceKind !== 'intent-abort' || row.abortProof === 'NOT_STARTED')""")
s = s.replace("        resourceKind: string; resourceId: string; changedFields: string[];\n    }>", "        resourceKind: string; resourceId: string; changedFields: string[]; requestId: string; abortProof?: 'NOT_STARTED';\n    }>")
s = s.replace('                    seq: ++seq, auditId: input.auditId, workspaceId: input.workspaceId,', '''                    requestId: input.requestId,
                    ...(input.abortProof ? { abortProof: input.abortProof } : {}),
                    seq: ++seq, auditId: input.auditId, workspaceId: input.workspaceId,''')
s = s.replace('            changedFields: audit.changedFields', '            changedFields: audit.changedFields, requestId: audit.requestId')
s = s.replace("            && intent.resourceId.length > 0 && intent.resourceId.length <= 180,", "            && intent.resourceId.length > 0 && intent.resourceId.length <= 180\n            && typeof intent.requestId === 'string' && intent.requestId.length > 0 && intent.requestId.length <= 200,")
s = s.replace("            resourceId: intent.resourceId, changedFields: []", "            resourceId: intent.resourceId, changedFields: [], requestId: intent.requestId")
s = s.replace("            resourceId, changedFields: []", "            resourceId, changedFields: [], requestId: intent.requestId")
s = s.replace('    async aborted(intent: SafetyIntent): Promise<void> {\n        const suffix = this.intentSuffix(intent);', """    async aborted(intent: SafetyIntent, proof: 'NOT_STARTED'): Promise<void> {
        invariant(proof === 'NOT_STARTED', 'SAFETY_ABORT_UNPROVEN',
            '只有尚未开始事务或外部副作用时才能记录未提交证明', 503);
        const suffix = this.intentSuffix(intent);""")
s = s.replace("            action: 'abort.' + intent.operation, resourceKind: 'intent-abort',\n            resourceId: intent.resourceId, changedFields: [], requestId: intent.requestId", "            action: 'abort.' + intent.operation, resourceKind: 'intent-abort',\n            resourceId: intent.resourceId, changedFields: [], requestId: intent.requestId, abortProof: proof")
p.write_text(s)
p = r / 'packages/core/src/api.ts'
s = p.read_text()
a = s.index('    private async markAborted(')
b = s.index('    private cookie(', a)
s = s[:a] + s[b:]
s = s.replace('                    await this.markAborted(intent);', '                    // An acknowledgement failure can occur after commit. Keep the intent unresolved.')
s = s.replace('                await this.markAborted(safetyIntent);', '                // An exception does not prove rollback; only a successful receipt may fill completion.')
p.write_text(s)
p = r / 'apps/api/src/worker-main.ts'
s = p.read_text().replace("                        if (intent) await safetyJournal!.aborted(intent).catch(() => {});", "                        // Cleanup may already have committed some items. Leave completion unresolved.")
p.write_text(s)
p = r / 'apps/api/src/deletion/finalizer.ts'
s = p.read_text().replace("                else await this.safetyIntent!.aborted(intent).catch(() => {});", "                // If even fail-state persistence failed, physical purge may still have happened.\n                // Never manufacture NO_COMMIT evidence from that exception.")
s = s.replace('        try {\n            if (intent) await this.safetyIntent!.writeAhead(intent);', '        // A journal failure must not enter the failure-state mutation path.\n        if (intent) await this.safetyIntent!.writeAhead(intent);\n        try {')
p.write_text(s)
p = r / 'tests/core/recovery-delta.test.ts'
s = p.read_text().replace('writer.aborted(i)', "writer.aborted(i, 'NOT_STARTED')")
s = s.replace("at='2026-09-26T10:00:00.000Z'", "requestId=randomUUID(),at='2026-09-26T10:00:00.000Z'")
s = s.replace("changedFields:['status'],requestId:randomUUID()", "changedFields:['status'],requestId")
s = s.replace("audit('source.suspend',sourceId)", "audit('source.suspend',sourceId,i.requestId)").replace("audit('member.disable',memberId)", "audit('member.disable',memberId,i.requestId)")
p.write_text(s)
p = r / 'tests/core/safety-intent.test.ts'
s = p.read_text().rstrip() + '''

test('DEV-09E a transaction acknowledgement failure must not claim the write was aborted', async () => {
    const sink = new IntentSink(), f = await system(sink);
    const transaction = f.store.transaction.bind(f.store);
    let failOnce = true;
    f.store.transaction = async work => {
        const before = f.store.rows('sources').length;
        const value = await transaction(work);
        if (failOnce && f.store.rows('sources').length > before) {
            failOnce = false;
            throw new Error('synthetic connection loss after commit');
        }
        return value;
    };
    const key = randomUUID(), body = sourceInput();
    const response = await f.owner.cmd('POST', '/sources', body, key);
    assert.equal(response.status, 500);
    assert.equal(f.store.rows('sources').length, 1, 'database really committed');
    assert.equal(sink.commits.length, 0, 'acknowledgement was unavailable');
    assert.equal(sink.aborts.length, 0, 'an exception is not proof of rollback');
    const retry = await f.owner.cmd('POST', '/sources', body, key);
    assert.equal(retry.status, 201);
    assert.equal(result(retry).replayed, true);
    assert.equal(f.store.rows('sources').length, 1);
    assert.equal(sink.commits.length, 1);
});
'''
p.write_text(s)
p = r / 'docs/release/IMPLEMENTATION_STATUS.md'
s = p.read_text()
s = s.replace('# 当前实现状态｜DEV-09D Write-ahead / DB+Media 恢复闭环', '# 当前实现状态｜DEV-09E 增量归并与恢复审批')
s = s.replace('当前分支 `feat/recovery-writeahead-media`，PR #22，基于 DEV-09C / PR #21。', '当前分支 `feat/recovery-delta-resolution`，PR #25，基于 DEV-09D / PR #22。\n\n本批实现与限制详见 [WP10_RECOVERY_DELTA_RESOLUTION.md](WP10_RECOVERY_DELTA_RESOLUTION.md)。隔离本地核心回归 321/321；完整 CI 须查验最终 head，不依据本文件推定通过；main 尚未包含整条开发链。')
s = s.replace('**09A 隔离准备、09B restore-check、09C zero-delta approve、09D write-ahead + DB/media 同包恢复** | **09E post-backup delta resolution、正式运维长期保留策略**', '**09A～09D + 09E 逐条 delta resolution、精确请求关联与审批 digest** | **最终 head CI、正式运维长期保留策略、恢复并发/故障 Gate**')
s = s.replace('## DEV-09D 最终证据', '## DEV-09D 历史证据（不替代 DEV-09E 当前 head 验收）')
s = s.replace('11. 零 post-backup delta 时可 approve 新 recovery epoch；', '11. 零 delta 或全部由严格规则解决的非零 delta 可 approve 新 recovery epoch；')
s = s.replace('当前只能对 post-backup delta 做保守阻断，尚未逐条形成 commit/rollback 与 resolution 证据。', '09E 已实现逐条归并与证据绑定，但正式运维、长期保留策略、恢复故障审查与最终 CI 尚须关闭。')
s = s[:s.index('## 接下来')] + '''## 接下来

先完成 DEV-09 整体 Gate 和开发分支整合，再合入已冻结的 Talent Domain 2.0 R1（PR #24）。

顺序：DEV-09 → TD2-01～06 → TD2-T01～18 → DEV-08 AI。人才 2.0 仍是 SPEC_ONLY / NOT_IMPLEMENTED，AI 未启动。
'''
p.write_text(s)

after = {
    'packages/core/src/safety-intent.ts': '884a092e9cb04cb0e3475b9fd11f2b2ccc82bda4e826ede1a5afd1afdf271508',
    'apps/api/src/recovery/safety-journal.ts': 'fab1395bbbcc18ea3b626b2298eab84ca6299636625aecb72a47463e1e388971',
    'packages/core/src/api.ts': '61aa6b95c12c0e8292e21809fd8d50fac39f6c167ac78cc9359798d61290e419',
    'apps/api/src/worker-main.ts': '808922cdcc7fc022e42258cb464b8807076e3355cfc4298a23bdea7a8d694a44',
    'apps/api/src/deletion/finalizer.ts': '3618c664f2296081694f97874f608bde1ef8b053937f7018d91e7c5fdc0e6924',
    'tests/core/recovery-delta.test.ts': 'eb15f9946b386fe9d55c6fbef06b95f521db738e8b347de26ab067e52e63c340',
    'tests/core/safety-intent.test.ts': 'c0c2109267f740d75eac359352371dee2e6ca73fdeb79e24c5b18c227c233b19',
    'docs/release/IMPLEMENTATION_STATUS.md': '86d64bfa8d222d271c09c7db6326ef75c22c9e1a66624ad668d31960ec4bee2a',
}
for path, expected in after.items():
    assert hashlib.sha256((r / path).read_bytes()).hexdigest() == expected, 'Postimage differs from locally tested source: ' + path
print('PASS exact reviewed preimages and postimages for', len(after), 'files')
