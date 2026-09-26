import { chmod, copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { digest } from '../../../../packages/core/src/json.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import { LocalMediaProvider } from '../media/local-provider.ts';
import { sha256File } from './backup-manifest.ts';

export interface BackupMediaAsset {
    id: string;
    uploadId: string;
    objectToken: string;
    original: { bytes: number; sha256: string };
    preview: { bytes: number; sha256: string };
}
export interface BackupMediaManifest {
    provider: 'disabled' | 'local';
    identityDigest: string;
    assetCount: number;
    totalBytes: number;
    assets: BackupMediaAsset[];
}

type MediaIdentityRow = {
    id:string;uploadId:string;sourceId:string;scopeId:string;personId:string|null;revision:number;
    fileName:string;mime:string;bytes:number;sha256:string;width:number;height:number;
    previewBytes:number;previewHash:string;objectToken:string;state:string;
};
function backupIdentity(rows: MediaIdentityRow[]) {
    return digest(rows.map(x=>({
        id:x.id,uploadId:x.uploadId,sourceId:x.sourceId,scopeId:x.scopeId,personId:x.personId,
        fileName:x.fileName,mime:x.mime,bytes:x.bytes,sha256:x.sha256,
        width:x.width,height:x.height,previewBytes:x.previewBytes,previewHash:x.previewHash,
        objectToken:x.objectToken
    })).sort((a,b)=>a.id.localeCompare(b.id)));
}
function stateIdentity(rows: MediaIdentityRow[]) {
    return digest(rows.map(x=>({
        id:x.id,revision:x.revision,state:x.state,
        backupIdentity: {
            uploadId:x.uploadId,sourceId:x.sourceId,scopeId:x.scopeId,personId:x.personId,
            fileName:x.fileName,mime:x.mime,bytes:x.bytes,sha256:x.sha256,
            width:x.width,height:x.height,previewBytes:x.previewBytes,previewHash:x.previewHash,
            objectToken:x.objectToken
        }
    })).sort((a,b)=>a.id.localeCompare(b.id)));
}
export async function currentMediaIdentity(client: PrismaClient) {
    const assets=await client.mediaAsset.findMany({where:{state:{not:'ERASED'}},orderBy:{id:'asc'}});
    return {assets,identityDigest:backupIdentity(assets),stateDigest:stateIdentity(assets)};
}
async function makeBundleRoot(root: string) {
    await mkdir(root,{mode:0o700});
    invariant((await readdir(root)).length===0,'BACKUP_MEDIA_TARGET_INVALID','媒体备份目录必须是新建空目录',503);
    await mkdir(join(root,'uploads'),{mode:0o700});
    await mkdir(join(root,'trash'),{mode:0o700});
    const marker=join(root,'.once-private-media-v1');
    const {writeFile}=await import('node:fs/promises');
    await writeFile(marker,'ONCE_PRIVATE_MEDIA_V1\n',{flag:'wx',mode:0o600});
}
export async function backupPrivateMedia(client: PrismaClient, providerMode: string, mediaRoot: string|undefined,
    destinationRoot: string): Promise<BackupMediaManifest> {
    const {assets,identityDigest}=await currentMediaIdentity(client);
    invariant(providerMode==='disabled'||providerMode==='local','BACKUP_MEDIA_PROVIDER_INVALID','备份仅支持 disabled/local 媒体提供方',503);
    if(providerMode==='disabled'){
        invariant(assets.length===0,'BACKUP_MEDIA_REQUIRED','数据库存在私有媒体，不能在 MEDIA_PROVIDER=disabled 下生成完整备份',503);
        return {provider:'disabled',identityDigest,assetCount:0,totalBytes:0,assets:[]};
    }
    invariant(!!mediaRoot,'BACKUP_MEDIA_ROOT_REQUIRED','私有媒体备份需要 MEDIA_ROOT',503);
    const provider=await LocalMediaProvider.openExisting(mediaRoot!);
    await makeBundleRoot(destinationRoot);
    const rows:BackupMediaAsset[]=[];
    let totalBytes=0;
    for(const asset of assets){
        await provider.verifyAsset({
            id:asset.id,workspaceId:asset.workspaceId,createdAt:asset.createdAt.toISOString(),updatedAt:asset.updatedAt.toISOString(),
            revision:asset.revision,uploadId:asset.uploadId,sourceId:asset.sourceId,scopeId:asset.scopeId,personId:asset.personId,
            fileName:asset.fileName,mime:asset.mime as 'image/jpeg'|'image/png'|'image/webp',bytes:asset.bytes,sha256:asset.sha256,
            width:asset.width,height:asset.height,previewBytes:asset.previewBytes,previewHash:asset.previewHash,
            objectToken:asset.objectToken,state:asset.state as 'READY'|'QUARANTINED'|'ERASED'
        });
        const source=provider.work(asset.uploadId,asset.objectToken);
        const target=join(destinationRoot,'uploads',asset.uploadId,'work-'+asset.objectToken);
        await mkdir(target,{recursive:true,mode:0o700});
        const originalTarget=join(target,'original.bin'),previewTarget=join(target,'preview.jpg');
        await copyFile(join(source,'original.bin'),originalTarget);await chmod(originalTarget,0o400);
        await copyFile(join(source,'preview.jpg'),previewTarget);await chmod(previewTarget,0o400);
        const original=await sha256File(originalTarget),preview=await sha256File(previewTarget);
        invariant(original.bytes===asset.bytes&&original.sha256===asset.sha256
            &&preview.bytes===asset.previewBytes&&preview.sha256===asset.previewHash,
            'BACKUP_MEDIA_COPY_INVALID','媒体备份副本与数据库身份不一致',503);
        rows.push({id:asset.id,uploadId:asset.uploadId,objectToken:asset.objectToken,original,preview});
        totalBytes+=original.bytes+preview.bytes;
    }
    return {provider:'local',identityDigest,assetCount:rows.length,totalBytes,assets:rows};
}

export async function restorePrivateMedia(manifest: BackupMediaManifest, bundleRoot: string,
    targetRoot: string): Promise<void> {
    invariant(manifest.provider==='local','RESTORE_MEDIA_PROVIDER_INVALID','当前媒体备份不是 local bundle',503);
    const source=await LocalMediaProvider.openExisting(bundleRoot);
    const target=await LocalMediaProvider.create(targetRoot);
    for(const row of manifest.assets){
        const sourceDir=source.work(row.uploadId,row.objectToken);
        const targetDir=target.work(row.uploadId,row.objectToken);
        await mkdir(targetDir,{recursive:true,mode:0o700});
        const originalTarget=join(targetDir,'original.bin'),previewTarget=join(targetDir,'preview.jpg');
        await copyFile(join(sourceDir,'original.bin'),originalTarget);await chmod(originalTarget,0o400);
        await copyFile(join(sourceDir,'preview.jpg'),previewTarget);await chmod(previewTarget,0o400);
        const original=await sha256File(originalTarget),preview=await sha256File(previewTarget);
        invariant(original.bytes===row.original.bytes&&original.sha256===row.original.sha256
            &&preview.bytes===row.preview.bytes&&preview.sha256===row.preview.sha256,
            'RESTORE_MEDIA_COPY_INVALID','恢复后的媒体文件与备份清单不一致',503);
    }
    const targetStat=await stat(targetRoot);
    invariant(targetStat.isDirectory()&&(targetStat.mode&0o077)===0,'RESTORE_MEDIA_COPY_INVALID','恢复媒体目录权限不安全',503);
}
