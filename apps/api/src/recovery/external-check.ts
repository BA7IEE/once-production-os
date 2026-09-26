import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { RecoveryExternalCheck } from '../../../../packages/core/src/recovery-model.ts';
import { digest } from '../../../../packages/core/src/json.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
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
    const verifiedAssetIds: string[] = [], missingAssetIds: string[] = [], mismatchAssetIds: string[] = [];
    const provider = env.MEDIA_PROVIDER ?? 'disabled';
    invariant(provider === 'disabled' || provider === 'local', 'RECOVERY_MEDIA_PROVIDER_INVALID',
        'restore-check 当前只支持 disabled/local 私有媒体提供方', 503);

    if (provider === 'local') {
        const root = env.MEDIA_ROOT;
        if (!root) missingAssetIds.push(...expectedAssetIds);
        else {
            let local: LocalMediaProvider | null = null;
            try { local = await LocalMediaProvider.openExisting(root); }
            catch { missingAssetIds.push(...expectedAssetIds); }
            if (local) for (const asset of assets) {
                try {
                    await local.verifyAsset({
                        id: asset.id, workspaceId: asset.workspaceId,
                        createdAt: asset.createdAt.toISOString(), updatedAt: asset.updatedAt.toISOString(),
                        revision: asset.revision, uploadId: asset.uploadId, sourceId: asset.sourceId,
                        scopeId: asset.scopeId, personId: asset.personId, fileName: asset.fileName,
                        mime: asset.mime as 'image/jpeg'|'image/png'|'image/webp', bytes: asset.bytes,
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
        media: { provider, identityDigest, expectedAssetIds, verifiedAssetIds, missingAssetIds, mismatchAssetIds }
    };
}
