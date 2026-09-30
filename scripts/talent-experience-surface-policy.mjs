/** Exact internal surface for the current implemented slice. Extend only with a reviewed
 * route contract in its work package; a new path does not imply its release gate is open. */
export const EXPERIENCE_INTERNAL_ROUTES = new Set(['/directory/talents','/directory/talents/{id}','/directory/talents/search']);
export function unsupportedExperienceSurfaces(paths) {
 return paths.filter(path => (/(?:publish|anqicms|share|quote|ai\/)/.test(path) || /^\/(directory|portal|casting|ingestion|talent-invitations|talent-claims|talent-submissions|casting-shares|talent-publications)(\/|$)/.test(path)) && !EXPERIENCE_INTERNAL_ROUTES.has(path));
}
export function forbiddenNonGoalSurfaces(paths) {
 return paths.filter(path => /(?:^|\/)(invoice|payment|booking|crm|seo|geo)(?:\/|$)/.test(path));
}
