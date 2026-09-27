import { constants } from 'node:fs';
import { open, mkdir, realpath, lstat, readFile, writeFile, chmod, rename } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { RebuildSchemas } from '../packages/core/src/rebuild-validation.ts';
import { digest } from '../packages/core/src/json.ts';
import { invariant } from '../packages/core/src/errors.ts';
import { LocalMediaProvider } from '../apps/api/src/media/local-provider.ts';

async function directory(path:string) {
    invariant(isAbsolute(path)&&resolve(path)!=='/'&&await realpath(path)===resolve(path),'REBUILD_MEDIA_DIRECTORY','媒体目录必须是无符号链接的独立绝对路径',422);
    const st=await lstat(path);
    invariant(st.isDirectory()&&(st.mode&0o077)===0,'REBUILD_MEDIA_DIRECTORY','媒体目录权限必须限制为当前账号',422);
}
async function checked(path:string,bytes:number,hash:string) {
    const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
        const st=await file.stat();
        invariant(st.isFile()&&st.size===bytes,'REBUILD_MEDIA_FILE','原件长度不匹配',422);
        const body=await file.readFile();
        invariant(body.length===bytes&&createHash('sha256').update(body).digest('hex')===hash,'REBUILD_MEDIA_FILE','原件摘要不匹配',422);
        return body;
    } finally {await file.close();}
}
/** Offline-only: inputs and I/O stay outside the database transaction. A failed/unknown
 * commit leaves the digest-bound private files intact; never delete them on catch. */
export async function prepareRebuildMedia(input:unknown,workspaceId:string,env:NodeJS.ProcessEnv,apply:boolean):Promise<string|undefined> {
    const payload=RebuildSchemas.payload.parse(input),assets=payload.manifest.talent?.assets??[];
    if(!assets.length)return undefined;
    const inputRoot=env.REBUILD_MEDIA_INPUT_DIR;
    invariant(inputRoot,'REBUILD_MEDIA_REQUIRED','需要原件目录 REBUILD_MEDIA_INPUT_DIR',422);
    await directory(inputRoot);
    // Check every file before creating any target. Do not hold all files in RAM.
    for(const a of assets) {
        await checked(join(inputRoot,a.id+'.original.bin'),a.bytes,a.sha256);
        await checked(join(inputRoot,a.id+'.preview.jpg'),a.previewBytes,a.previewHash);
    }
    if(!apply)return undefined;
    const root=env.REBUILD_MEDIA_TARGET_DIR;
    invariant(root&&isAbsolute(root)&&resolve(root)!==resolve(inputRoot)&&resolve(root)!=='/','REBUILD_MEDIA_TARGET','需要独立的新建私有媒体目录 REBUILD_MEDIA_TARGET_DIR',422);
    const marker=join(root,'.once-rebuild-media.json'),identity=JSON.stringify({schemaVersion:1,workspaceId,inputDigest:digest(payload)});
    try {
        await mkdir(root,{mode:0o700});
        await LocalMediaProvider.create(root);
        await writeFile(marker,identity,{mode:0o600,flag:'wx'});
    } catch(e) {
        if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
        await directory(root);
        const st=await lstat(marker);
        invariant(st.isFile()&&!st.isSymbolicLink()&&(st.mode&0o077)===0&&st.size===Buffer.byteLength(identity),'REBUILD_MEDIA_TARGET','已有目录不属于本次重建',409);
        invariant(await readFile(marker,'utf8')===identity,'REBUILD_MEDIA_TARGET','已有目录不属于本次重建',409);
    }
    await directory(root);
    const provider=await LocalMediaProvider.openExisting(root);
    for(const a of assets) {
        for(const dir of [provider.group(a.id),provider.work(a.id,a.id)]) {
            try {await mkdir(dir,{mode:0o700});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
            await directory(dir);
        }
        for(const [suffix,name,bytes,hash] of [['original.bin','original.bin',a.bytes,a.sha256],['preview.jpg','preview.jpg',a.previewBytes,a.previewHash]] as const) {
            const path=join(provider.work(a.id,a.id),name);
            try {await checked(path,bytes,hash);await chmod(path,0o400);}
            catch(e) {
                if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;
                const body=await checked(join(inputRoot,a.id+'.'+suffix),bytes,hash),temp=join(provider.work(a.id,a.id),'pending-'+randomUUID());
                const file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o400);
                try {await file.writeFile(body);await file.sync();}finally{await file.close();}
                await rename(temp,path);
            }
        }
        await provider.verifyAsset({...a,workspaceId,scopeId:workspaceId,uploadId:a.id,objectToken:a.id,state:'READY'});
    }
    // Persist file names and the ownership marker before the database may commit.
    for(const path of [marker,...assets.map(a=>provider.work(a.id,a.id)),...assets.map(a=>provider.group(a.id)),join(root,'uploads'),root]) {
        const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
        try {await handle.sync();}finally{await handle.close();}
    }
    return digest(payload);
}
