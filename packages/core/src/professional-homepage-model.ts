import type {Base} from './model.ts';
import type {Exposure} from './talent-maintenance-model.ts';

export interface ProfessionalHomepage extends Base {
 personId:string;
 talentAccountId:string;
 /** Original grant retained as provenance; each publication pins its current grant. */
 grantId:string;
 slug:string;
 state:'DRAFT'|'PUBLISHED'|'UNPUBLISHED'|'ERASED';
 draftCiphertext:string|null;
 currentVersionId:string|null;
 sourceIds:string[];
 workIds:string[];
 assetIds:string[];
}
export interface HomepageDependencies {
 grantId:string;
 grantEpoch:number;
 protectionEpoch:number;
 exposures:Exposure[];
 sources:Array<{id:string;revision:number}>;
 credits:Array<{id:string;workId:string;personRoleId:string;roleCode:string;sourceId:string;noteDigest:string}>;
 assets:Array<{key:string;id:string;workId:string|null;workAssetId:string|null;sha256:string|null;objectToken:string|null;previewHash:string|null}>;
}
export interface HomepageVersion extends Base {
 homepageId:string;
 versionNumber:number;
 talentAccountId:string;
 sessionEpoch:number;
 recoveryEpoch:string;
 consentId:string;
 expiresAt:string;
 state:'PUBLISHED'|'REVOKED'|'ERASED';
 contentCiphertext:string|null;
 contentDigest:string;
 dependencies:HomepageDependencies;
}
export interface ProfessionalHomepageTables {
 professionalHomepages:ProfessionalHomepage;
 homepageVersions:HomepageVersion;
}
/** Public types deliberately contain no database IDs, filenames, internal rates or provenance. */
export interface HomepageMedia {key:string;mime:string;url:string;}
export interface HomepageContent {
 displayName:string;
 role:string;
 city:string;
 intro:string;
 skills:string[];
 languages:string[];
 measurements:Array<{label:string;value:string}>;
 contacts:Array<{kind:string;value:string}>;
 cover:HomepageMedia|null;
 portfolio:HomepageMedia|null;
 works:Array<{title:string;description:string;responsibility:string;date:string;brand:string;media:HomepageMedia[];externalUrl:string}>;
}
