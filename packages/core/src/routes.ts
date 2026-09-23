import type { Permission } from './model.ts';
import { Schemas, type Schema } from './validation.ts';
export interface RouteDefinition {
    method: 'GET' | 'POST' | 'PATCH' | 'PUT';
    path: string;
    operation: string;
    mode: 'AUTH' | 'READ' | 'COMMAND' | 'SECRET';
    permission?: Permission;
    schema?: Schema<unknown>;
}
export const ROUTES: RouteDefinition[] = [
    { method: 'GET', path: '/auth/csrf', operation: 'auth.csrf', mode: 'AUTH' },
    { method: 'POST', path: '/auth/login', operation: 'auth.login', mode: 'AUTH', schema: Schemas.login },
    { method: 'POST', path: '/auth/activate', operation: 'auth.activate', mode: 'AUTH', schema: Schemas.activate },
    { method: 'POST', path: '/auth/logout', operation: 'auth.logout', mode: 'AUTH', schema: Schemas.empty },
    { method: 'POST', path: '/auth/change-password', operation: 'auth.changePassword', mode: 'AUTH', schema: Schemas.password },
    { method: 'GET', path: '/me', operation: 'identity.me', mode: 'READ' },
    { method: 'GET', path: '/dashboard', operation: 'dashboard.get', mode: 'READ', permission: 'records.read' },
    { method: 'GET', path: '/catalog', operation: 'catalog.list', mode: 'READ', permission: 'records.read' },
    { method: 'POST', path: '/catalog/items', operation: 'catalog.create', mode: 'COMMAND', permission: 'catalog.manage', schema: Schemas.dictionaryCreate },
    { method: 'PATCH', path: '/catalog/items/{id}', operation: 'catalog.update', mode: 'COMMAND', permission: 'catalog.manage', schema: Schemas.dictionaryPatch },
    { method: 'GET', path: '/memberships', operation: 'member.list', mode: 'READ', permission: 'members.manage' },
    { method: 'POST', path: '/memberships', operation: 'member.create', mode: 'SECRET', permission: 'members.manage', schema: Schemas.memberCreate },
    { method: 'POST', path: '/memberships/{id}/disable', operation: 'member.disable', mode: 'COMMAND', permission: 'members.manage', schema: Schemas.revision },
    { method: 'PATCH', path: '/memberships/{id}/permissions', operation: 'member.permissions', mode: 'COMMAND', permission: 'members.manage', schema: Schemas.memberPermissions },
    { method: 'POST', path: '/memberships/{id}/reset-access', operation: 'member.resetAccess', mode: 'SECRET', permission: 'members.manage', schema: Schemas.revision },
    { method: 'GET', path: '/scopes', operation: 'scope.list', mode: 'READ', permission: 'records.read' },
    { method: 'POST', path: '/scopes', operation: 'scope.create', mode: 'COMMAND', permission: 'members.manage', schema: Schemas.scopeCreate },
    { method: 'PATCH', path: '/records/{kind}/{id}/scope', operation: 'record.scope', mode: 'COMMAND', permission: 'members.manage', schema: Schemas.recordScope },
    { method: 'GET', path: '/sources', operation: 'source.list', mode: 'READ', permission: 'sources.read' },
    { method: 'POST', path: '/sources', operation: 'source.create', mode: 'COMMAND', permission: 'sources.write', schema: Schemas.sourceCreate },
    { method: 'GET', path: '/sources/{id}/history', operation: 'source.history', mode: 'READ', permission: 'sources.review' },
    { method: 'GET', path: '/sources/{id}', operation: 'source.get', mode: 'READ', permission: 'sources.read' },
    { method: 'PATCH', path: '/sources/{id}', operation: 'source.update', mode: 'COMMAND', permission: 'sources.write', schema: Schemas.sourcePatch },
    { method: 'POST', path: '/sources/{id}/review', operation: 'source.review', mode: 'COMMAND', permission: 'sources.review', schema: Schemas.sourceReview },
    { method: 'POST', path: '/sources/{id}/suspend', operation: 'source.suspend', mode: 'COMMAND', permission: 'sources.review', schema: Schemas.suspend },
    { method: 'GET', path: '/people/{id}/handoff-recipients', operation: 'handoff.recipients', mode: 'READ', permission: 'records.write' },
    { method: 'POST', path: '/people/{id}/handoffs', operation: 'handoff.create', mode: 'COMMAND', permission: 'records.write', schema: Schemas.handoffCreate },
    { method: 'GET', path: '/handoffs', operation: 'handoff.list', mode: 'READ', permission: 'records.read' },
    { method: 'GET', path: '/handoffs/{id}', operation: 'handoff.get', mode: 'READ', permission: 'records.read' },
    { method: 'POST', path: '/handoffs/{id}/accept', operation: 'handoff.accept', mode: 'COMMAND', permission: 'records.read', schema: Schemas.revision },
    { method: 'POST', path: '/handoffs/{id}/decline', operation: 'handoff.decline', mode: 'COMMAND', permission: 'records.read', schema: Schemas.revision },
    { method: 'POST', path: '/handoffs/{id}/revoke', operation: 'handoff.revoke', mode: 'COMMAND', permission: 'records.read', schema: Schemas.revision },
    { method: 'GET', path: '/people', operation: 'person.list', mode: 'READ', permission: 'records.read' },
    { method: 'POST', path: '/people', operation: 'person.create', mode: 'COMMAND', permission: 'records.write', schema: Schemas.personCreate },
    { method: 'GET', path: '/people/{id}', operation: 'person.get', mode: 'READ', permission: 'records.read' },
    { method: 'PATCH', path: '/people/{id}', operation: 'person.update', mode: 'COMMAND', permission: 'records.write', schema: Schemas.personPatch },
    { method: 'GET', path: '/people/{id}/contacts', operation: 'contact.get', mode: 'READ', permission: 'sensitive.read' },
    { method: 'PUT', path: '/people/{id}/contacts', operation: 'contact.replace', mode: 'COMMAND', permission: 'sensitive.write', schema: Schemas.contacts },
    { method: 'POST', path: '/field-evidence', operation: 'evidence.confirm', mode: 'COMMAND', permission: 'sources.review', schema: Schemas.evidence },
    { method: 'POST', path: '/imports/preview', operation: 'import.preview', mode: 'COMMAND', permission: 'records.write', schema: Schemas.importPreview },
    { method: 'GET', path: '/imports/{id}', operation: 'import.get', mode: 'READ', permission: 'records.write' },
    { method: 'POST', path: '/imports/{id}/commit', operation: 'import.commit', mode: 'COMMAND', permission: 'records.write', schema: Schemas.importCommit },
    { method: 'GET', path: '/jobs', operation: 'job.list', mode: 'READ', permission: 'records.write' },
    { method: 'POST', path: '/jobs/{id}/resume', operation: 'job.resume', mode: 'COMMAND', permission: 'records.write', schema: Schemas.revision },
    { method: 'GET', path: '/jobs/{id}', operation: 'job.get', mode: 'READ', permission: 'records.write' },
    { method: 'GET', path: '/audit-events', operation: 'audit.list', mode: 'READ', permission: 'audit.read' }
];
