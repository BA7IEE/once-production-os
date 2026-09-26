/** DEV-09C conservative backup anchor.
 * Sync safety journal first, freeze its head, then run pg_dump. Post-anchor safety writes remain
 * post-backup deltas even if PostgreSQL's snapshot happens to include some of them. */
import { randomUUID } from 'node:crypto';
import { chmodSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { SafetyJournalWriter } from '../apps/api/src/recovery/safety-journal.ts';
import { buildBackupManifest, sha256File, writeBackupManifest } from '../apps/api/src/recovery/backup-manifest.ts';
import { digest } from '../packages/core/src/json.ts';
import { hashSecret } from '../packages/core/src/crypto.ts';

function fail(message: string): never { console.error(message); process.exit(2); }
function args() {
    const list = process.argv.slice(2), out: { outputDir?: string } = {};
    for (let i=0;i<list.length;i++) {
        const arg=list[i]; if(arg==='--') continue;
        if(arg==='--output-dir') out.outputDir=list[++i]; else fail('Usage: pnpm recovery:backup -- --output-dir <private-absolute-directory>');
    }
    if(!out.outputDir||!isAbsolute(out.outputDir)||resolve(out.outputDir)!==out.outputDir) fail('Backup output directory must be a canonical absolute path.');
    return out as { outputDir: string };
}
function dbEnv(raw: string) {
    let url: URL; try { url=new URL(raw); } catch { fail('DATABASE_URL_BACKUP is invalid.'); }
    if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||!url.pathname.slice(1))
        fail('DATABASE_URL_BACKUP must be an explicit PostgreSQL URL with credentials.');
    return {
        PGHOST:url.hostname.replace(/^\[|\]$/g,''), PGPORT:url.port||'5432',
        PGUSER:decodeURIComponent(url.username), PGPASSWORD:decodeURIComponent(url.password),
        PGDATABASE:decodeURIComponent(url.pathname.slice(1))
    };
}
const {outputDir}=args();
const outStat=statSync(outputDir);
if(!outStat.isDirectory()||(outStat.mode&0o077)!==0) fail('Backup output directory must be private (0700-style).');
if(readdirSync(outputDir).length!==0) fail('Backup output directory must be empty; refusing overwrite or mixed evidence.');
const databaseUrl=process.env.DATABASE_URL_BACKUP;
const journalPath=process.env.SAFETY_JOURNAL_FILE;
const contactFile=process.env.CONTACT_KEY_FILE;
const recoveryFile=process.env.RECOVERY_EPOCH_FILE;
if(!databaseUrl||!journalPath||!contactFile||!recoveryFile) fail('DATABASE_URL_BACKUP, SAFETY_JOURNAL_FILE, CONTACT_KEY_FILE and RECOVERY_EPOCH_FILE are required.');

const contactHex=readFileSync(contactFile,'utf8').trim();
const recoveryEpoch=readFileSync(recoveryFile,'utf8').trim();
if(!/^[a-f0-9]{64}$/i.test(contactHex)||!/^[A-Za-z0-9_-]{32,128}$/.test(recoveryEpoch)) fail('Contact key or recovery epoch file is malformed.');

const client=new PrismaClient({datasources:{db:{url:databaseUrl}},log:[]});
const store=new PrismaStore(client);
try{
    await client.$connect();
    const writer=await SafetyJournalWriter.open(journalPath);
    const audits=await store.transaction(tx=>tx.find('audits'));
    await writer.append(audits);
    const journalAnchor=writer.snapshot();
    const anchorAt=new Date().toISOString();

    const expectedMigrations=readdirSync(join(process.cwd(),'prisma','migrations'),{withFileTypes:true})
        .filter(x=>x.isDirectory()).map(x=>x.name).sort();
    const applied=await client.$queryRawUnsafe<Array<{migration_name:string}>>(
        'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY "migration_name"');
    const appliedMigrations=applied.map(x=>x.migration_name).sort();
    if(expectedMigrations.length!==appliedMigrations.length||!expectedMigrations.every((x,i)=>x===appliedMigrations[i]))
        fail('Database migrations do not match this application build; backup anchor was not emitted.');
    const migrationDigest=digest({expectedMigrations,appliedMigrations});

    const backupId=randomUUID(), dumpPath=join(outputDir,backupId+'.dump'), manifestPath=join(outputDir,backupId+'.manifest.json');
    const pg=spawnSync('pg_dump',['--format=custom','--no-owner','--no-privileges','--file',dumpPath],
        {env:{...process.env,...dbEnv(databaseUrl)},encoding:'utf8',timeout:300000});
    if(pg.error||pg.status!==0) {
        console.error('pg_dump failed; backup manifest was not emitted.');
        process.exitCode=1;
    }
    else {
        chmodSync(dumpPath,0o600);
        const database=await sha256File(dumpPath);
        const pkg=JSON.parse(readFileSync(join(process.cwd(),'package.json'),'utf8')) as {version:string};
        const manifest=buildBackupManifest({
            backupId,createdAt:anchorAt,applicationVersion:pkg.version,database,
            recoveryEpochDigest:hashSecret(recoveryEpoch),
            contactKeyDigest:hashSecret(contactHex.toLowerCase()),
            migrationDigest,safetyJournal:journalAnchor
        });
        await writeBackupManifest(manifestPath,manifest);
        console.log(JSON.stringify({
            mode:'BACKUP',backupId,dumpPath,manifestPath,manifestDigest:manifest.manifestDigest,
            safetyJournal:manifest.safetyJournal,database:manifest.database
        },null,2));
    }
}finally{await store.close();}
