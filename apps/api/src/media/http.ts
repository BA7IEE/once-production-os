import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Application, ApiRequest } from '../../../../packages/core/src/api.ts';
import { AppError, invariant } from '../../../../packages/core/src/errors.ts';
import { MEDIA_LIMITS as L } from '../../../../packages/core/src/media-model.ts';
import { uuid } from '../../../../packages/core/src/validation.ts';
import { LocalMediaProvider } from './local-provider.ts';
function request(req: Request): ApiRequest {
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers))
        headers[k] = Array.isArray(v) ? v.join(',') : v;
    return { method: req.method, url: req.originalUrl, headers, ip: req.ip ?? req.socket.remoteAddress ?? 'unknown' };
}
function error(res: Response, e: unknown) {
    if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
    }
    const known = e instanceof AppError ? e : new AppError(503, 'MEDIA_IO_FAILED', '文件操作未完成，请核对上传状态');
    res.status(known.status).json({ error: { code: known.code, message: known.message, requestId: randomUUID() } });
}
export function registerMediaHttp(server: Express, core: Application, provider: LocalMediaProvider | null) {
    const headers = (res: Response) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' }); };
    server.put('/api/v1/uploads/:id/content', async (req, res) => {
        headers(res);
        let claimed: Awaited<ReturnType<typeof core.media.beginReceive>> | null = null;
        const abort = new AbortController(), timer = setTimeout(() => abort.abort(), L.receiveMs);
        try {
            invariant(provider, 'MEDIA_DISABLED', '私有图片存储尚未启用', 503);
            invariant(req.headers['content-type'] === 'application/octet-stream' && !req.headers['content-encoding'], 'BINARY_REQUIRED', '请使用无压缩的二进制上传', 415);
            invariant(/^\d+$/.test(req.headers['content-length'] ?? ''), 'CONTENT_LENGTH_REQUIRED', '上传需要明确的Content-Length', 411);
            invariant(!req.headers['transfer-encoding'] && !req.url.includes('?'), 'BINARY_REQUEST_INVALID', '不支持该传输格式', 400);
            const id = uuid.parse(req.params.id), bytes = Number(req.headers['content-length']), r = request(req);
            claimed = await core.authenticated(r, 'assets.upload', (tx, actor) => core.media.beginReceive(tx, actor, id, bytes));
            const result = await provider.receive(claimed, req, abort.signal);
            const received = await core.authenticated(r, 'assets.upload', (tx, actor) => core.media.finishReceive(tx, actor, id, claimed!.receiveToken!, result.bytes, result.sha256));
            res.status(200).json(received);
        }
        catch (e) {
            if (claimed)
                await core.media.failReceive(claimed.id, claimed.receiveToken!).catch(() => { });
            error(res, e);
        }
        finally {
            clearTimeout(timer);
        }
    });
    server.get('/api/v1/assets/:id/preview', async (req, res) => {
        headers(res);
        try {
            invariant(provider, 'MEDIA_DISABLED', '私有图片存储尚未启用', 503);
            invariant(!req.url.includes('?'), 'QUERY_INVALID', '预览地址不接受额外参数', 400);
            const id = uuid.parse(req.params.id), r = request(req), meta = { requestId: randomUUID(), ip: r.ip };
            const a = await core.authenticated(r, 'assets.read', (tx, actor) => core.media.preview(tx, actor, id, meta));
            const bytes = await provider.readPreview(a);
            // File I/O did not hold the DB transaction. Recheck current identity and access immediately before sending.
            await core.authenticated(r, 'assets.read', async (tx, actor) => { const current = await core.media.getAsset(tx, actor, id); invariant(current.state === 'READY' && current.revision === a.revision, 'NOT_FOUND', '没有可访问的图片', 404); });
            res.set({ 'Content-Type': 'image/jpeg', 'Content-Disposition': 'inline; filename="preview.jpg"', 'Content-Security-Policy': "default-src 'none'; sandbox" }).status(200).send(bytes);
        }
        catch (e) {
            error(res, e);
        }
    });
}
