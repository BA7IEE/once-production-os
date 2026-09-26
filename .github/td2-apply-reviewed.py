from pathlib import Path
r=Path.cwd()
p=r/'apps/api/src/recovery/safety-journal.ts'; s=p.read_text()
a=s.index('    private async withLock<T>'); b=s.index('    private constructor',a)
lock=s[a:b].replace('    private async withLock<T>(work: () => Promise<T>): Promise<T> {','export async function withSafetyJournalLock<T>(path: string, work: () => Promise<T>): Promise<T> {').replace('this.path', 'path')
lock=lock.replace("        const lock = path + '.lock';", "        invariant(isAbsolute(path) && resolve(path) === path, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志必须使用规范绝对路径', 503);\n        const parent = await stat(dirname(path));\n        invariant(parent.isDirectory() && (parent.mode & 0o077) === 0, 'SAFETY_JOURNAL_PATH_INVALID', '安全日志父目录必须是私有目录', 503);\n        const lock = path + '.lock';")
s=s[:a]+s[b:]; s=s.replace('export class SafetyJournalWriter {',lock+'\nexport class SafetyJournalWriter {').replace('return this.withLock(async () => {','return withSafetyJournalLock(this.path, async () => {');p.write_text(s)
p=r/'scripts/recovery-approve.ts';s=p.read_text().replace('readSafetyJournal, safetyJournalHashAt','readSafetyJournal, safetyJournalHashAt, withSafetyJournalLock')
s=s.replace('        const journal=await readSafetyJournal(journalPath);','        // Hold the same append lock through the approval transaction COMMIT.\n        await withSafetyJournalLock(journalPath, async () => {\n        const journal=await readSafetyJournal(journalPath);')
s=s.replace('    }\n}catch(error){','        });\n    }\n}catch(error){');p.write_text(s)
p=r/'tests/core/safety-journal.test.ts';s=p.read_text().replace('SafetyJournalWriter, readSafetyJournal, safetyCriticalAudit','SafetyJournalWriter, readSafetyJournal, safetyCriticalAudit, withSafetyJournalLock')
s+='''

test('DEV-09F approval barrier excludes append until commit and releases after failure', async () => {
    const root = dir(), path = join(root, 'journal.jsonl');
    try {
        const writer = await SafetyJournalWriter.open(path);
        let release!: () => void, entered!: () => void;
        const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
        const hold = new Promise<void>(resolve => { release = resolve; });
        const approval = withSafetyJournalLock(path, async () => {
            entered();
            assert.equal((await readSafetyJournal(path)).snapshot.sequence, 0);
            await hold;
            assert.equal((await readSafetyJournal(path)).snapshot.sequence, 0);
        });
        await enteredPromise;
        const pending = writer.append([audit('source.suspend', '2026-09-26T00:00:01.000Z')]);
        await new Promise(resolve => setTimeout(resolve, 60));
        assert.equal((await readSafetyJournal(path)).snapshot.sequence, 0);
        release(); await approval; await pending;
        assert.equal((await readSafetyJournal(path)).snapshot.sequence, 1);
        await assert.rejects(withSafetyJournalLock(path, async () => { throw new Error('synthetic approval rollback'); }));
        await writer.append([audit('member.disable', '2026-09-26T00:00:02.000Z')]);
        assert.equal((await readSafetyJournal(path)).snapshot.sequence, 2);
    } finally { rmSync(root, {recursive:true, force:true}); }
});
''';p.write_text(s)
p=r/'.github/workflows/acceptance.yml';s=p.read_text().replace('feat/recovery-writeahead-media]', 'feat/recovery-writeahead-media, feat/recovery-delta-resolution, feat/talent-domain-2]');p.write_text(s)
