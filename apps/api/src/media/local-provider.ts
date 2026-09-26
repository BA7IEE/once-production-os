import { constants } from 'node:fs';
import { mkdir, realpath, lstat, open, chmod, rename, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { Transform, Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import type { MediaAsset, MediaUpload, ImageMime } from '../../../../packages/core/src/media-model.ts';
import { MEDIA_LIMITS as L } from '../../../../packages/core/src/media-model.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import { uuid } from '../../../../packages/core/src/validation.ts';
function sink(file: FileHandle): Writable {
    return new Writable({ write(chunk: Buffer, _encoding, done) {
            void (async () => { let offset = 0; while (offset < chunk.length) {
                const r = await file.write(chunk, offset, chunk.length - offset);
                if (!r.bytesWritten)
                    throw new Error('short write');
                offset += r.bytesWritten;
            } })().then(() => done(), done);
        } });
}
/** Real private filesystem adapter. API clients never receive paths and never get final write access.
 * Only local/test installations may enable it until the deployment sandbox/storage review is done. */
export class LocalMediaProvider {
    readonly root: string;
    private constructor(root: string) { this.root = root; }
    static async create(root: string) {
        invariant(isAbsolute(root) && resolve(root) !== '/', 'MEDIA_ROOT_INVALID', 'MEDIA_ROOT必须是独立的绝对目录', 503);
        await mkdir(root, { recursive: true, mode: 0o700 });
        invariant(await realpath(root) === resolve(root), 'MEDIA_ROOT_INVALID', '存储目录不能经过符号链接', 503);
        const marker = join(root, '.once-private-media-v1');
        try {
            invariant(await readFile(marker, 'utf8') === 'ONCE_PRIVATE_MEDIA_V1\n', 'MEDIA_ROOT_INVALID', '目录不是已登记的私有媒体目录', 503);
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
            invariant((await readdir(root)).length === 0, 'MEDIA_ROOT_INVALID', '新媒体目录必须为空，不接管既有文件', 503);
            await writeFile(marker, 'ONCE_PRIVATE_MEDIA_V1\n', { flag: 'wx', mode: 0o600 });
        }
        for (const name of ['uploads', 'trash']) {
            const path = join(root, name);
            await mkdir(path, { recursive: true, mode: 0o700 });
            const st = await lstat(path);
            invariant(st.isDirectory() && !st.isSymbolicLink() && (st.mode & 0o077) === 0,
                'MEDIA_ROOT_INVALID', '私有目录不安全或权限过宽', 503);
            await chmod(path, 0o700);
        }
        await chmod(root, 0o700);
        return new LocalMediaProvider(resolve(root));
    }
    /** Restore-check opener: validate an existing private-media root without creating or chmod'ing anything. */
    static async openExisting(root: string) {
        invariant(isAbsolute(root) && resolve(root) !== '/', 'MEDIA_ROOT_INVALID', 'MEDIA_ROOT必须是独立的绝对目录', 503);
        invariant(await realpath(root) === resolve(root), 'MEDIA_ROOT_INVALID', '存储目录不能经过符号链接', 503);
        const rootStat = await lstat(root);
        invariant(rootStat.isDirectory() && !rootStat.isSymbolicLink() && (rootStat.mode & 0o077) === 0,
            'MEDIA_ROOT_INVALID', '恢复后的私有媒体根目录权限过宽', 503);
        invariant(await readFile(join(root, '.once-private-media-v1'), 'utf8') === 'ONCE_PRIVATE_MEDIA_V1\n',
            'MEDIA_ROOT_INVALID', '目录不是已登记的私有媒体目录', 503);
        for (const name of ['uploads', 'trash']) {
            const st = await lstat(join(root, name));
            invariant(st.isDirectory() && !st.isSymbolicLink(), 'MEDIA_ROOT_INVALID', '私有目录不安全', 503);
        }
        return new LocalMediaProvider(resolve(root));
    }
    group(id: string) { return join(this.root, 'uploads', uuid.parse(id)); }
    staging(u: MediaUpload) { return join(this.group(u.id), 'ingest-' + uuid.parse(u.receiveToken) + '.bin'); }
    work(id: string, token: string) { return join(this.group(id), 'work-' + uuid.parse(token)); }
    private async checkedFile(path: string) {
        const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
            const st = await file.stat();
            invariant(st.isFile(), 'MEDIA_FILE_INVALID', '存储对象不是文件', 422);
            return { file, st };
        }
        catch (e) {
            await file.close();
            throw e;
        }
    }
    async receive(u: MediaUpload, input: Readable, signal: AbortSignal) {
        // Never recursively recreate this per-upload directory. Purge can atomically rename it.
        await mkdir(this.group(u.id), { mode: 0o700 });
        const out = await open(this.staging(u), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        let bytes = 0;
        const hash = createHash('sha256');
        const meter = new Transform({ transform(chunk: Buffer, _encoding, done) {
                bytes += chunk.length;
                if (bytes > u.expectedBytes || bytes > L.imageBytes)
                    return done(new Error('size exceeded'));
                hash.update(chunk);
                done(null, chunk);
            } });
        try {
            // A bounded Writable keeps the descriptor open for fsync without waiting on an unclosed fs stream.
            await pipeline(input, meter, sink(out), { signal });
            await out.sync();
            invariant(bytes === u.expectedBytes, 'UPLOAD_SIZE_MISMATCH', '文件大小不一致', 422);
            const sha256 = hash.digest('hex');
            invariant(sha256 === u.expectedHash, 'UPLOAD_DIGEST_MISMATCH', '文件校验失败', 422);
            return { bytes, sha256 };
        }
        finally {
            await out.close().catch(() => { });
        }
    }
    async seal(u: MediaUpload, signal: AbortSignal) {
        const dir = this.work(u.id, u.leaseToken!);
        await mkdir(dir, { mode: 0o700 });
        const path = join(dir, 'original.bin'), source = await this.checkedFile(this.staging(u));
        const dest = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        const hash = createHash('sha256');
        let bytes = 0;
        try {
            invariant(source.st.size === u.expectedBytes, 'MEDIA_SIZE_INVALID', '封存文件长度无效', 422);
            const meter = new Transform({ transform(chunk: Buffer, _encoding, done) {
                    bytes += chunk.length;
                    if (bytes > u.expectedBytes)
                        return done(new Error('size exceeded'));
                    hash.update(chunk);
                    done(null, chunk);
                } });
            await pipeline(source.file.createReadStream(), meter, sink(dest), { signal });
            await dest.sync();
            const sha256 = hash.digest('hex');
            invariant(bytes === u.expectedBytes && sha256 === u.expectedHash, 'MEDIA_DIGEST_INVALID', '封存文件与上传内容不一致', 422);
        }
        finally {
            await source.file.close().catch(() => { });
            await dest.close().catch(() => { });
        }
        await chmod(path, 0o400);
        const f = await this.checkedFile(path);
        const magic = Buffer.alloc(12);
        try {
            await f.file.read(magic, 0, 12, 0);
        }
        finally {
            await f.file.close();
        }
        const mime: ImageMime | null = magic.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? 'image/jpeg' :
            magic.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png' :
                magic.toString('ascii', 0, 4) === 'RIFF' && magic.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : null;
        invariant(mime === u.mime, 'MEDIA_TYPE_INVALID', '文件真实类型与声明不符或不支持', 422);
        return { path, preview: join(dir, 'preview.jpg') };
    }
    async verifyAsset(a: MediaAsset): Promise<void> {
        const originalPath = join(this.work(a.uploadId, a.objectToken), 'original.bin');
        const original = await this.checkedFile(originalPath);
        try {
            invariant(original.st.size === a.bytes && (original.st.mode & 0o222) === 0,
                'MEDIA_FILE_INVALID', '原始文件长度或只读权限与数据库约定不一致', 503);
            const body = await original.file.readFile();
            invariant(body.length === a.bytes && createHash('sha256').update(body).digest('hex') === a.sha256,
                'MEDIA_FILE_INVALID', '原始文件摘要与数据库不一致', 503);
        }
        finally {
            await original.file.close();
        }
        await this.readPreview(a);
    }
    async readPreview(a: MediaAsset): Promise<Buffer> {
        const path = join(this.work(a.uploadId, a.objectToken), 'preview.jpg'), { file, st } = await this.checkedFile(path);
        try {
            invariant(st.size === a.previewBytes && st.size > 0 && st.size <= L.previewBytes && (st.mode & 0o222) === 0,
                'MEDIA_FILE_INVALID', '预览文件长度、权限或内容校验失败', 503);
            const b = await file.readFile();
            invariant(b.length === a.previewBytes && createHash('sha256').update(b).digest('hex') === a.previewHash, 'MEDIA_FILE_INVALID', '预览文件校验失败', 503);
            return b;
        }
        finally {
            await file.close();
        }
    }
    async purge(id: string): Promise<void> {
        const from = this.group(id), trash = join(this.root, 'trash', uuid.parse(id));
        try {
            await rename(from, trash);
        }
        catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
                throw e;
        }
        await rm(trash, { recursive: true, force: true });
        // A delayed writer cannot recreate a group: only the one-shot OPEN -> RECEIVING does mkdir.
    }
    async removeStaging(u: MediaUpload) { await rm(this.staging(u), { force: true }); }
}
