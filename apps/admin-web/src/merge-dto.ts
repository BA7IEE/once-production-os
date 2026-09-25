export type PersonMergeField = 'displayName' | 'aliases' | 'roles' | 'cityCode' | 'languageCodes' | 'skillCodes' | 'heightCm' | 'intro';
export type PersonMergeFieldChoice = 'CANONICAL' | 'DUPLICATE' | 'UNION';
export type PersonMergeCollisionChoice = 'KEEP_CANONICAL' | 'KEEP_DUPLICATE';

export interface PersonMergePreview {
    canonical: { id: string; displayName: string; sourceId: string; scopeId: string; revision: number };
    duplicate: { id: string; displayName: string; sourceId: string; scopeId: string; revision: number };
    fieldConflicts: Array<{
        field: PersonMergeField;
        canonicalValue: unknown;
        duplicateValue: unknown;
        choices: PersonMergeFieldChoice[];
    }>;
    collisions: Array<{
        id: string;
        kind: 'WORK_CREDIT' | 'PROJECT_PARTICIPANT' | 'SHORTLIST_ITEM';
        rootId: string;
        rootLabel: string;
        canonicalEntryId: string;
        duplicateEntryId: string;
        canonicalValue: unknown;
        duplicateValue: unknown;
    }>;
    blockers: Array<{ code: string; count: number }>;
    complete: boolean;
    revocations: { handoffs: number; usePermissions: number | null };
    contactsToReencrypt: number | null;
    media: { uploadsToDetach: number; assetsToReassign: number; assetsToDetach: number };
    moves: { workCredits: number; projectParticipants: number; shortlistItems: number };
    previewDigest: string;
}
