/** DEV-09B restore-check CLI.
 * Default CHECK is zero-write. --record persists an INSPECTED report but never approves recovery. */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { RecoveryOps } from '../packages/core/src/recovery.ts';
import { collectRecoveryExternalCheck } from '../apps/api/src/recovery/external-check.ts';
import { AppError } from '../packages/core/src/errors.ts';

function usage(): never {
    console.error('Usage: pnpm recovery:check -- --actor-login <login> --recovery-run-id <uuid> [--record]');
    process.exit(2);
}
function args() {
    const out: { actorLogin?: string; recoveryRunId?: string; record: boolean } = { record: false };
    const list = process.argv.slice(2);
    for (let i = 0; i < list.length; i++) {
        const arg = list[i];
        if (arg === '--') continue;
        if (arg === '--record') out.record = true;
        else if (arg === '--actor-login') out.actorLogin = list[++i];
        else if (arg === '--recovery-run-id') out.recoveryRunId = list[++i];
        else usage();
    }
    if (!out.actorLogin || !/^[a-z0-9][a-z0-9._-]{2,79}$/.test(out.actorLogin)
        || !out.recoveryRunId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(out.recoveryRunId))
        usage();
    return out as { actorLogin: string; recoveryRunId: string; record: boolean };
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
        console.error('Only an explicit loopback once_restore_* PostgreSQL database is permitted by restore-check.');
        process.exit(2);
    }
    return raw;
}
function config() {
    const recoveryFile = process.env.RECOVERY_EPOCH_FILE, contactFile = process.env.CONTACT_KEY_FILE;
    if (!recoveryFile || !contactFile) {
        console.error('RECOVERY_EPOCH_FILE and CONTACT_KEY_FILE are required.');
        process.exit(2);
    }
    const recoveryEpoch = readFileSync(recoveryFile, 'utf8').trim();
    const contactHex = readFileSync(contactFile, 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(recoveryEpoch) || !/^[a-f0-9]{64}$/i.test(contactHex)) {
        console.error('Recovery epoch or contact key file is malformed.');
        process.exit(2);
    }
    if (process.env.ACCESS_MODE !== 'MAINTENANCE'
        || (process.env.DATA_EGRESS_MODE ?? 'DISABLED') !== 'DISABLED'
        || (process.env.DATA_CLEANUP_MODE ?? 'DISABLED') !== 'DISABLED'
        || (process.env.DATA_MERGE_MODE ?? 'DISABLED') !== 'DISABLED') {
        console.error('restore-check requires ACCESS_MODE=MAINTENANCE and all data execution gates DISABLED.');
        process.exit(2);
    }
    return {
        accessMode: 'MAINTENANCE' as const, dataEgressMode: 'DISABLED' as const,
        dataCleanupMode: 'DISABLED' as const, dataMergeMode: 'DISABLED' as const,
        recoveryEpoch, contactKey: Buffer.from(contactHex, 'hex')
    };
}

const input = args();
if (input.record && process.env.ALLOW_RECOVERY_CHECK !== 'yes') {
    console.error('Recording restore-check evidence requires ALLOW_RECOVERY_CHECK=yes.');
    process.exit(2);
}
const client = new PrismaClient({ datasources: { db: { url: targetUrl() } }, log: [] });
const store = new PrismaStore(client);
const recovery = new RecoveryOps({ now: () => new Date() }, config());

try {
    await client.$connect();

    const external = await collectRecoveryExternalCheck(client);
    const actor = await store.transaction(tx => recovery.actorFromRestoredTarget(tx, input.actorLogin));
    const report = input.record
        ? await store.transaction(tx => recovery.inspect(tx, actor, input.recoveryRunId, external,
            { requestId: randomUUID(), ip: 'CLI' }))
        : await store.transaction(tx => recovery.check(tx, actor, input.recoveryRunId, external));
    console.log(JSON.stringify({ mode: input.record ? 'RECORD' : 'CHECK', ...report }, null, 2));
    if (report.blockers.length) process.exitCode = 3;
}
catch (error) {
    if (error instanceof AppError) console.error(error.code + ': ' + error.message);
    else console.error('RECOVERY_CHECK_FAILED: recovery remains isolated.');
    process.exitCode = 1;
}
finally {
    await store.close();
}
