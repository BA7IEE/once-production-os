/** Controlled FR-29/T29 JSON rebuild CLI.
 * This is migration tooling, not backup restore. It never drops, truncates or auto-migrates a database. */
import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { JsonRebuild } from '../packages/core/src/rebuild.ts';
import { parseStrictJson } from '../packages/core/src/json-boundary.ts';
import { digest } from '../packages/core/src/json.ts';
import { AppError } from '../packages/core/src/errors.ts';

function usage(): never {
    console.error('Usage: pnpm rebuild:json -- --input <export.json> --actor-login <login> [--expected-sha256 <digest>] [--apply]');
    process.exit(2);
}
function args() {
    const out: { input?: string; actorLogin?: string; expectedSha256?: string; apply: boolean } = { apply: false };
    const list = process.argv.slice(2);
    for (let i = 0; i < list.length; i++) {
        const arg = list[i];
        // pnpm/npm use a standalone "--" as the script-argument separator. Depending on
        // invocation/version it may still appear in process.argv; treat it as syntax, not input.
        if (arg === '--') continue;
        if (arg === '--apply') out.apply = true;
        else if (arg === '--input') out.input = list[++i];
        else if (arg === '--actor-login') out.actorLogin = list[++i];
        else if (arg === '--expected-sha256') out.expectedSha256 = list[++i];
        else usage();
    }
    if (!out.input || !out.actorLogin) usage();
    if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(out.actorLogin)) usage();
    if (out.expectedSha256 !== undefined && !/^[0-9a-f]{64}$/.test(out.expectedSha256)) usage();
    if (out.apply && !out.expectedSha256) {
        console.error('Apply requires --expected-sha256 from the READY source Export payloadDigest.');
        process.exit(2);
    }
    return out as { input: string; actorLogin: string; expectedSha256?: string; apply: boolean };
}
function targetUrl(): string {
    const raw = process.env.DATABASE_URL_REBUILD;
    if (!raw) {
        console.error('DATABASE_URL_REBUILD is required. DATABASE_URL is intentionally ignored.');
        process.exit(2);
    }
    let url: URL;
    try { url = new URL(raw); } catch {
        console.error('DATABASE_URL_REBUILD is invalid.');
        process.exit(2);
    }
    if (!['postgresql:', 'postgres:'].includes(url.protocol)
        || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || !/^\/once_rebuild_[a-z0-9_]+$/.test(url.pathname)
        || url.search || url.hash || !url.username || !url.password) {
        console.error('Only an explicit loopback once_rebuild_* PostgreSQL database is permitted by this isolated rebuild tool.');
        process.exit(2);
    }
    return raw;
}

const input = args();
if (input.apply && process.env.ALLOW_REBUILD !== 'yes') {
    console.error('Apply requires ALLOW_REBUILD=yes. No database write was attempted.');
    process.exit(2);
}
const stat = statSync(input.input);
if (!stat.isFile() || stat.size <= 0 || stat.size > 10 * 1024 * 1024) {
    console.error('Rebuild input must be a non-empty JSON file no larger than 10 MiB.');
    process.exit(2);
}

const rawJson = readFileSync(input.input, 'utf8');
let payload: unknown;
try { payload = parseStrictJson(rawJson); }
catch {
    console.error('Rebuild input is not accepted strict JSON.');
    process.exit(2);
}
const inputDigest = digest(payload);
if (input.expectedSha256 && input.expectedSha256 !== inputDigest) {
    console.error('REBUILD_DIGEST_MISMATCH: input does not match the source Export payloadDigest. No database access was attempted.');
    process.exit(2);
}

const client = new PrismaClient({ datasources: { db: { url: targetUrl() } }, log: [] });
const store = new PrismaStore(client);
const rebuild = new JsonRebuild({ now: () => new Date() });

try {
    await client.$connect();
    const actor = await store.transaction(tx => rebuild.actorFromTarget(tx, input.actorLogin));
    const summary = input.apply
        ? await store.transaction(tx => rebuild.apply(tx, actor, payload, { requestId: randomUUID(), ip: 'CLI' }))
        : await store.transaction(tx => rebuild.preview(tx, actor, payload));
    console.log(JSON.stringify({ mode: input.apply ? 'APPLY' : 'CHECK', ...summary }, null, 2));
}
catch (error) {
    if (error instanceof AppError) console.error(error.code + ': ' + error.message);
    else console.error('REBUILD_FAILED: isolated rebuild did not complete.');
    process.exitCode = 1;
}
finally {
    await store.close();
}
