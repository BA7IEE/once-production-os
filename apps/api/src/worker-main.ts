import { setTimeout as sleep } from 'node:timers/promises';
import { Application } from '../../../packages/core/src/api.ts';
import { PrismaStore } from './prisma-store.ts';
import { loadConfig } from './config.ts';
let store: PrismaStore | undefined;
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
async function run() {
    const config = loadConfig();
    store = new PrismaStore();
    const core = new Application(store, config);
    console.log('ONCE import worker starting');
    try {
        while (!stopping) {
            try {
                const claim = await core.imports.claim();
                if (claim)
                    await core.imports.process(claim);
                else
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
