/** Exact internal surface for the current implemented slice. Extend only with a reviewed
 * route contract in its work package; a new path does not imply its release gate is open. */
export const EXPERIENCE_INTERNAL_ROUTES = new Set(['/directory/talents','/directory/talents/{id}','/directory/talents/search','/portal/auth/context','/portal/auth/contexts/{id}','/portal/auth/challenges','/portal/auth/verify','/portal/me','/portal/auth/logout','/portal/auth/revoke-other-sessions','/talent-accounts/{id}/disable','/talent-accounts/{id}/erase']);
export function unsupportedExperienceSurfaces(paths) {
 return paths.filter(path => (/(?:publish|anqicms|share|quote|ai\/)/.test(path) || /^\/(directory|portal|casting|ingestion|talent-invitations|talent-claims|talent-submissions|casting-shares|talent-publications)(\/|$)/.test(path)) && !EXPERIENCE_INTERNAL_ROUTES.has(path));
}
export function forbiddenNonGoalSurfaces(paths) {
 return paths.filter(path => /(?:^|\/)(invoice|payment|booking|crm|seo|geo)(?:\/|$)/.test(path));
}
