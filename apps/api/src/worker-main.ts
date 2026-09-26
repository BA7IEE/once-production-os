import { SafetyJournalWriter } from './recovery/safety-journal.ts';
import { LocalMediaProvider } from './media/local-provider.ts';
import { DeletionFinalizer } from './deletion/finalizer.ts';
import { MediaWorker } from './media/worker.ts';
import { setTimeout as sleep } from 'node:timers/promises';
import { Application } from '../../../packages/core/src/api.ts';
import { PrismaStore } from './prisma-store.ts';
import { loadConfig } from './config.ts';
let store: PrismaStore | undefined;
let stopping = false;
const stopController = new AbortController();
process.once('SIGTERM', () => { stopping = true; stopController.abort(); });
process.once('SIGINT', () => { stopping = true; stopController.abort(); });
async function run() {
    const config = loadConfig();
    store = new PrismaStore();
    const core = new Application(store, config);
    const mediaProvider = config.mediaEnabled ? await LocalMediaProvider.create(process.env.MEDIA_ROOT!) : null;
    const media = mediaProvider ? new MediaWorker(core, mediaProvider) : null;
    const deletionFinalizer = new DeletionFinalizer(core, mediaProvider);
    const safetyJournal = process.env.SAFETY_JOURNAL_FILE
        ? await SafetyJournalWriter.open(process.env.SAFETY_JOURNAL_FILE)
        : null;
    let nextJournalSync = 0;
    console.log('ONCE internal worker starting');
    try {
        while (!stopping) {
            try {
                const claim = await core.imports.claim();
                if (claim)
                    await core.imports.process(claim);
                const exportClaim = await core.exports.claim();
                if (exportClaim)
                    await core.exports.process(exportClaim);
                const deletionClaim = await core.deletionCleanup.claim();
                if (deletionClaim)
                    await core.deletionCleanup.process(deletionClaim);
                const didFinalize = await deletionFinalizer.cycle(stopController.signal);
                const didMedia = media ? await media.cycle(stopController.signal) : false;
                if (safetyJournal && Date.now() >= nextJournalSync) {
                    try {
                        const audits = await store.transaction(tx => tx.find('audits'));
                        await safetyJournal.append(audits);
                    }
                    catch {
                        // Do not turn a journal I/O outage into automatic task replay or data loss.
                        // The missing external evidence will block future recovery approval.
                        console.error('Safety journal sync failed; recovery approval must remain blocked until evidence is repaired.');
                    }
                    nextJournalSync = Date.now() + 5000;
                }
                if (!claim && !exportClaim && !deletionClaim && !didFinalize && !didMedia)
                    await sleep(1000);
            }
            catch {
                console.error('Worker cycle failed; check database connectivity.');
                await sleep(2000);
            }
        }
    }
    finally {
        await store.close();
    }
}
run().catch(() => { console.error('Worker could not start or stopped unexpectedly; inspect configuration without logging secrets.'); process.exitCode = 1; void store?.close(); });
