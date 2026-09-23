/** Runs in a separate, credential-free process. No stdout except bounded structured metadata.
 * Native decoding is NOT a complete security sandbox; production enablement remains blocked. */
import sharp from 'sharp';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MEDIA_LIMITS as L } from '../../../../packages/core/src/media-model.ts';
async function decode() {
    const [input, output, mime] = process.argv.slice(2);
    if (!input || !output)
        throw new Error('args');
    sharp.cache(false);
    sharp.concurrency(1);
    const image = sharp(input, { failOn: 'warning', limitInputPixels: L.pixels, sequentialRead: true });
    const meta = await image.metadata();
    const format = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[meta.format as 'jpeg'];
    if (format !== mime || !meta.width || !meta.height || meta.width * meta.height > L.pixels || (meta.pages ?? 1) !== 1)
        throw new Error('format');
    const info = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toFile(output);
    if (info.size > L.previewBytes)
        throw new Error('preview');
    // sharp strips EXIF/ICC/XMP by default; do not use keepMetadata/withMetadata.
    const preview = await readFile(output), original = await stat(input);
    console.log(JSON.stringify({ width: meta.width, height: meta.height, previewBytes: preview.length, previewHash: createHash('sha256').update(preview).digest('hex'), bytes: original.size }));
}
decode().catch(() => { process.stderr.write('IMAGE_REJECTED\n'); process.exitCode = 1; });
