import { readFileSync } from 'node:fs';
import { PrismaStore } from './prisma-store.ts';
import { loadConfig } from './config.ts';
import { Application } from '../../../packages/core/src/api.ts';
/** Password is read only from an explicitly supplied local file, never argv, defaults or seed data. */
async function run() {
    const login = process.env.BOOTSTRAP_LOGIN;
    const name = process.env.BOOTSTRAP_NAME;
    const file = process.env.BOOTSTRAP_PASSWORD_FILE;
    if (!login || !name || !file)
        throw new Error('BOOTSTRAP_LOGIN, BOOTSTRAP_NAME and BOOTSTRAP_PASSWORD_FILE required');
    const password = readFileSync(file, 'utf8').replace(/\r?\n$/, '');
    const store = new PrismaStore();
    try {
        const core = new Application(store, loadConfig());
        await core.identity.bootstrap(login, name, password);
        console.log('Administrator created. Remove the one-time bootstrap password file now.');
    }
    finally {
        await store.close();
    }
}
run().catch(error => {
    console.error(error instanceof Error && 'code' in error ? String((error as {
        code: string;
    }).code) : 'Bootstrap failed; validate configuration and empty database.');
    process.exitCode = 1;
});
