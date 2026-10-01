import type {Base} from './model.ts';
export interface TalentInvitation extends Base {
 purpose:string;
 targetPersonId:string|null;
 scopeId:string;
 maintainerId:string;
 recipientHash:string|null;
 recipientKind:string|null;
 state:string;
 tokenHash:string|null;
 secretVersion:number;
 expiresAt:string;
 maxUses:number;
 usedCount:number;
 reservedCount:number;
 recoveryEpoch:string;
 exposureFields:string[];
}
export interface TalentInvitationContext extends Base {
 invitationId:string;
 browserHash:string;
 secretVersion:number;
 recoveryEpoch:string;
 expiresAt:string;
}
export interface TalentClaim extends Base {
 invitationId:string;
 talentAccountId:string;
 targetPersonId:string|null;
 scopeId:string;
 kind:string;
 relation:string;
 applicantKey:string;
 state:string;
 admissionUntil:string;
 reserved:boolean;
 adultDeclared:boolean;
 ownershipBasis:string;
 recoveryEpoch:string;
 decidedById:string|null;
 decidedAt:string|null;
}
export interface TalentAccessGrant extends Base {
 talentAccountId:string;
 personId:string;
 claimId:string;
 relation:string;
 state:string;
 actions:string[];
 authorizationEpoch:number;
 selfExposureManifest:Exposure[];
 approvedById:string;
 approvalBasis:string;
 recoveryEpoch:string;
}
export interface TalentConsent extends Base {
 talentAccountId:string;
 personId:string|null;
 claimId:string|null;
 purpose:string;
 textVersion:string;
 fieldScope:string[];
 state:string;
 validUntil:string;
 revokedAt:string|null;
}
export interface TalentSubmission extends Base {
 talentAccountId:string;
 personId:string|null;
 claimId:string|null;
 grantId:string|null;
 consentId:string;
 scopeId:string;
 schemaVersion:string;
 state:string;
 payloadDigest:string|null;
 forkedFromId:string|null;
 expiresAt:string;
 submittedAt:string|null;
 decidedAt:string|null;
 decidedById:string|null;
 publicReason:string;
 protectionEpoch:number;
 recoveryEpoch:string;
}
export interface TalentSubmissionItem extends Base {
 submissionId:string;
 clientItemKey:string;
 kind:string;
 targetId:string|null;
 values:Record<string,unknown>;
 baseline:Record<string,unknown>;
 dependencyGroup:string;
 dependsOn:string[];
 state:string;
 appliedId:string|null;
}
export interface SourceAttribution extends Base {
 sourceId:string;
 submissionId:string|null;
 talentAccountId:string|null;
 consentId:string|null;
 reviewerId:string;
 materialDescription:string;
 importedBasis?:Record<string,unknown>|null;
}
export interface SourceUseBasis extends Base {
 sourceId:string;
 consentId:string|null;
 consentRevision:number;
 purpose:string;
 fieldScope:string[];
 state:string;
 validUntil:string;
 importedBasis?:Record<string,unknown>|null;
}
export interface Exposure {kind:string;targetId:string;field:string;valueDigest:string;sourceId:string;sourceRevision:number;}
export interface TalentMaintenanceTables {
talentInvitations:TalentInvitation;
talentInvitationContexts:TalentInvitationContext;
talentClaims:TalentClaim;
talentAccessGrants:TalentAccessGrant;
talentConsents:TalentConsent;
talentSubmissions:TalentSubmission;
talentSubmissionItems:TalentSubmissionItem;
sourceAttributions:SourceAttribution;
sourceUseBases:SourceUseBasis;
}
