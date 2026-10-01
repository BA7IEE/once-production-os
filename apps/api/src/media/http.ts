import {assetFor} from '../../../../packages/core/src/media.ts';
import {registerPlaybackHttp} from './playback-http.ts';
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
    registerPlaybackHttp(server, core, provider);
    const headers = (res: Response) => { res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' }); };
    server.put(['/api/v1/uploads/:id/content','/api/v1/portal/uploads/:id/content'], async (req, res) => {
        headers(res);
        let claimed: Awaited<ReturnType<typeof core.media.beginReceive>> | null = null;
        const abort = new AbortController(), timer = setTimeout(() => abort.abort(), L.receiveMs);
        try {
            invariant(provider, 'MEDIA_DISABLED', '私有媒体存储尚未启用', 503);
            invariant(req.headers['content-type'] === 'application/octet-stream' && !req.headers['content-encoding'], 'BINARY_REQUIRED', '请使用无压缩的二进制上传', 415);
            invariant(/^\d+$/.test(req.headers['content-length'] ?? ''), 'CONTENT_LENGTH_REQUIRED', '上传需要明确的Content-Length', 411);
            invariant(!req.headers['transfer-encoding'] && !req.url.includes('?'), 'BINARY_REQUEST_INVALID', '不支持该传输格式', 400);
            const id = uuid.parse(req.params.id), bytes = Number(req.headers['content-length']), r = request(req);
            const talent=req.path.startsWith('/api/v1/portal/');
            claimed = talent?await core.portal.authenticated(r,(tx,actor)=>core.media.beginReceive(tx,actor,id,bytes)):await core.authenticated(r, 'assets.upload', (tx, actor) => core.media.beginReceive(tx, actor, id, bytes));
            const result = await provider.receive(claimed, req, abort.signal);
            const received = talent?await core.portal.authenticated(r,(tx,actor)=>core.media.finishReceive(tx,actor,id,claimed!.receiveToken!,result.bytes,result.sha256)):await core.authenticated(r, 'assets.upload', (tx, actor) => core.media.finishReceive(tx, actor, id, claimed!.receiveToken!, result.bytes, result.sha256));
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
    for(const part of ['original','preview'] as const) server.get('/api/v1/exports/:id/media/:assetId/'+part,async(req,res)=>{
        headers(res);
        try {
            invariant(provider,'MEDIA_DISABLED','私有媒体存储尚未启用',503);
            invariant(!req.url.includes('?'),'QUERY_INVALID','下载地址不接受额外参数',400);
            const id=uuid.parse(req.params.id),assetId=uuid.parse(req.params.assetId),r=request(req);
            const asset=await core.authenticated(r,'data.export',(tx,actor)=>core.exports.mediaDownload(tx,actor,id,assetId));
            const bytes=part==='original'?await provider.readOriginal(asset):await provider.readPreview(asset);
            await core.authenticated(r,'data.export',async(tx,actor)=>{
                const current=await core.exports.mediaDownload(tx,actor,id,assetId,{requestId:randomUUID(),ip:r.ip});
                invariant(current.revision===asset.revision&&current.objectToken===asset.objectToken&&current.uploadId===asset.uploadId,'EXPORT_STALE','原件已经变化',409);
            });
            res.set({'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${assetId}.${part==='original'?'original.bin':'preview.jpg'}"`,'Content-Security-Policy':"default-src 'none'; sandbox"}).status(200).send(bytes);
        } catch(e) {error(res,e);}
    });
    for(const path of ['/api/v1/portal/accounts/:accountId/assets/:id/preview','/api/v1/talent-staged-assets/:id/preview'])server.get(path,async(req,res)=>{
        headers(res);
        try{
            invariant(provider,'MEDIA_DISABLED','私有媒体存储尚未启用',503);invariant(req.method==='GET'&&!req.url.includes('?')&&!req.headers.authorization,'BINARY_REQUEST_INVALID','请求无效',400);
            const id=uuid.parse(req.params.id),r=request(req),talent=req.path.startsWith('/api/v1/portal/');
            if(talent)r.headers['x-once-talent-account']=uuid.parse(req.params.accountId);
            const read=(log:boolean)=>talent?core.portal.authenticated(r,(tx,a)=>core.media.talentRead(tx,a,id,log?{requestId:randomUUID(),ip:r.ip}:undefined)):core.authenticated(r,'talent.review',(tx,a)=>core.media.staged(tx,a,id,log?{requestId:randomUUID(),ip:r.ip}:undefined));
            const a=await read(false),bytes=await provider.readPreview(a),current=await read(true);
            invariant(current.revision===a.revision&&current.objectToken===a.objectToken,'NOT_FOUND','素材不可访问',404);
            res.set({'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="preview.jpg"','Content-Security-Policy':"default-src 'none'; sandbox"}).status(200).send(bytes);
        }catch(e){error(res,e);}
    });
    // Private PDF attachment only: no OCR, PDF parsing or public URL.
    for(const surface of ['internal','review','talent'] as const)server.get(surface==='internal'?'/api/v1/assets/:id/attachment':surface==='review'?'/api/v1/talent-staged-assets/:id/attachment':'/api/v1/portal/accounts/:accountId/assets/:id/attachment',async(req,res)=>{
        headers(res);
        try{invariant(provider,'MEDIA_DISABLED','私有媒体存储尚未启用',503);invariant(req.method==='GET'&&!req.url.includes('?')&&!req.headers.authorization,'BINARY_REQUEST_INVALID','请求无效',400);
            const id=uuid.parse(req.params.id),r=request(req);if(surface==='talent')r.headers['x-once-talent-account']=uuid.parse((req.params as Record<string,string>).accountId);
            const read=(log:boolean)=>surface==='talent'?core.portal.authenticated(r,(tx,a)=>core.media.talentRead(tx,a,id,log?{requestId:randomUUID(),ip:r.ip}:undefined)):core.authenticated(r,surface==='review'?'talent.review':'assets.read',async(tx,a)=>surface==='review'?core.media.staged(tx,a,id,log?{requestId:randomUUID(),ip:r.ip}:undefined):log?core.media.preview(tx,a,id,{requestId:randomUUID(),ip:r.ip}):assetFor(tx,a,id,core.clock));
            const asset=await read(false);invariant(asset.state==='READY'&&asset.mime==='application/pdf','NOT_FOUND','附件不可访问',404);const bytes=await provider.readOriginal(asset),current=await read(true);invariant(current.state==='READY'&&current.revision===asset.revision&&current.objectToken===asset.objectToken,'NOT_FOUND','附件不可访问',404);
            res.set({'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="model-card.pdf"','Content-Security-Policy':"default-src 'none'; sandbox"}).status(200).send(bytes);
        }catch(e){error(res,e);}
    });
    server.get('/api/v1/assets/:id/preview', async (req, res) => {
        headers(res);
        try {
            invariant(provider, 'MEDIA_DISABLED', '私有媒体存储尚未启用', 503);
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
