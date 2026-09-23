// Explicit presentation DTOs. Never import Prisma models into the browser.
export interface Me {
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
    namespace: 'role' | 'city' | 'language' | 'skill';
    code: string;
    labelZh: string;
    labelEn: string;
    status: 'ACTIVE' | 'INACTIVE';
    revision: number;
}
export interface Person {
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
    extraPermissions: Array<'sensitive.read' | 'sensitive.write'>;
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
