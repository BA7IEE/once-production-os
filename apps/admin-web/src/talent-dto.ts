/** Only the permission-filtered talent projection, never database rows or credential ciphertext. */
export const TALENT_VERSION = 'once-talent-v2.0.0' as const;
export type TalentFactKind = 'talentProfiles' | 'personRoles' | 'personCapabilities' | 'personLanguages' | 'talentLocations' | 'castingProfiles' | 'measurementSets' | 'adultEligibilities' | 'representations' | 'personExternalRefs' | 'personCredentials' | 'translatorLanguagePairs' | 'translatorServiceModes' | 'mediaCollections' | 'mediaCollectionTags';
export interface TalentFact {
    id: string; personId: string; sourceId: string; revision: number;
    createdAt: string; updatedAt: string; unavailableFields: string[]; usable: boolean;
    [key: string]: unknown;
}
export interface TalentDetail {
    id: string; displayName: string; intro: string; aliases: string[]; revision: number;
    originSourceId: string; originAvailable: boolean; scopeId: string; status: string;
    isTalent: boolean; canEdit: boolean; adultState: string;
    facts: Record<TalentFactKind, TalentFact[]>;
}
export interface TalentSchema {
    schemaVersion: typeof TALENT_VERSION;
    capabilities: Array<{id:string;code:string;labelZh:string;applicableRoleCodes:string[];levelSchemeCode:string|null}>;
}
export interface TalentEvidenceRecord {
    id: string; createdAt: string; fieldPath: string; valueMatchesCurrent: boolean; supportsCurrentValue: boolean;
    source: { id: string; title: string; recordedRevision: number; currentRevision: number; current: boolean; revisionMatches: boolean };
    review: { origin: 'ORIGINAL' | 'CURRENT'; workspaceId: string; membershipId?: string | null; reviewedAt?: string | null } | null;
}
export interface HeightMigrationReviews {
    personId:string; personRevision:number; sourceRevision:number; legacyHeightCm:number|null; canDismiss:boolean;
    items:Array<{id:string;revision:number;state:'PENDING'|'RESOLVED';resolvedAt:string|null}>;
    total:number;page:number;pageSize:number;
}
