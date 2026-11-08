import {v,uuid,revision,dateIso,type Parsed} from './validation.ts';
export const HOMEPAGE_CONSENT_VERSION='once-public-homepage-v1';
const work=v.object({creditId:uuid,assetIds:v.array(uuid,8),externalUrl:v.string(2000)});
export const homepageDraftSchema=v.object({
 personRoleId:uuid,
 includeIntro:v.boolean(),
 cityCode:v.string(60),
 skillCodes:v.array(v.string(60,1),15),
 languageCodes:v.array(v.string(60,1),10),
 measurementFields:v.array(v.enum(['heightCm','bustCm','waistCm','hipsCm']),5),
 contactIds:v.array(uuid,5),
 coverAssetId:v.nullable(uuid),
 portfolioAssetId:v.nullable(uuid),
 works:v.array(work,12,1),
});
export type HomepageDraft=Parsed<typeof homepageDraftSchema>;
export const HomepageSchemas={
 save:v.object({expectedRevision:revision,draft:homepageDraftSchema}),
 create:v.object({personId:uuid,draft:homepageDraftSchema}),
 publish:v.object({expectedRevision:revision,previewDigest:v.string(64,64,/^[a-f0-9]{64}$/),expiresAt:dateIso,consentVersion:v.enum([HOMEPAGE_CONSENT_VERSION]),publicAccepted:v.boolean(),mediaRightsAccepted:v.boolean(),adultDeclared:v.boolean()}),
 unpublish:v.object({expectedRevision:revision}),
};
