import {get as httpsGet} from 'node:https';
import {Transform, type Readable} from 'node:stream';
import {AppError, invariant} from '../../../../packages/core/src/errors.ts';
import type {MediaAsset} from '../../../../packages/core/src/media-model.ts';

/** Server-only object reference. Never serialized to a browser or accepted from a caller. */
export interface ImmutableMediaObject {
    asset: MediaAsset;
    identity: string;
    bytes: number;
}
export interface ByteStreamRequest {
    objectRef: ImmutableMediaObject;
    start: number;
    endInclusive: number;
    signal: AbortSignal;
}
export interface OpenMediaStream { stream: Readable; close(): void }
export function validateByteRequest(r: ByteStreamRequest) {
    invariant(!r.signal.aborted, 'MEDIA_CANCELLED', '播放已取消', 409);
    invariant(Number.isSafeInteger(r.start) && Number.isSafeInteger(r.endInclusive) && r.start >= 0 && r.start <= r.endInclusive && r.endInclusive < r.objectRef.bytes,
        'MEDIA_RANGE_INVALID', '播放范围无效', 416);
}
export function exactLengthStream(input: Readable, bytes: number, signal: AbortSignal): OpenMediaStream {
    let count = 0;
    const stream = new Transform({highWaterMark: 64 * 1024, transform(chunk: Buffer, _encoding, done) {
        count += chunk.length;
        if (count > bytes) return done(new AppError(503, 'MEDIA_FILE_INVALID', '媒体对象长度已变化'));
        done(null, chunk);
    }, flush(done) {
        done(count === bytes ? undefined : new AppError(503, 'MEDIA_FILE_INVALID', '媒体对象不完整'));
    }});
    const close = () => { input.destroy(); stream.destroy(); };
    const abort = () => close();
    input.on('error', () => stream.destroy(new AppError(503, 'MEDIA_IO_FAILED', '播放中断，请重新核对')));
    stream.on('error', () => {}); // Can fail while the second authorization transaction is pending.
    stream.once('close', () => { input.destroy(); signal.removeEventListener('abort', abort); });
    signal.addEventListener('abort', abort, {once: true});
    input.pipe(stream);
    if (signal.aborted) close();
    return {stream, close};
}
/** Validate response headers before exposing any bytes. Never follows redirects or buffers the object. */
export function openHttpsByteStream(url: URL, r: ByteStreamRequest, request: typeof httpsGet = httpsGet): Promise<OpenMediaStream> {
    validateByteRequest(r);
    const expected = r.endInclusive - r.start + 1;
    return new Promise((resolve, reject) => {
        const req = request(url, {signal: r.signal, timeout: 30000, maxHeaderSize: 16384,
            headers: {Range: `bytes=${r.start}-${r.endInclusive}`, 'If-Match': r.objectRef.identity, 'Accept-Encoding': 'identity'}}, response => {
            response.pause();
            try {
                invariant(response.statusCode === 206 && response.headers['content-range'] === `bytes ${r.start}-${r.endInclusive}/${r.objectRef.bytes}` &&
                    response.headers['content-length'] === String(expected) && response.headers.etag === r.objectRef.identity && !response.headers['content-encoding'],
                    'MEDIA_FILE_INVALID', '存储未返回所请求的不可变字节范围', 503);
                resolve(exactLengthStream(response, expected, r.signal));
            } catch (e) { response.destroy(); req.destroy(); reject(e); }
        });
        req.once('timeout', () => req.destroy(new Error('timeout')));
        req.once('error', () => reject(new AppError(503, 'MEDIA_IO_FAILED', '私有存储读取未完成')));
    });
}
