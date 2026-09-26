import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildBackupManifest, readBackupManifest, sha256File, writeBackupManifest } from '../../apps/api/src/recovery/backup-manifest.ts';

function privateDir() {
    const root=mkdtempSync(join(tmpdir(),'once-backup-manifest-'));chmodSync(root,0o700);return root;
}
function journal() {
    return {
        schemaVersion:'once-safety-journal-v1' as const,
        journalId:'11111111-1111-4111-8111-111111111111',
        sequence:4,headHash:'a'.repeat(64),entries:4
    };
}

test('DEV-09D backup manifest binds dump, recovery/key/migration and journal anchor',async()=>{
    const root=privateDir();
    try{
        const dump=join(root,'db.dump');writeFileSync(dump,Buffer.from('synthetic-pg-dump'),{mode:0o600});
        const database=await sha256File(dump);
        const manifest=buildBackupManifest({
            backupId:'22222222-2222-4222-8222-222222222222',
            createdAt:'2026-09-26T06:00:00.000Z',
            applicationVersion:'0.1.0-dev.1',database,
            recoveryEpochDigest:'b'.repeat(64),contactKeyDigest:'c'.repeat(64),migrationDigest:'d'.repeat(64),
            media:{provider:'disabled' as const,identityDigest:'e'.repeat(64),assetCount:0,totalBytes:0,assets:[]},
            safetyJournal:journal()
        });
        const path=join(root,'manifest.json');
        await writeBackupManifest(path,manifest);
        assert.deepEqual(await readBackupManifest(path),manifest);
        assert.match(manifest.manifestDigest,/^[a-f0-9]{64}$/);
        assert.notEqual(manifest.manifestDigest,manifest.database.sha256);
    }finally{rmSync(root,{recursive:true,force:true});}
});

test('DEV-09D backup manifest detects JSON tampering and unsafe permissions',async()=>{
    const root=privateDir();
    try{
        const dump=join(root,'db.dump');writeFileSync(dump,'dump',{mode:0o600});
        const manifest=buildBackupManifest({
            applicationVersion:'0.1.0-dev.1',database:await sha256File(dump),
            recoveryEpochDigest:'b'.repeat(64),contactKeyDigest:'c'.repeat(64),migrationDigest:'d'.repeat(64),
            media:{provider:'disabled' as const,identityDigest:'e'.repeat(64),assetCount:0,totalBytes:0,assets:[]},
            safetyJournal:journal()
        });
        const path=join(root,'manifest.json');await writeBackupManifest(path,manifest);
        const parsed=JSON.parse(readFileSync(path,'utf8'));
        parsed.database.bytes++;
        writeFileSync(path,JSON.stringify(parsed)+'\n',{mode:0o600});
        await assert.rejects(readBackupManifest(path));

        writeFileSync(path,JSON.stringify(manifest)+'\n',{mode:0o600});chmodSync(path,0o644);
        await assert.rejects(readBackupManifest(path));
        chmodSync(path,0o600);
        chmodSync(dump,0o644);
        await assert.rejects(sha256File(dump));
    }finally{rmSync(root,{recursive:true,force:true});}
});
