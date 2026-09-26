import { registerMediaHttp } from './media/http.ts';
import { SafetyJournalWriter } from './recovery/safety-journal.ts';
import { LocalMediaProvider } from './media/local-provider.ts';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { All, Controller, Module, Req, Res } from '@nestjs/common';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Application } from '../../../packages/core/src/api.ts';
import { PrismaStore } from './prisma-store.ts';
import { loadConfig } from './config.ts';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
let store: PrismaStore;
let core: Application;
@Controller('api/v1')
class ApiController {
    @All('{*path}')
    async handle(
    @Req()
    req: Request, 
    @Res()
    res: Response): Promise<void> {
        const headers: Record<string, string | undefined> = {};
        for (const [k, v] of Object.entries(req.headers))
            headers[k] = Array.isArray(v) ? v.join(',') : v;
        let body = '';
        try {
            if (Buffer.isBuffer(req.body))
                body = new TextDecoder('utf-8', { fatal: true }).decode(req.body);
        }
        catch {
            res.status(400).set('Cache-Control', 'no-store').json({ error: { code: 'INVALID_UTF8', message: '请求必须使用有效 UTF-8 编码' } });
            return;
        }
        const response = await core.handle({ method: req.method, url: req.originalUrl, headers, body, ip: req.ip ?? req.socket.remoteAddress ?? 'unknown' });
        res.status(response.status).set(response.headers);
        if (response.cookies.length)
            res.setHeader('Set-Cookie', response.cookies);
        res.json(response.body);
    }
}
class StoreLifecycle {
    async onApplicationShutdown(): Promise<void> { await store.close(); }
}
@Module({ controllers: [ApiController], providers: [StoreLifecycle] })
class AppModule {
}
async function main() {
    const config = loadConfig();
    store = new PrismaStore();
    const safetyJournal = process.env.SAFETY_JOURNAL_FILE
        ? await SafetyJournalWriter.open(process.env.SAFETY_JOURNAL_FILE)
        : null;
    core = new Application(store, config, undefined, safetyJournal);
    const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
    const server = app.getHttpAdapter().getInstance() as express.Express;
    server.disable('x-powered-by');
    server.set('etag', false);
    // Only explicitly trust a local reverse proxy which overwrites X-Forwarded-For.
    if (process.env.TRUST_LOOPBACK_PROXY === 'true')
        server.set('trust proxy', 'loopback');
    app.use((req: Request, res: Response, next: NextFunction) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        if (config.secureCookies)
            res.setHeader('Strict-Transport-Security', 'max-age=31536000');
        next();
    });
    const mediaProvider = config.mediaEnabled ? await LocalMediaProvider.create(process.env.MEDIA_ROOT!) : null;
    registerMediaHttp(server, core, mediaProvider);
    app.use('/api/v1', express.raw({ type: 'application/json', limit: '1mb', inflate: false }));
    app.use('/api/v1', (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const reported = (error as {
            status?: number;
        })?.status;
        const status = reported === 413 ? 413 : reported === 415 ? 415 : 400;
        res.status(status).set('Cache-Control', 'no-store').json({ error: { code: status === 413 ? 'BODY_TOO_LARGE' : 'REQUEST_INVALID', message: '请求体无法处理' } });
    });
    server.get('/health/live', (_req, res) => res.set('Cache-Control', 'no-store').json({ status: 'alive' }));
    server.get('/health/ready', async (_req, res) => {
        try {
            const workspace = await store.transaction(async (tx) => (await tx.find('workspaces'))[0]);
            const ready = !!workspace && config.accessMode === 'INTERNAL' && workspace.recoveryEpoch === config.recoveryEpoch;
            res.status(ready ? 200 : 503).set('Cache-Control', 'no-store').json({ status: ready ? 'ready' : 'isolated' });
        }
        catch {
            res.status(503).json({ status: 'unavailable' });
        }
    });
    const assets = join(process.cwd(), 'dist/web');
    if (existsSync(assets)) {
        server.use(express.static(assets, { index: false, maxAge: 0, fallthrough: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
        server.get(['/', '/activate'], (_req, res) => res.set('Cache-Control', 'no-store').sendFile(join(assets, 'index.html')));
    }
    app.enableShutdownHooks();
    const port = Number(process.env.PORT ?? 4318);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
        throw new Error('PORT invalid');
    await app.listen(port, process.env.HOST ?? '127.0.0.1');
    console.log(`ONCE API listening on ${port}; environment=${config.environment}; access=${config.accessMode}`);
}
main().catch(() => { console.error('ONCE startup failed. Check required configuration, migration and secret-file permissions.'); process.exitCode = 1; void store?.close(); });
