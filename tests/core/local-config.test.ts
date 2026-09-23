import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../../apps/api/src/config.ts';
import { newSystem } from '../support/fixtures.ts';
import { Application } from '../../packages/core/src/api.ts';
const initializer = fileURLToPath(new URL('../../scripts/init-local.mjs', import.meta.url));
function directory(): string { return mkdtempSync(join(tmpdir(), 'once-synthetic-config-')); }
function initialize(dir: string) { return spawnSync(process.execPath, [initializer], { cwd: dir, encoding: 'utf8', timeout: 5000 }); }
test('local initializer creates private random files, never emits their values', () => {
    const dir = directory();
    try {
        const r = initialize(dir);
        assert.equal(r.status, 0);
        const secretDir = join(dir, '.secrets');
        assert.equal(statSync(secretDir).mode & 0o777, 0o700);
        const files = readdirSync(secretDir);
        assert.equal(files.length, 5);
        for (const file of files) {
            const path = join(secretDir, file);
            const value = readFileSync(path, 'utf8').trim();
            assert.equal(statSync(path).mode & 0o777, 0o600);
            assert.ok(value.length >= 32);
            assert.ok(!(r.stdout + r.stderr).includes(value));
        }
        assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
        const second = directory();
        try {
            assert.equal(initialize(second).status, 0);
            assert.notEqual(readFileSync(join(secretDir, 'contact.hex'), 'utf8'), readFileSync(join(second, '.secrets/contact.hex'), 'utf8'));
        }
        finally {
            rmSync(second, { recursive: true, force: true });
        }
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('local initializer refuses an existing environment without overwriting keys', () => {
    const dir = directory();
    try {
        assert.equal(initialize(dir).status, 0);
        const before = readFileSync(join(dir, '.secrets/contact.hex'), 'utf8');
        assert.notEqual(initialize(dir).status, 0);
        assert.equal(readFileSync(join(dir, '.secrets/contact.hex'), 'utf8'), before);
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
test('config loader accepts valid file references and rejects malformed secrets and modes', () => {
    const dir = directory();
    const saved = { ...process.env };
    try {
        assert.equal(initialize(dir).status, 0);
        Object.assign(process.env, { APP_ENV: 'local', APP_ORIGIN: 'http://127.0.0.1:4318', ACCESS_MODE: 'INTERNAL', COOKIE_SECURE: 'false',
            DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:5436/once_test_config', CONTACT_KEY_FILE: join(dir, '.secrets/contact.hex'),
            CSRF_KEY_FILE: join(dir, '.secrets/csrf.hex'), RECOVERY_EPOCH_FILE: join(dir, '.secrets/recovery.epoch') });
        assert.equal(loadConfig().contactKey.length, 32);
        process.env.ACCESS_MODE = 'unrecognized';
        assert.throws(loadConfig);
        process.env.ACCESS_MODE = 'INTERNAL';
        writeFileSync(process.env.CONTACT_KEY_FILE!, 'invalid\n');
        assert.throws(loadConfig);
    }
    finally {
        for (const k of Object.keys(process.env))
            if (!(k in saved))
                delete process.env[k];
        Object.assign(process.env, saved);
        rmSync(dir, { recursive: true, force: true });
    }
});
test('production core refuses insecure origin and cookies before any database access', () => {
    const f = newSystem();
    assert.throws(() => new Application(f.store, { ...f.app.config, environment: 'production', origin: 'http://os.example.invalid', secureCookies: false }));
    assert.equal(f.store.rows('workspaces').length, 0);
});
