import type {Tx} from './store.ts';
import {invariant} from './errors.ts';
import {mediaUsage} from './media-model.ts';
import { v, uuid, revision, dateIso, type Parsed } from './validation.ts';
import { MEDIA_LIMITS as L, type MediaAsset } from './media-model.ts';
export const MEDIA_TRANSFER_CODE = 'media.originals' as const;
export const TransferAssetSchema = v.object({
    relation:v.optional(v.object({personId:uuid,personRoleId:v.nullable(uuid),origin:v.object({workspaceId:uuid,principalKind:v.enum(['INTERNAL','TALENT','MACHINE']),membershipId:v.nullable(uuid),talentAccountId:v.nullable(uuid),servicePrincipalId:v.nullable(uuid),submissionId:v.nullable(uuid),sourceId:v.nullable(uuid)})})),
    id:uuid,sourceId:uuid,personId:v.nullable(uuid),revision,createdAt:dateIso,updatedAt:dateIso,
    fileName:v.string(255,1),mime:v.enum(['image/jpeg','image/png','image/webp','application/pdf','video/mp4']),
    bytes:v.number(1,L.videoBytes),sha256:v.string(64,64,/^[a-f0-9]{64}$/),
    width:v.number(1,L.pixels),height:v.number(1,L.pixels),
    previewBytes:v.number(1,L.previewBytes),previewHash:v.string(64,64,/^[a-f0-9]{64}$/)
});
export type TransferAsset = Parsed<typeof TransferAssetSchema>;
export function transferAsset(asset: MediaAsset):TransferAsset {
    return TransferAssetSchema.parse(Object.fromEntries(Object.keys(TransferAssetSchema.json.properties as object).map(k=>[k,(asset as unknown as Record<string,unknown>)[k]])));
}

export async function transferFormalAsset(tx:Tx,asset:MediaAsset):Promise<TransferAsset>{
 invariant(mediaUsage(asset)==='ADOPTED','MEDIA_NOT_ADOPTED','暂存文件不能进入业务导出',409);
 const r=(await tx.find('personMedia',{workspaceId:asset.workspaceId,assetId:asset.id,usageState:'ADOPTED'}))[0];
 if(!r)return transferAsset(asset);
 const u=(await tx.get('uploads',asset.uploadId))!;
 return TransferAssetSchema.parse({...transferAsset({...asset,sourceId:r.sourceId,personId:r.personId}),relation:{personId:r.personId,personRoleId:r.personRoleId,origin:r.importedOrigin??{workspaceId:u.workspaceId,principalKind:u.principalKind??'INTERNAL',membershipId:u.actorId,talentAccountId:u.talentAccountId??null,servicePrincipalId:u.servicePrincipalId??null,submissionId:u.submissionId??null,sourceId:u.sourceId}}});
}
