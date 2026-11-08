/** Exact internal surface for the current implemented slice. Extend only with a reviewed
 * route contract in its work package; a new path does not imply its release gate is open. */
export const EXPERIENCE_INTERNAL_ROUTES = new Set(['/source-reviews/{id}/publish','/portal/commands/{id}','/ingestion/uploads','/ingestion/uploads/{id}/receive-authorizations','/ingestion/uploads/{id}/content','/ingestion/uploads/{id}/complete','/ingestion/uploads/{id}/cancel','/ingestion/uploads/{id}/status','/ingestion/submissions/{id}/assets/{asset}/preview','/ingestion/submissions/{id}/assets/{asset}/playback','/ingestion/submissions/{id}/assets/{asset}/attachment','/talent-grants/{id}/media-exposure','/talent-invitations','/talent-invitations','/talent-invitations/{id}/issue','/talent-invitations/{id}/revoke','/talent-claims','/talent-claims/{id}/decide','/talent-grants/{id}/revoke','/talent-submissions','/talent-submissions/{id}','/talent-submissions/{id}/decide','/portal/invitations/exchange','/portal/invitations/{id}','/portal/claims','/portal/claims','/portal/claims/{id}/renew-admission','/portal/profiles','/portal/profiles/{id}','/portal/submissions','/portal/submissions','/portal/submissions/{id}','/portal/submissions/{id}','/portal/submissions/{id}/submit','/portal/submissions/{id}/withdraw','/portal/submissions/{id}/fork','/portal/consents/{id}/revoke','/directory/talents','/directory/talents/{id}','/directory/talents/search','/portal/auth/context','/portal/auth/contexts/{id}','/portal/auth/challenges','/portal/auth/verify','/portal/me','/portal/auth/logout','/portal/auth/revoke-other-sessions','/talent-accounts/{id}/disable','/talent-accounts/{id}/erase']);
// Supplier-library V1 routes implement owned drafts, local extraction and explicit
// self confirmation. Client publishing/transactions remain outside this work package.
for(const path of ['/portal/profile-schema','/portal/supplier-profiles/{id}','/portal/profile-drafts','/portal/profile-drafts/{id}',
 '/portal/profile-drafts/{id}/rebase','/portal/profile-drafts/{id}/confirm','/portal/profile-drafts/{id}/documents',
 '/portal/profile-drafts/{id}/documents/apply','/portal/profile-drafts/{id}/documents/cancel','/portal/profile-drafts/{id}/documents/images','/portal/profile-drafts/{id}/documents/work','/portal/profile-drafts/{id}/documents/work-group','/portal/profile-drafts/{id}/documents/batch'])EXPERIENCE_INTERNAL_ROUTES.add(path);
// Field catalog publication activates an internal, immutable schema version.
// It is distinct from publishing supplier records to clients or public channels.
for(const path of ['/supplier-field-schema','/supplier-field-catalog','/supplier-field-catalog/{id}',
 '/supplier-field-catalog/{id}/publish','/people/{id}/professional'])EXPERIENCE_INTERNAL_ROUTES.add(path);
export function unsupportedExperienceSurfaces(paths) {
 return paths.filter(path => (/(?:publish|anqicms|share|quote|ai\/)/.test(path) || /^\/(client|directory|portal|casting|ingestion|talent-invitations|talent-claims|talent-submissions|casting-shares|talent-publications)(\/|$)/.test(path)) && !EXPERIENCE_INTERNAL_ROUTES.has(path.replace(/^\/api\/v1(?=\/)/,'')));
}
export function forbiddenNonGoalSurfaces(paths) {
 return paths.filter(path => /(?:^|\/)(invoice|payment|booking|crm|seo|geo)(?:\/|$)/.test(path));
}

// P06: explicitly reviewed client-purpose snapshot/recipient/feedback routes.
for(const path of ['/shortlists/{id}/presentations','/shortlists/{id}/presentations/recipients/issue','/shortlists/{id}/presentations/revoke','/client/exchange','/client/me','/client/presentations/{id}','/client/feedback','/client/logout','/client/presentations/{id}/media/{asset}/preview','/client/presentations/{id}/media/{asset}/attachment','/client/presentations/{id}/media/{asset}/playback'])EXPERIENCE_INTERNAL_ROUTES.add(path);

EXPERIENCE_INTERNAL_ROUTES.add('/shortlists/{id}/presentations/feedback');

EXPERIENCE_INTERNAL_ROUTES.add('/client/feedback/inspect');
