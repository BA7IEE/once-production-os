import {AppError} from './errors.ts';
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
export interface StoredSubmission extends Base {
 principalKind?:'TALENT'|'MACHINE';
 servicePrincipalId?:string|null;
 externalSubmissionKey?:string|null;
 proposedPersonId?:string|null;
 proposedTargetBaseline?:Record<string,unknown>|null;
 servicePrincipalAuthorizationEpoch?:number|null;
 intakeScopeRevision?:number|null;
 maintainerId?:string|null;
 sourceDeclaration?:Record<string,unknown>|null;
 reviewTargetDecision?:string|null;
 talentAccountId:string|null;
 personId:string|null;
 claimId:string|null;
 grantId:string|null;
 consentId:string|null;
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
export interface TalentSubmission extends StoredSubmission {talentAccountId:string;consentId:string;principalKind?:'TALENT';}
export interface MachineSubmission extends StoredSubmission {principalKind:'MACHINE';talentAccountId:null;consentId:null;claimId:null;grantId:null;servicePrincipalId:string;externalSubmissionKey:string;servicePrincipalAuthorizationEpoch:number;intakeScopeRevision:number;maintainerId:string;sourceDeclaration:Record<string,unknown>;}
export function talentSubmission(row:StoredSubmission):TalentSubmission {if(row.principalKind==='MACHINE'||!row.talentAccountId||!row.consentId)throw new AppError(404,'NOT_FOUND','内容不可访问');return row as TalentSubmission;}
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
 principalKind?:'TALENT'|'MACHINE';
 servicePrincipalId?:string|null;
 sourceId:string;
 submissionId:string|null;
 talentAccountId:string|null;
 consentId:string|null;
 reviewerId:string;
 materialDescription:string;
 importedBasis?:Record<string,unknown>|null;
}
export interface SourceUseBasis extends Base {
 basisKind?:'TALENT_CONSENT'|'INTERNAL_REVIEW';
 submissionId?:string|null;
 sourceAttributionId?:string|null;
 servicePrincipalId?:string|null;
 reviewerId?:string|null;
 reviewBasis?:string|null;
 sourceId:string;
 consentId:string|null;
 consentRevision:number|null;
 purpose:string;
 fieldScope:string[];
 state:string;
 validUntil:string;
 importedBasis?:Record<string,unknown>|null;
}
export interface Exposure {consentId?:string;kind:string;targetId:string;field:string;valueDigest:string;sourceId:string;sourceRevision:number;approvedById?:string;approvedAt?:string;approvalBasis?:string;}
export interface TalentMaintenanceTables {
talentInvitations:TalentInvitation;
talentInvitationContexts:TalentInvitationContext;
talentClaims:TalentClaim;
talentAccessGrants:TalentAccessGrant;
talentConsents:TalentConsent;
talentSubmissions:StoredSubmission;
talentSubmissionItems:TalentSubmissionItem;
sourceAttributions:SourceAttribution;
sourceUseBases:SourceUseBasis;
}
