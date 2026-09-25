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
