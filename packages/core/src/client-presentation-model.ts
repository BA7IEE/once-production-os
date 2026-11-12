import type {Base} from './model.ts';
export interface ClientPresentation extends Base {scopeId:string;maintainerId:string;state:'ACTIVE'|'REVOKED'}
export interface ClientDependencyManifest {
 sources:Array<{id:string;revision:number}>;
 people:Array<{id:string;personRoleId:string;roleCode:string;itemId:string;workId:string|null}>;
 works:string[];projects:string[];
 assets:Array<{id:string;sha256:string;previewHash:string;objectToken:string;workId:string;workAssetId:string}>;
}
export interface ClientPublicEntry {id:string;displayName:string;roleLabel:string;intro:string;recommendation:string;conditions:string;workTitle:string|null;media:Array<{id:string;mime:string}>}
export interface ClientPresentationPayload {schemaVersion:'once-client-presentation-v1';purpose:'CLIENT_PRESENTATION';title:string;entries:ClientPublicEntry[];approvalNote:string;dependencies:ClientDependencyManifest}
export interface ClientVersion extends Base {
 presentationId:string;versionNumber:number;publisherId:string;publisherUserEpoch:number;recoveryEpoch:string;expiresAt:string;state:'PUBLISHED'|'REVOKED'|'ERASED';
 approvalSourceId:string;approvalSourceRevision:number;approvedAt:string;contentCiphertext:string|null;manifestDigest:string;dependencies:ClientDependencyManifest;
 entryIds:string[];personIds:string[];sourceIds:string[];workIds:string[];projectIds:string[];assetIds:string[];
}
export interface ClientRecipient extends Base {versionId:string;createdById:string;labelCiphertext:string|null;tokenHash:string|null;tokenVersion:number;recoveryEpoch:string;expiresAt:string;state:'ACTIVE'|'REVOKED'}
export interface ClientGuestSession extends Base {recipientId:string;versionId:string;tokenHash:string;tokenVersion:number;recoveryEpoch:string;expiresAt:string;revokedAt:string|null}
export interface ClientFeedback extends Base {recipientId:string;versionId:string;guestSessionId:string;entryId:string;commandKey:string;requestDigest:string;sequenceNumber:number;choice:'INTERESTED'|'PENDING'|'PASS';noteCiphertext:string|null;state:'ACTIVE'|'ERASED'}
export interface ClientPresentationTables {clientPresentations:ClientPresentation;clientVersions:ClientVersion;clientRecipients:ClientRecipient;clientGuestSessions:ClientGuestSession;clientFeedback:ClientFeedback}
