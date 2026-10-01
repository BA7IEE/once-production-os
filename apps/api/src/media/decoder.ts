/** Runs in a separate, credential-free process. No stdout except bounded structured metadata.
 * Native decoding is resource bounded, not a complete operating-system security sandbox. */
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';
import {rm} from 'node:fs/promises';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MEDIA_LIMITS as L } from '../../../../packages/core/src/media-model.ts';
async function decode() {
    const [input, output, mime] = process.argv.slice(2);
    if (!input || !output)
        throw new Error('args');
    sharp.cache(false);
    sharp.concurrency(1);
    if(mime==='application/pdf'){
        // Opaque attachment: deliberately no PDF interpreter, OCR, metadata or text extraction.
        const preview=await sharp({create:{width:240,height:320,channels:3,background:'#e7e9ed'}}).jpeg().toBuffer();
        const {writeFile}=await import('node:fs/promises');await writeFile(output,preview,{flag:'wx',mode:0o600});
        console.log(JSON.stringify({width:240,height:320,previewBytes:preview.length,previewHash:createHash('sha256').update(preview).digest('hex'),bytes:(await stat(input)).size}));return;
    }
    let imageInput=input;
    if(mime==='video/mp4'){
        const args=['-v','error','-max_alloc','67108864','-protocol_whitelist','file','-show_entries','format=format_name,duration:stream=codec_type,codec_name,pix_fmt,width,height','-of','json',input];
        const probe=JSON.parse(execFileSync('ffprobe',args,{timeout:15000,maxBuffer:32768,stdio:['ignore','pipe','ignore']}).toString());
        const video=probe.streams?.filter((s:{codec_type:string})=>s.codec_type==='video');
        if (video?.[0]?.codec_name !== 'h264' || video[0].pix_fmt !== 'yuv420p' || probe.streams.some((s:{codec_type:string;codec_name:string}) => s.codec_type !== 'video' && !(s.codec_type === 'audio' && s.codec_name === 'aac'))) throw new Error('codec');
        if(!probe.format?.format_name?.split(',').includes('mp4')||video?.length!==1||!Number.isFinite(Number(probe.format.duration))||Number(probe.format.duration)<=0||Number(probe.format.duration)>1800||video[0].width*video[0].height>L.pixels)throw new Error('video');
        imageInput=output+'.frame.png';
        execFileSync('ffmpeg',['-v','error','-nostdin','-max_alloc','67108864','-threads','1','-protocol_whitelist','file','-enable_drefs','0','-use_absolute_path','0','-i',input,'-map','0:v:0','-frames:v','1','-vf','scale=1600:1600:force_original_aspect_ratio=decrease','-threads','1','-f','image2',imageInput],{timeout:30000,maxBuffer:32768,stdio:'ignore'});
    }
    const image = sharp(imageInput, { failOn: 'warning', limitInputPixels: L.pixels, sequentialRead: true });
    const meta = await image.metadata();
    const format = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[meta.format as 'jpeg'];
    if ((mime!=='video/mp4' && format !== mime) || !meta.width || !meta.height || meta.width * meta.height > L.pixels || (meta.pages ?? 1) !== 1)
        throw new Error('format');
    const info = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toFile(output);
    if (info.size > L.previewBytes)
        throw new Error('preview');
    // sharp strips EXIF/ICC/XMP by default; do not use keepMetadata/withMetadata.
    const preview = await readFile(output), original = await stat(input);
    if(imageInput!==input)await rm(imageInput,{force:true});
    console.log(JSON.stringify({ width: meta.width, height: meta.height, previewBytes: preview.length, previewHash: createHash('sha256').update(preview).digest('hex'), bytes: original.size }));
}
decode().catch(() => { process.stderr.write('IMAGE_REJECTED\n'); process.exitCode = 1; });
