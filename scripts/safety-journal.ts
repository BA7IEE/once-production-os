/** DEV-09C safety-journal maintenance CLI.
 * Reads committed AuditEvent rows and appends only metadata to an independent private file. */
import { PrismaClient } from '@prisma/client';
import { PrismaStore } from '../apps/api/src/prisma-store.ts';
import { SafetyJournalWriter, readSafetyJournal } from '../apps/api/src/recovery/safety-journal.ts';

const file = process.env.SAFETY_JOURNAL_FILE;
if (!file) {
    console.error('SAFETY_JOURNAL_FILE is required.');
    process.exit(2);
}
const verifyOnly = process.argv.slice(2).filter(x => x !== '--').includes('--verify-only');
if (verifyOnly) {
    try {
        const state = await readSafetyJournal(file);
        console.log(JSON.stringify({ mode: 'VERIFY', ...state.snapshot }, null, 2));
    }
    catch {
        console.error('SAFETY_JOURNAL_INVALID: journal verification failed.');
        process.exitCode = 1;
    }
}
else {
    const databaseUrl = process.env.DATABASE_URL_JOURNAL ?? process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('DATABASE_URL_JOURNAL or DATABASE_URL is required for sync.');
        process.exit(2);
    }
    const client = new PrismaClient({ datasources: { db: { url: databaseUrl } }, log: [] });
    const store = new PrismaStore(client);
    try {
        await client.$connect();
        const writer = await SafetyJournalWriter.open(file);
        const audits = await store.transaction(tx => tx.find('audits'));
        const appended = await writer.append(audits);
        console.log(JSON.stringify({ mode: 'SYNC', appended, ...writer.snapshot() }, null, 2));
    }
    catch {
        console.error('SAFETY_JOURNAL_SYNC_FAILED: no database rows were modified.');
        process.exitCode = 1;
    }
    finally {
        await store.close();
    }
}
