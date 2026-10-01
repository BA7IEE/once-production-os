import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { RecoveryExternalCheck } from '../../../../packages/core/src/recovery-model.ts';
import { digest } from '../../../../packages/core/src/json.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import {configuredMediaProvider} from '../media/cos-provider.ts';
import { LocalMediaProvider } from '../media/local-provider.ts';

export async function collectRecoveryExternalCheck(client: PrismaClient,
    env: NodeJS.ProcessEnv = process.env): Promise<RecoveryExternalCheck> {
    const expectedMigrations = readdirSync(join(process.cwd(), 'prisma', 'migrations'), { withFileTypes: true })
        .filter(x => x.isDirectory()).map(x => x.name).sort();
    const appliedRows = await client.$queryRawUnsafe<Array<{ migration_name: string }>>(
        'SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL ORDER BY "migration_name"');
    const appliedMigrations = appliedRows.map(x => x.migration_name).sort();
    const migrationMatch = expectedMigrations.length === appliedMigrations.length
        && expectedMigrations.every((name, i) => name === appliedMigrations[i]);
    const migrationDigest = digest({ expectedMigrations, appliedMigrations });

    const assets = await client.mediaAsset.findMany({ where: { state: { not: 'ERASED' } }, orderBy: { id: 'asc' } });
    const expectedAssetIds = assets.map(x => x.id);
    const identityDigest = digest(assets.map(x => ({
        id: x.id, uploadId: x.uploadId, sourceId: x.sourceId, scopeId: x.scopeId, personId: x.personId,
        revision: x.revision, fileName: x.fileName, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
        width: x.width, height: x.height, previewBytes: x.previewBytes, previewHash: x.previewHash,
        objectToken: x.objectToken, state: x.state
    })));
    const backupIdentityDigest = digest(assets.map(x => ({
        id: x.id, uploadId: x.uploadId, sourceId: x.sourceId, scopeId: x.scopeId, personId: x.personId,
        fileName: x.fileName, mime: x.mime, bytes: x.bytes, sha256: x.sha256,
        width: x.width, height: x.height, previewBytes: x.previewBytes, previewHash: x.previewHash,
        objectToken: x.objectToken
    })));
    const verifiedAssetIds: string[] = [], missingAssetIds: string[] = [], mismatchAssetIds: string[] = [];
    const provider = env.MEDIA_PROVIDER ?? 'disabled';
    const erasedPurges=await client.mediaPurgeIntent.findMany({where:{state:'ERASED'}});
    invariant(!erasedPurges.length||provider!=='disabled','RECOVERY_MEDIA_PROVIDER_REQUIRED','已擦除清理计划仍须核对私有对象不存在',503);
    invariant(provider==='disabled'||provider==='local'||provider==='cos', 'RECOVERY_MEDIA_PROVIDER_INVALID',
        'restore-check 当前只支持 disabled/local 私有媒体提供方', 503);

    if (provider === 'local'||provider==='cos') {
        const root = env.MEDIA_ROOT;
        if (!root) {invariant(!erasedPurges.length,'RECOVERY_MEDIA_PROVIDER_REQUIRED','缺少已擦除对象核对目录',503);missingAssetIds.push(...expectedAssetIds);}
        else {
            let local: LocalMediaProvider | null = null;
            try { local = await configuredMediaProvider(env,true); }
            catch { missingAssetIds.push(...expectedAssetIds); }
            invariant(!!local||!erasedPurges.length,'RECOVERY_MEDIA_PROVIDER_REQUIRED','无法核对已擦除对象',503);
            if(local)for(const p of erasedPurges){
                for(const o of p.objects as Array<{part:'original'|'preview';bytes:number;hash:string}>)invariant(await local.statPurgeObject({...o,uploadId:p.uploadId,objectToken:p.objectToken},new AbortController().signal)==='MISSING','RECOVERY_PURGE_INTEGRITY','已擦除对象仍有物理文件',503);
            }
            if (local) for (const asset of assets) {
                try {
                    const purge=await client.mediaPurgeIntent.findUnique({where:{assetId:asset.id}});
                    if(purge&&['DELETE_PENDING','DELETE_UNKNOWN','DELETE_CONFIRMED'].includes(purge.state)){
                        invariant(asset.usageState==='RETIRED'&&purge.objectToken===asset.objectToken,'RECOVERY_PURGE_INVALID','清理对象身份不符',503);
                        for(const o of purge.objects as Array<{part:'original'|'preview';bytes:number;hash:string}>)await local.statPurgeObject({...o,uploadId:asset.uploadId,objectToken:asset.objectToken},new AbortController().signal);
                        verifiedAssetIds.push(asset.id);continue;
                    }
                    await local.verifyAsset({
                        id: asset.id, workspaceId: asset.workspaceId,
                        createdAt: asset.createdAt.toISOString(), updatedAt: asset.updatedAt.toISOString(),
                        revision: asset.revision, uploadId: asset.uploadId, sourceId: asset.sourceId,
                        scopeId: asset.scopeId, personId: asset.personId, fileName: asset.fileName,
                        mime: asset.mime as import('../../../../packages/core/src/media-model.ts').MediaMime, bytes: asset.bytes,
                        sha256: asset.sha256, width: asset.width, height: asset.height,
                        previewBytes: asset.previewBytes, previewHash: asset.previewHash,
                        objectToken: asset.objectToken, state: asset.state as 'READY'|'QUARANTINED'|'ERASED'
                    });
                    verifiedAssetIds.push(asset.id);
                }
                catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') missingAssetIds.push(asset.id);
                    else mismatchAssetIds.push(asset.id);
                }
            }
        }
    }
    else missingAssetIds.push(...expectedAssetIds);

    return {
        migrationDigest, migrationMatch,
        media: { provider, identityDigest, backupIdentityDigest, expectedAssetIds, verifiedAssetIds, missingAssetIds, mismatchAssetIds }
    };
}
