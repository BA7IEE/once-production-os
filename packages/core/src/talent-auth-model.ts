import type {Actor,Base} from './model.ts';
export type TalentIdentityKind='EMAIL'|'PHONE';
export type AuthPurpose='LOGIN'|'RECOVER';
export type DeliveryState='CREATED'|'QUEUED'|'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN'|'CONSUMED'|'EXPIRED';
export interface TalentAccount extends Base {identityKeyDigest:string;status:'ACTIVE'|'DISABLED'|'ERASED';sessionEpoch:number;}
export interface TalentIdentity extends Base {talentAccountId:string;kind:TalentIdentityKind;identityHash:string;encryptedValue:string|null;verifiedAt:string;}
export interface TalentSession extends Base {talentAccountId:string;tokenHash:string;sessionEpoch:number;recoveryEpoch:string;idleUntil:string;absoluteUntil:string;revokedAt:string|null;}
export interface TalentAuthContext extends Base {browserHash:string;purpose:AuthPurpose;recoveryEpoch:string;expiresAt:string;}
export interface TalentAuthChallenge extends Base {contextId:string;kind:TalentIdentityKind;identityHash:string;purpose:AuthPurpose;codeHash:string|null;state:DeliveryState;attempts:number;recoveryEpoch:string;expiresAt:string;consumedAt:string|null;}
export interface TalentAuthDelivery extends Base {challengeId:string;state:DeliveryState;encryptedPayload:string|null;providerRequestKey:string;expiresAt:string;}
export interface TalentAuthTables {talentAccounts:TalentAccount;talentIdentities:TalentIdentity;talentSessions:TalentSession;talentAuthContexts:TalentAuthContext;talentAuthChallenges:TalentAuthChallenge;talentAuthDeliveries:TalentAuthDelivery;}
export interface TalentActor {actorKind:'TALENT';workspaceId:string;talentAccountId:string;sessionId:string;sessionEpoch:number;}
export type CommandPrincipal=Actor|TalentActor;
export interface TalentAuthConfig {
 enabled:boolean;identityKey:Buffer;codeKey:Buffer;sessionKey:Buffer;messageKey:Buffer;csrfKey:Buffer;
 idleMs:number;absoluteMs:number;contextMs:number;challengeMs:number;maxAttempts:number;resendMs:number;
 identityHourly:number;identityDaily:number;ipHourly:number;workspaceHourly:number;workspaceDaily:number;
 providerType:'disabled'|'test'|'http';endpoint:string;credential:string;sender:string;template:string;timeoutMs:number;
}
export interface AuthProvider {send(input:{requestKey:string;kind:TalentIdentityKind;recipient:string;code:string;expiresAt:string}):Promise<'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN'>;}
