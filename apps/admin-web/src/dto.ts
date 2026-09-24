// Explicit presentation DTOs. Never import Prisma models into the browser.
export interface Me {
    mediaEnabled?: boolean;
    membershipId: string;
    displayName: string;
    role: 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'VIEWER';
    permissions: string[];
    csrfToken: string;
    version: string;
}
export interface Page<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
}
export interface Receipt {
    operationId: string;
    resourceId: string;
    revision: number;
    state: 'SUCCEEDED' | 'ACCEPTED';
    replayed?: boolean;
}
export interface CatalogItem {
    id: string;
    namespace: 'role' | 'city' | 'language' | 'skill' | 'industry' | 'workType';
    code: string;
    labelZh: string;
    labelEn: string;
    status: 'ACTIVE' | 'INACTIVE';
    revision: number;
}
export interface Person {
    access?: {
        mode: 'NATIVE' | 'HANDOFF';
        canEdit: boolean;
        canReview: boolean;
        canReadSource: boolean;
        canReadContacts: boolean;
        canManageScope: boolean;
        canOffer: boolean;
    };
    id: string;
    displayName: string;
    aliases: string[];
    roles: string[];
    cityCode: string | null;
    languageCodes: string[];
    skillCodes: string[];
    heightCm: number | null;
    intro: string;
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    sourceId: string;
    scopeId: string;
    maintainerId: string;
    revision: number;
    createdAt: string;
    updatedAt: string;
    source?: {
        id: string;
        revision: number;
        title: string;
        basisMode: string;
        validUntil: string;
        status: string;
    };
    evidence?: {
        id: string;
        fieldPath: string;
        sourceId: string;
        state: 'VERIFIED' | 'STALE';
        reviewedAt: string;
    }[];
}
export interface Source {
    id: string;
    title: string;
    type: 'MANUAL' | 'TEXT';
    scopeId: string;
    maintainerId: string;
    status: string;
    basisMode: 'TEMP_ORGANIZE' | 'INTERNAL_USE';
    basisDescription: string;
    providerClaim: string;
    validUntil: string;
    revision: number;
    current: boolean;
    reviewedAt: string | null;
    textPayload?: string;
    textRestricted: boolean;
}
export interface SourceHistoryEntry {
    id: string;
    sourceRevision: number;
    action: string;
    actorId: string | null;
    recordedAt: string;
    decisionReason: string | null;
    baselineOnly: boolean;
    legacyBasisAmbiguous: boolean;
    snapshot: {
        title: string;
        basisDescription: string;
        textPayload: string;
        validUntil: string;
        status: string;
    };
}
export interface Contact {
    id: string;
    kind: 'PHONE' | 'WECHAT' | 'EMAIL' | 'OTHER';
    sourceId: string;
    value: string;
    maskedValue: string;
}
export interface Membership {
    id: string;
    displayName: string;
    loginName: string;
    role: Me['role'];
    extraPermissions: Array<'sensitive.read' | 'sensitive.write' | 'data.export' | 'data.delete'>;
    status: string;
    revision: number;
}
export interface Job {
    id: string;
    type: string;
    aggregateId: string;
    state: string;
    attempts: number;
    errorCode: string | null;
    revision: number;
    createdAt?: string;
    importedCount: number;
    selectedCount: number;
    canResume: boolean;
    resumeBlockedReason: string | null;
}
export interface ImportRow {
    index: number;
    displayName: string;
    roles: string[];
    cityCode: string | null;
    state: string;
    issues: string[];
    personId: string | null;
}
export interface ImportBatch {
    id: string;
    sourceId: string;
    revision: number;
    expiresAt: string;
    rows: ImportRow[];
    job: {
        id: string;
        state: string;
        errorCode: string | null;
    } | null;
}
export interface Audit {
    id: string;
    actorId: string | null;
    action: string;
    resourceKind: string;
    resourceId: string;
    changedFields: string[];
    at: string;
    requestId: string;
}
export interface Scope {
    id: string;
    name: string;
    mode: 'WORKSPACE' | 'RESTRICTED';
    revision: number;
}
export interface Handoff {
    id: string;
    counterpart: string;
    revision: number;
    purpose: 'EDIT' | 'REVIEW';
    state: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';
    effectiveState: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED' | 'INVALIDATED';
    direction: 'SENT' | 'RECEIVED';
    person: {
        id: string;
        displayName: string;
    } | null;
    expiresAt: string;
    createdAt: string;
    acceptedAt: string | null;
    closedAt: string | null;
    canAccept: boolean;
    canDecline: boolean;
    canRevoke: boolean;
}
export interface HandoffRecipient {
    membershipId: string;
    displayName: string;
}
