import { v, uuid, revision, dateIso, type Parsed } from './validation.ts';
import { MEDIA_LIMITS as L, type MediaAsset } from './media-model.ts';
export const MEDIA_TRANSFER_CODE = 'media.originals' as const;
export const TransferAssetSchema = v.object({
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
