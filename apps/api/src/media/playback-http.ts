import {digest} from '../../../../packages/core/src/json.ts';
import type {MediaAsset} from '../../../../packages/core/src/media-model.ts';
import type {Express, Request, Response} from 'express';
import {pipeline} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import type {Application, ApiRequest} from '../../../../packages/core/src/api.ts';
import {AppError, invariant} from '../../../../packages/core/src/errors.ts';
import {uuid} from '../../../../packages/core/src/validation.ts';
import {MEDIA_PLAYBACK_DEFAULTS, playbackRange} from '../../../../packages/core/src/media-playback.ts';
import {PlaybackBudget} from './playback-limits.ts';
import type {LocalMediaProvider} from './local-provider.ts';
import type {OpenMediaStream} from './byte-stream.ts';

function request(req: Request): ApiRequest {
    return {method: 'GET', url: req.originalUrl, ip: req.ip ?? 'unknown', headers: Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(',') : v]))};
}
function fail(res: Response, e: unknown) {
    if (res.headersSent || res.destroyed) { res.destroy(); return; }
    const err = e instanceof AppError ? e : new AppError(503, 'MEDIA_IO_FAILED', '播放未完成，请重新核对');
    // Do not retain a success length/range on a JSON failure.
    res.removeHeader('Content-Length'); res.removeHeader('Content-Range');
    res.status(err.status).json({error: {code: err.code, message: err.message, requestId: randomUUID()}});
}
export function registerPlaybackHttp(server: Express, core: Application, provider: LocalMediaProvider | null) {
    const limits = core.config.mediaPlayback ?? MEDIA_PLAYBACK_DEFAULTS, budget = new PlaybackBudget(limits);
    server.get('/api/v1/assets/:id/playback', async (req, res) => {
        res.set({'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin'});
        const controller = new AbortController(), abort = () => controller.abort();
        const timer = setTimeout(abort, limits.maxSeconds * 1000);
        let integrityAsset: MediaAsset | undefined;
        let opened: OpenMediaStream | undefined, release: (() => void) | undefined, watch: ReturnType<typeof setInterval> | undefined;
        req.once('aborted', abort); res.once('close', abort);
        try {
            invariant(provider, 'MEDIA_DISABLED', '私有媒体存储尚未启用', 503);
            invariant(req.method === 'GET', 'METHOD_NOT_ALLOWED', '该播放入口仅接受GET', 405);
            invariant(!req.headers.authorization, 'MACHINE_OPERATION_FORBIDDEN', '该播放入口只接受内部会话', 403);
            invariant(!req.url.includes('?'), 'QUERY_INVALID', '播放地址不接受额外参数', 400);
            invariant(!req.headers.origin || req.headers.origin === core.config.origin, 'ORIGIN_DENIED', '播放来源不被允许', 403);
            const id = uuid.parse(req.params.id), r = request(req);
            const initial = await core.authenticated(r, 'assets.read', async (tx, actor) => {
                invariant(!r.headers['x-once-membership'] || r.headers['x-once-membership'] === actor.membershipId, 'IDENTITY_CHANGED', '当前账号已变化', 409);
                return {asset: await core.media.playback(tx, actor, id), workspace: actor.workspaceId, actor: actor.membershipId};
            });
            const a = initial.asset; integrityAsset = a;
            const range = playbackRange(req.headers.range, a.bytes);
            release = budget.enter(initial.workspace, initial.actor, range.status === 416 ? 0 : range.endInclusive - range.start + 1);
            const recheck = (audit: boolean) => core.authenticated(r, 'assets.read', async (tx, actor) => {
                invariant(actor.membershipId === initial.actor, 'IDENTITY_CHANGED', '当前账号已变化', 409);
                const current = await core.media.playback(tx, actor, id, audit ? {requestId: randomUUID(), ip: r.ip} : undefined);
                invariant(current.revision === a.revision && current.uploadId === a.uploadId && current.objectToken === a.objectToken && current.sha256 === a.sha256 && current.bytes === a.bytes, 'NOT_FOUND', '素材已变化或不可访问', 404);
            });
            if (range.status === 416) {
                await recheck(false);
                res.set({'Content-Range': `bytes */${a.bytes}`, 'Accept-Ranges': 'bytes'}).status(416).end(); return;
            }
            // No database transaction is held over stat, remote headers, or byte delivery.
            const objectRef = await provider.statImmutableObject(a, controller.signal);
            opened = await provider.openByteStream({objectRef, start: range.start, endInclusive: range.endInclusive, signal: controller.signal});
            await recheck(true);
            invariant(!controller.signal.aborted && !opened.stream.destroyed, 'MEDIA_CANCELLED', '播放已取消', 409);
            let checking = false;
            watch = setInterval(() => { if (checking) return; checking = true; void recheck(false).catch(abort).finally(() => { checking = false; }); }, 5000);
            res.set({'Content-Type': 'video/mp4', 'Content-Length': String(range.endInclusive - range.start + 1), 'Accept-Ranges': 'bytes',
                'Content-Disposition': 'inline; filename="video.mp4"', 'Content-Security-Policy': "default-src 'none'; sandbox"});
            if (range.status === 206) res.set('Content-Range', `bytes ${range.start}-${range.endInclusive}/${a.bytes}`);
            res.status(range.status);
            await pipeline(opened.stream, res, {signal: controller.signal});
        } catch (e) {
            if (integrityAsset && e instanceof AppError && e.code === 'MEDIA_FILE_INVALID') {
                try {
                    const requestId = randomUUID();
                    const intent = {intentId: 'intent:' + digest({operation: 'media.integrityQuarantine', workspaceId: integrityAsset.workspaceId, assetId: integrityAsset.id, revision: integrityAsset.revision, requestId}),
                        workspaceId: integrityAsset.workspaceId, operation: 'media.integrityQuarantine', requestId, resourceId: integrityAsset.id};
                    await core.safetyIntent?.writeAhead(intent);
                    await core.media.quarantineCorrupt(integrityAsset, intent.requestId);
                    // A lost completion response cannot prove the database transaction failed.
                    await core.safetyIntent?.committed(intent, integrityAsset.id).catch(() => {});
                } catch { fail(res, new AppError(503, 'MEDIA_INTEGRITY_UNRESOLVED', '素材校验异常，请联系维护人员')); return; }
            }
            fail(res, e);
        }
        finally {
            clearTimeout(timer); if (watch) clearInterval(watch); opened?.close(); controller.abort(); release?.();
            req.removeListener('aborted', abort); res.removeListener('close', abort);
        }
    });
}
