import {workDecisionSchema} from './work-case-schema.ts';
import {v,uuid,revision,type Parsed} from './validation.ts';
export const MAINTENANCE_VERSION='once-talent-text-v1';
export const CONSENT_VERSION='internal-directory-2026-10-v1';
export const TEXT_FIELDS=['displayName','aliases','intro'] as const;
const field=v.enum(TEXT_FIELDS),relation=v.enum(['SELF','GUARDIAN','AGENT'] as const);
// Typed text payload. Other professional facts remain in TD2; this is a submission, never a second Person.
export const TextItemSchema=v.object({clientItemKey:v.string(64,1,/^[A-Za-z0-9_-]+$/),field, text:v.optional(v.string(5000)),aliases:v.optional(v.array(v.string(120,1),20)),dependencyGroup:v.string(64,1,/^[A-Za-z0-9_-]+$/),dependsOn:v.array(v.string(64,1),20)});
export type TextItem=Parsed<typeof TextItemSchema>;
export const MaintenanceSchemas={
 invitation:v.object({purpose:v.enum(['CLAIM','ENROLL'] as const),targetPersonId:v.optional(uuid),scopeId:uuid,recipientKind:v.optional(v.enum(['EMAIL','PHONE'] as const)),recipient:v.optional(v.string(320,3)),maxUses:v.optional(v.number(1,1000)),exposureFields:v.array(field,3)}),
 revision:v.object({expectedRevision:revision}),
 exchange:v.object({invitationId:uuid,token:v.string(43,43,/^[A-Za-z0-9_-]+$/)}),
 claim:v.object({contextId:uuid,relation,applicantKey:v.string(64,1,/^[A-Za-z0-9_-]+$/),adultDeclared:v.boolean()}),
 renew:v.object({expectedRevision:revision,contextId:uuid}),
 decideClaim:v.object({expectedRevision:revision,decision:v.enum(['APPROVE','REJECT'] as const),ownershipBasis:v.string(2000,4),guardianConfirmed:v.boolean()}),
 createDraft:v.object({schemaVersion:v.enum([MAINTENANCE_VERSION]),claimId:v.optional(uuid),grantId:v.optional(uuid),consentTextVersion:v.enum([CONSENT_VERSION]),consentAccepted:v.boolean(),items:v.array(TextItemSchema,3)}),
 saveDraft:v.object({expectedRevision:revision,items:v.array(TextItemSchema,3)}),
 review:v.object({expectedRevision:revision,workDecisions:v.optional(v.array(workDecisionSchema,10)),acceptedKeys:v.array(v.string(64,1),123),publicReason:v.string(500),targetPersonId:v.optional(uuid),createPerson:v.optional(v.boolean()),ownershipBasis:v.optional(v.string(2000,4)),guardianConfirmed:v.optional(v.boolean())}),
};
