/** DEV-09A restore preparation CLI.
 * It is intentionally local/disposable-first and does not approve/open a recovered environment. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { RecoveryOps } from '../packages/core/src/recovery.ts';
import { AppError } from '../packages/core/src/errors.ts';

function usage(): never {
    console.error('Usage: pnpm recovery:prepare -- --actor-login <login> [--expected-source-sha256 <digest>] [--apply]');
    process.exit(2);
}
function args() {
    const out: { actorLogin?: string; expectedSourceSha256?: string; apply: boolean } = { apply: false };
    const list = process.argv.slice(2);
    for (let i = 0; i < list.length; i++) {
        const arg = list[i];
        if (arg === '--') continue;
        if (arg === '--apply') out.apply = true;
        else if (arg === '--actor-login') out.actorLogin = list[++i];
        else if (arg === '--expected-source-sha256') out.expectedSourceSha256 = list[++i];
        else usage();
    }
    if (!out.actorLogin || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(out.actorLogin)) usage();
    if (out.expectedSourceSha256 !== undefined && !/^[a-f0-9]{64}$/.test(out.expectedSourceSha256)) usage();
    if (out.apply && !out.expectedSourceSha256) {
        console.error('Apply requires --expected-source-sha256 from the backup/restore evidence.');
        process.exit(2);
    }
    return out as { actorLogin: string; expectedSourceSha256?: string; apply: boolean };
}
function targetUrl() {
    const raw = process.env.DATABASE_URL_RECOVERY;
    if (!raw) {
        console.error('DATABASE_URL_RECOVERY is required. DATABASE_URL is intentionally ignored.');
        process.exit(2);
    }
    let url: URL;
    try { url = new URL(raw); } catch {
        console.error('DATABASE_URL_RECOVERY is invalid.');
        process.exit(2);
    }
    if (!['postgresql:', 'postgres:'].includes(url.protocol)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || !/^\/once_restore_[a-z0-9_]+$/.test(url.pathname)
        || url.search || url.hash || !url.username || !url.password) {
        console.error('Only an explicit loopback once_restore_* PostgreSQL database is permitted by this recovery preparation tool.');
        process.exit(2);
    }
    return raw;
}
function config() {
    const file = process.env.RECOVERY_EPOCH_FILE;
    if (!file) {
        console.error('RECOVERY_EPOCH_FILE is required.');
        process.exit(2);
    }
    const recoveryEpoch = readFileSync(file, 'utf8').trim();
    const accessMode = process.env.ACCESS_MODE;
    const dataEgressMode = process.env.DATA_EGRESS_MODE ?? 'DISABLED';
    const dataCleanupMode = process.env.DATA_CLEANUP_MODE ?? 'DISABLED';
    const dataMergeMode = process.env.DATA_MERGE_MODE ?? 'DISABLED';
    if (accessMode !== 'MAINTENANCE'
        || dataEgressMode !== 'DISABLED'
        || dataCleanupMode !== 'DISABLED'
        || dataMergeMode !== 'DISABLED') {
        console.error('Recovery preparation requires ACCESS_MODE=MAINTENANCE and all data execution gates DISABLED.');
        process.exit(2);
    }
    return { accessMode, dataEgressMode, dataCleanupMode, dataMergeMode, recoveryEpoch } as const;
}

const input = args();
if (input.apply && process.env.ALLOW_RECOVERY_PREPARE !== 'yes') {
    console.error('Apply requires ALLOW_RECOVERY_PREPARE=yes. No database write was attempted.');
    process.exit(2);
}
const client = new PrismaClient({ datasources: { db: { url: targetUrl() } }, log: [] });
const store = new PrismaStore(client);
const recovery = new RecoveryOps({ now: () => new Date() }, config());

try {
    await client.$connect();
    const actor = await store.transaction(tx => recovery.actorFromRestoredTarget(tx, input.actorLogin));
    const result = input.apply
        ? await store.transaction(tx => recovery.prepare(tx, actor, input.expectedSourceSha256!, { requestId: randomUUID(), ip: 'CLI' }))
        : await store.transaction(tx => recovery.preview(tx, actor));
    console.log(JSON.stringify({ mode: input.apply ? 'APPLY' : 'CHECK', ...result }, null, 2));
}
catch (error) {
    if (error instanceof AppError) console.error(error.code + ': ' + error.message);
    else console.error('RECOVERY_PREPARE_FAILED: recovered database remains isolated.');
    process.exitCode = 1;
}
finally {
    await store.close();
}
