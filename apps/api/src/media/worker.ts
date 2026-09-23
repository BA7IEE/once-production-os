import { spawn } from 'node:child_process';
import { readFile, chmod } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Application } from '../../../../packages/core/src/api.ts';
import type { MediaUpload } from '../../../../packages/core/src/media-model.ts';
import { MEDIA_LIMITS as L } from '../../../../packages/core/src/media-model.ts';
import { LocalMediaProvider } from './local-provider.ts';
import { AppError } from '../../../../packages/core/src/errors.ts';
async function decode(path: string, preview: string, mime: string, signal: AbortSignal): Promise<{
    width: number;
    height: number;
    previewBytes: number;
    previewHash: string;
    bytes: number;
}> {
    const module = fileURLToPath(new URL('./decoder.js', import.meta.url));
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--max-old-space-size=128', module, path, preview, mime], {
            env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C.UTF-8', VIPS_CONCURRENCY: '1' }, stdio: ['ignore', 'pipe', 'ignore']
        });
        let output = '', ended = false;
        const abort = () => child.kill('SIGKILL');
        const timer = setTimeout(abort, L.parseMs);
        // RSS includes native allocations; V8's heap switch alone cannot bound libvips memory.
        let reading = false;
        const memory = setInterval(() => {
            if (reading || !child.pid || process.platform !== 'linux')
                return;
            reading = true;
            void readFile('/proc/' + child.pid + '/status', 'utf8').then(s => { const kb = Number(s.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0); if (kb > 256 * 1024)
                abort(); }).catch(() => { }).finally(() => { reading = false; });
        }, 100);
        const clean = () => { ended = true; clearTimeout(timer); clearInterval(memory); signal.removeEventListener('abort', abort); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
        child.stdout.on('data', (b: Buffer) => { output += b.toString('utf8'); if (output.length > 2048)
            abort(); });
        child.once('error', () => { if (!ended) {
            clean();
            reject(new AppError(503, 'MEDIA_DECODER_UNAVAILABLE', '图片处理程序无法启动'));
        } });
        child.once('close', code => {
            if (ended)
                return;
            clean();
            if (code !== 0 || signal.aborted)
                return reject(new AppError(422, 'IMAGE_REJECTED', '图片解码失败、超过资源限制或处理已取消'));
            try {
                resolve(JSON.parse(output));
            }
            catch {
                reject(new AppError(422, 'IMAGE_REJECTED', '图片结果无效'));
            }
        });
    });
}
export class MediaWorker {
    readonly core: Application;
    readonly provider: LocalMediaProvider;
    constructor(core: Application, provider: LocalMediaProvider) { this.core = core; this.provider = provider; }
    async cycle(signal: AbortSignal): Promise<boolean> {
        for (const u of await this.core.media.expire()) {
            if (signal.aborted)
                return false;
            await this.core.media.purgeAllowed(u.id);
            await this.provider.purge(u.id);
            await this.core.media.markPurged(u.id);
        }
        if (signal.aborted)
            return false;
        const claim = await this.core.media.claim();
        if (!claim)
            return false;
        await this.process(claim, signal);
        return true;
    }
    async process(claim: MediaUpload, signal: AbortSignal) {
        const controller = new AbortController(), abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
        let heartbeat = false;
        const timer = setInterval(() => { if (heartbeat)
            return; heartbeat = true; void this.core.media.heartbeat(claim).catch(abort).finally(() => { heartbeat = false; }); }, 10000);
        try {
            await this.core.media.heartbeat(claim);
            const sealed = await this.provider.seal(claim, controller.signal);
            const result = await decode(sealed.path, sealed.preview, claim.mime, controller.signal);
            await chmod(sealed.preview, 0o400);
            await this.core.media.finish(claim, { ...result, mime: claim.mime, sha256: claim.expectedHash });
            // Do not delete READY objects if the completion response or housekeeping is uncertain.
            await this.provider.removeStaging(claim).catch(() => { });
        }
        catch (e) {
            const code = e instanceof AppError ? e.code : 'MEDIA_IO_FAILED';
            await this.core.media.fail(claim, code).catch(() => { });
        }
        finally {
            clearInterval(timer);
            signal.removeEventListener('abort', abort);
        }
    }
}
