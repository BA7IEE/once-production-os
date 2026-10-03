import type {MediaPurgeIntent} from './media-purge-model.ts';
import type {TalentMaintenanceTables} from './talent-maintenance-model.ts';
import type {TalentAuthTables,TalentAuthConfig} from './talent-auth-model.ts';
import type {Brand,ProjectParty} from './project-parties.ts';
import type {AiResponseMetadata} from './ai-dispatch.ts';
import type {AiConnection} from './ai-connection.ts';
import type {AiApproval,AiBudgetRelease,AiReconciliation} from './ai-operations.ts';
import type {AiGrant,AiTask,AiDependency} from './ai-business-model.ts';
import type {AiLedgerConfig} from './ai-ledger-model.ts';
import type {AiBudget,AiRun,AiAttempt} from './ai-ledger-model.ts';
import type {LocaleText,LocaleDependency} from './locale-model.ts';
import type {MergeHistoryErasure} from './merge-history-erasure-model.ts';
import type { TalentV2Tables, TalentOwnerRefs } from './talent-v2-model.ts';
import type { Work, WorkAsset, WorkCredit, Project, ProjectParticipant, ProjectWork } from './production-model.ts';
import type { Shortlist, ShortlistItem, ShortlistItemAsset } from './shortlist-model.ts';
import type { MediaUpload, MediaAsset, PersonMedia } from './media-model.ts';
import type { UsePermission, ExportJob, ExportDependency } from './export-model.ts';
import type { DeletionRequest, DeletionItem } from './deletion-model.ts';
import type { PersonMergeDecision, PersonAlias } from './merge-model.ts';
import type { RecoveryRun } from './recovery-model.ts';
export type Role = 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'VIEWER';
export const EXTRA_PERMISSIONS = ['sensitive.read', 'sensitive.write', 'data.export', 'data.delete', 'data.merge', 'ai.use', 'talent.invite', 'talent.review'] as const;
export type ExtraPermission = typeof EXTRA_PERMISSIONS[number];
export type IngestionPermission = 'ingestion.schema.read'|'ingestion.submit'|'ingestion.read.own'|'ingestion.withdraw.own'|'ingestion.media.upload';
export type Permission = IngestionPermission | 'records.read' | 'records.write' | 'sources.read' | 'sources.write' | 'sources.review' | 'catalog.manage' | 'members.manage' | 'audit.read' | 'assets.read' | 'assets.upload' | 'talent.propose' | 'talent.fact.write' | ExtraPermission;
export interface Base {
    id: string;
    workspaceId: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
}
export interface Workspace {
    id: string;
    name: string;
    createdAt: string;
    recoveryEpoch: string;
}
export interface User extends Base {
    loginName: string;
    displayName: string;
    passwordHash: string | null;
    status: 'PENDING' | 'ACTIVE' | 'DISABLED';
    sessionEpoch: number;
}
export interface Membership extends Base {
    userId: string;
    role: Role;
    extraPermissions: ExtraPermission[];
    status: 'ACTIVE' | 'DISABLED';
}
export interface Session extends Base {
    membershipId: string;
    tokenHash: string;
    userEpoch: number;
    recoveryEpoch: string;
    idleUntil: string;
    absoluteUntil: string;
    revokedAt: string | null;
}
export interface Activation extends Base {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    consumedAt: string | null;
}
export interface Scope extends Base {
    name: string;
    mode: 'WORKSPACE' | 'RESTRICTED';
}
export interface ScopeMember extends Base {
    scopeId: string;
    membershipId: string;
}
export interface Source extends Base {
    internalUseUntil?:string|null;
    scopeId: string;
    maintainerId: string;
    title: string;
    type: 'MANUAL' | 'TEXT';
    providerClaim: string;
    textPayload: string;
    basisMode: 'TEMP_ORGANIZE' | 'INTERNAL_USE';
    basisDescription: string;
    validFrom: string;
    validUntil: string;
    status: 'RECEIVED' | 'CONFIRMED' | 'SUSPENDED' | 'ERASED';
    protectionEpoch: number;
    reviewedBy: string | null;
    reviewedAt: string | null;
}
/** Immutable source state + decision, separate from the mutable Source record.
 * BASELINE preserves only the state observed during migration, not an invented history. */
export interface SourceHistory extends Base {
    sourceId: string;
    sourceRevision: number;
    scopeId: string;
    actorId: string | null;
    action: 'CREATED' | 'EDITED' | 'REVIEWED' | 'SUSPENDED' | 'SCOPE_CHANGED' | 'DELETION_BLOCKED' | 'BASELINE';
    decisionReason: string | null;
    baselineOnly: boolean;
    basisAmbiguous: boolean;
    snapshot: Source | { id: string; workspaceId: string; revision: number; scopeId: string; erased: true };
}
export interface Person extends Base {
    scopeId: string;
    sourceId: string;
    maintainerId: string;
    displayName: string;
    aliases: string[];
    roles: string[];
    cityCode: string | null;
    languageCodes: string[];
    skillCodes: string[];
    heightCm: number | null;
    intro: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'ERASED';
    protectionEpoch: number;
}
export interface Contact extends Base {
    personId: string;
    sourceId: string;
    kind: 'PHONE' | 'WECHAT' | 'EMAIL' | 'OTHER';
    ciphertext: string;
    maskedValue: string;
}
export interface FieldEvidence extends Base, Partial<TalentOwnerRefs> {
    // Historical review attribution is not a membership or approval in the target workspace.
    originalReviewWorkspaceId?: string | null;
    originalReviewMembershipId?: string | null;
    originalReviewedAt?: string | null;
    personId: string | null;
    fieldPath: string;
    valueDigest: string;
    sourceId: string;
    sourceRevision: number;
    reviewerId: string | null;
    reviewedAt: string | null;
}
export interface DictionaryItem extends Base {
    namespace: 'role' | 'city' | 'language' | 'skill' | 'industry' | 'workType' | 'nationality' | 'roleStyle' | 'roleService';
    code: string;
    labelZh: string;
    labelEn: string;
    status: 'ACTIVE' | 'INACTIVE';
}
export interface CommandReceipt extends Base {
    principalKind?: 'INTERNAL'|'MACHINE'|'TALENT';
    talentAccountId?:string|null;
    servicePrincipalId?: string | null;
    actorId: string | null;
    operation: string;
    commandKey: string;
    requestDigest: string;
    resourceKind: 'sourceReview' | 'mediaPurge' | 'talentInvitation' | 'talentClaim' | 'talentGrant' | 'talentSubmission' | 'talentConsent' | 'talentAccount' | 'brand' | 'aiConnectionTest' | 'aiConnection' | 'aiApproval' | 'aiAttempt' | 'aiBudget' | 'aiTask' | 'aiGrant' | 'localeText' | 'talentMigrationReview' | 'talentFact' | 'fieldProposal' | 'servicePrincipal' | 'organization' | 'capabilityDefinition' | 'person' | 'source' | 'scope' | 'membership' | 'catalog' | 'import' | 'job' | 'handoff' | 'upload' | 'asset' | 'work' | 'project' | 'shortlist' | 'usePermission' | 'export' | 'deletion' | 'merge';
    resourceId: string;
    result: ReceiptResult;
}
export interface ReceiptResult {
    operationId: string;
    resourceId: string;
    revision: number;
    state: 'SUCCEEDED' | 'ACCEPTED';
    replayed?: boolean;
}
export interface AuditEvent extends Base {
    principalKind?: 'INTERNAL'|'MACHINE'|'TALENT'|'SYSTEM';
    talentAccountId?:string|null;
    servicePrincipalId?: string | null;
    actorId: string | null;
    action: string;
    resourceKind: string;
    resourceId: string;
    changedFields: string[];
    requestId: string;
}
export interface RateBucket {
    id: string;
    workspaceId: string;
    count: number;
    until: string;
}
export interface ImportBatch extends Base {
    formatVersion?: 1 | 2;
    actorId: string;
    sourceId: string;
    sourceRevision: number;
    scopeId: string;
    rows: ImportRow[];
    expiresAt: string;
}
export interface ImportRow {
    kind?: 'TALENT' | 'CONTACT';
    index: number;
    displayName: string;
    roles: string[];
    cityCode: string | null;
    state: 'VALID' | 'INVALID' | 'IMPORTED' | 'FAILED';
    issues: string[];
    personId: string | null;
}
export interface DurableJob extends Base {
    type: 'IMPORT_PEOPLE' | 'IMPORT_TALENTS_V2';
    actorId: string;
    aggregateId: string;
    selectedRows: number[];
    state: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
    leaseToken: string | null;
    leaseUntil: string | null;
    attempts: number;
    errorCode: string | null;
}
/** A purpose-limited invitation for ONE person's basic profile. No scope membership is granted. */
export interface RecordHandoff extends Base {
    personId: string;
    sourceId: string;
    senderId: string;
    recipientId: string;
    senderRevision: number;
    recipientRevision: number;
    personRevision: number;
    sourceRevision: number;
    personEpoch: number;
    sourceEpoch: number;
    personScopeId: string;
    sourceScopeId: string;
    personScopeRevision: number;
    sourceScopeRevision: number;
    purpose: 'EDIT' | 'REVIEW';
    state: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
    expiresAt: string;
    acceptedAt: string | null;
    closedAt: string | null;
    closedById: string | null;
}
import type {SourceReviewRequest} from './source-review.ts';
export interface TableMap extends TalentV2Tables, TalentAuthTables, TalentMaintenanceTables {
    mediaPurgeIntents:MediaPurgeIntent;
    brands:Brand;projectParties:ProjectParty;
    aiResponseMetadata: AiResponseMetadata;
    aiConnections: AiConnection;
    aiGrants: AiGrant;
    aiReconciliations: AiReconciliation;
    aiBudgetReleases: AiBudgetRelease;
    aiApprovals: AiApproval;
    aiTasks: AiTask;
    aiDependencies: AiDependency;
    aiBudgets: AiBudget;
    aiRuns: AiRun;
    aiAttempts: AiAttempt;
    localeTexts: LocaleText;
    localeDependencies: LocaleDependency;
    recoveryRuns: RecoveryRun;
    mergeHistoryErasures: MergeHistoryErasure;
    personMerges: PersonMergeDecision;
    personAliases: PersonAlias;
    deletionRequests: DeletionRequest;
    deletionItems: DeletionItem;
    usePermissions: UsePermission;
    exports: ExportJob;
    exportDependencies: ExportDependency;
    shortlists: Shortlist;
    shortlistItems: ShortlistItem;
    shortlistItemAssets: ShortlistItemAsset;
    works: Work;
    workAssets: WorkAsset;
    workCredits: WorkCredit;
    projects: Project;
    projectParticipants: ProjectParticipant;
    projectWorks: ProjectWork;
    uploads: MediaUpload;
    assets: MediaAsset;
    personMedia: PersonMedia;
    workspaces: Workspace;
    users: User;
    memberships: Membership;
    sessions: Session;
    activations: Activation;
    scopes: Scope;
    scopeMembers: ScopeMember;
    sources: Source;
    sourceHistory: SourceHistory;
    people: Person;
    contacts: Contact;
    evidence: FieldEvidence;
    dictionary: DictionaryItem;
    receipts: CommandReceipt;
    audits: AuditEvent;
    rateBuckets: RateBucket;
    imports: ImportBatch;
    jobs: DurableJob;
    handoffs: RecordHandoff;
    sourceReviews: SourceReviewRequest;
}
export type Table = keyof TableMap;
export interface Actor {
    actorKind?: 'HUMAN' | 'MACHINE';
    servicePrincipalId?: string;
    machineScopeId?: string;
    userId: string;
    membershipId: string;
    workspaceId: string;
    role: Role;
    permissions: Permission[];
    displayName: string;
    userEpoch: number;
    sessionId: string;
}
export interface RequestMeta {
    requestId: string;
    ip: string;
}
export interface Clock {
    now(): Date;
}
export interface Config {
    ingestionEnabled?:boolean;
    agentMediaEnabled?:boolean;
    agentMediaAdmission?: import('./agent-media.ts').AgentMediaAdmission;
    talentAuth?: TalentAuthConfig;
    ai?: AiLedgerConfig;
    mediaRetention?: import('./media-retention.ts').MediaRetention;
    mediaAdmission?: import('./media-model.ts').MediaAdmission;
    mediaEnabled?: boolean;
    mediaPlayback?: import('./media-playback.ts').MediaPlaybackLimits;
    origin: string;
    secureCookies: boolean;
    contactKey: Buffer;
    csrfKey: Buffer;
    recoveryEpoch: string;
    accessMode: 'MAINTENANCE' | 'INTERNAL';
    environment: 'local' | 'test' | 'staging' | 'production';
    dataEgressMode: 'DISABLED' | 'INTERNAL_APPROVED';
    dataCleanupMode: 'DISABLED' | 'INTERNAL_APPROVED';
    dataMergeMode: 'DISABLED' | 'INTERNAL_APPROVED';
}
export const LIMITS = Object.freeze({ idleMs: 30 * 60000, absoluteMs: 12 * 60 * 60000,
    activationMs: 24 * 60 * 60000, temporaryMs: 7 * 24 * 60 * 60000, pageSize: 20, maxPageSize: 100,
    importRows: 100, importMs: 24 * 60 * 60000, jobLeaseMs: 30000, jobMaxAttempts: 3, handoffMs: 7 * 24 * 60 * 60000, maxOpenHandoffs: 100 });
