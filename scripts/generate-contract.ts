import { TD2_SEARCH_KEYS } from '../packages/core/src/talent-v2-search.ts';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROUTES } from '../packages/core/src/routes.ts';
function tsType(schema: Record<string, unknown>): string {
    if (Array.isArray(schema.anyOf))
        return schema.anyOf.map(s => tsType(s as Record<string, unknown>)).join(' | ');
    if (Array.isArray(schema.enum))
        return schema.enum.map(v => JSON.stringify(v)).join(' | ');
    if (schema.type === 'string')
        return 'string';
    if (schema.type === 'number' || schema.type === 'integer')
        return 'number';
    if (schema.type === 'boolean')
        return 'boolean';
    if (schema.type === 'null')
        return 'null';
    if (schema.type === 'array')
        return 'Array<' + tsType(schema.items as Record<string, unknown>) + '>';
    if (schema.type === 'object') {
        const props = schema.properties as Record<string, Record<string, unknown>>;
        const req = schema.required as string[];
        return '{ ' + Object.entries(props).map(([k, s]) => JSON.stringify(k) + (req.includes(k) ? '' : '?') + ': ' + tsType(s)).join('; ') + ' }';
    }
    return 'unknown';
}
const paths: Record<string, Record<string, unknown>> = {};
const queryFields: Record<string, string[]> = { 'td2.person.list':['page','pageSize',...TD2_SEARCH_KEYS], 'td2.resolve':['providerCode','namespaceCode','issuerOrganizationId','externalKey'], 'td2.proposal.list':['page','pageSize','personId'],'td2.principal.list':['page','pageSize'],'td2.organization.list':['page','pageSize'], 'deletion.items': ['page', 'pageSize'], 'usePermission.list': ['page', 'pageSize', 'sourceId', 'subjectKind', 'status'], 'export.list': ['page', 'pageSize'], 'talent.search': ['page', 'pageSize', 'q', 'role', 'cityCode', 'languageCode', 'skillCode', 'industryCode', 'workTypeCode', 'status', 'actualProject', 'verifiedWithinDays'], 'shortlist.list': ['page', 'pageSize', 'q'], 'work.list': ['page', 'pageSize', 'q', 'origin', 'status', 'industryCode', 'workTypeCode'], 'project.list': ['page', 'pageSize', 'q', 'status'], 'person.production': ['page', 'pageSize'], 'handoff.list': ['page', 'pageSize', 'direction'], 'handoff.recipients': ['page', 'pageSize', 'q', 'purpose'], 'person.list': ['page', 'pageSize', 'q', 'role', 'cityCode', 'languageCode', 'status'], 'source.list': ['page', 'pageSize'], 'source.history': ['page', 'pageSize'], 'member.list': ['page', 'pageSize'], 'job.list': ['page', 'pageSize'], 'audit.list': ['page', 'pageSize'], 'upload.list': ['page', 'pageSize'], 'asset.list': ['page', 'pageSize', 'personId', 'sourceId'] };
for (const route of ROUTES) {
    const path = '/api/v1' + route.path;
    paths[path] ??= {};
    const params: unknown[] = [];
    for (const match of route.path.matchAll(/\{(\w+)\}/g))
        params.push({ name: match[1], in: 'path', required: true, schema: { type: 'string', ...(match[1] === 'id' ? { format: 'uuid' } : { enum: ['person', 'source'] }) } });
    for (const name of queryFields[route.operation] ?? [])
        params.push({ name, in: 'query', required: false, schema: { type: 'string' } });
    const machineAllowed = ['td2.schema','td2.person.list','td2.person.get','td2.resolve','td2.organization.list','td2.person.create','td2.person.patch','td2.person.enroll','td2.proposal.create'].includes(route.operation)||route.operation.startsWith('td2.fact.');
    if (route.method !== 'GET')
        params.push({ name: 'Origin', in: 'header', required: !machineAllowed, schema: { type: 'string' } }, { name: 'X-CSRF-Token', in: 'header', required: !machineAllowed && route.operation!=='portal.auth.context', schema: { type: 'string' } });
    if(route.operation==='portal.auth.context')params.push({name:'X-ONCE-Portal',in:'header',required:true,schema:{type:'string',enum:['1']}});
    if(['portal.auth.logout','portal.sessions.revoke'].includes(route.operation))params.push({name:'X-ONCE-Talent-Account',in:'header',required:true,schema:{type:'string',format:'uuid'}});
    if (route.mode === 'COMMAND')
        params.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 } });
    const code = ['import.commit', 'job.resume', 'upload.complete', 'export.create'].includes(route.operation) ? '202' : ['directory.talent.create', 'locale.create', 'deletion.create', 'usePermission.create', 'shortlist.create', 'work.create', 'project.create', 'person.create', 'source.create', 'scope.create', 'catalog.create', 'import.preview', 'member.create', 'handoff.create', 'upload.create'].includes(route.operation)||route.operation.startsWith('td2.')&&route.operation.endsWith('.create') ? '201' : '200';
    paths[path][route.method.toLowerCase()] = { operationId: route.operation, parameters: params, security: route.path.startsWith('/portal/') ? route.operation==='portal.auth.context'?[]:['portal.auth.challenge','portal.auth.verify','portal.auth.contextStatus'].includes(route.operation)?[{talentPreCookie:[]}]:[{talentSessionCookie:[]}] : route.mode === 'AUTH' ? [] : machineAllowed ? [{sessionCookie:[]},{machineBearer:[]}] : [route.path.startsWith('/portal/')?{talentSessionCookie:[]}:{ sessionCookie: [] }],
        'x-machine-boundary':machineAllowed?'Explicit principal permissions and scope; no cookie mixing; human verification routes excluded':null,
        ...(route.operation === 'upload.content' ? { requestBody: { required: true, content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } } } : {}),
        ...(route.schema ? { requestBody: { required: true, content: { 'application/json': { schema: route.schema.json } } } } : {}),
        responses: { [code]: { description: route.mode === 'COMMAND' ? 'Minimal command receipt; import commit/resume acknowledge enqueue only' : 'Allowlisted response DTO; see src/dto.ts' }, default: { description: 'Sanitized error with code, message, requestId' } },
        'x-permission': route.permission ?? null, 'x-mode': route.mode };
}
const spec = { openapi: '3.1.0', info: { title: 'ONCE Internal OS — development increment 1', version: '0.1.0-dev.1', description: 'Paths and strict request schemas are generated from runtime routes. Response shapes are currently TypeScript DTOs; this is not a complete response-schema validator.' }, paths, components: { securitySchemes: {talentPreCookie:{type:'apiKey',in:'cookie',name:'once_talent_pre'},talentSessionCookie:{type:'apiKey',in:'cookie',name:'once_talent_session'}, machineBearer:{type:'http',scheme:'bearer',bearerFormat:'once_machine.<id>.<keyVersion>.<secret>'},sessionCookie: { type: 'apiKey', in: 'cookie', name: 'once_session' } } } };
const inputs = '// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.\nexport interface Inputs {\n' + ROUTES.map(r => '  ' + JSON.stringify(r.operation) + ': ' + (r.schema ? tsType(r.schema.json) : 'undefined') + ';').join('\n') + '\n}\nexport const ENDPOINTS = ' + JSON.stringify(Object.fromEntries(ROUTES.map(r => [r.operation, { method: r.method, path: r.path, mode: r.mode }])), null, 2) + ' as const;\n';
const files: [
    string,
    string
][] = [['artifacts/openapi.json', JSON.stringify(spec, null, 2) + '\n'], ['apps/admin-web/src/generated/requests.ts', inputs]];
const check = process.argv.includes('--check');
for (const [file, content] of files) {
    const path = resolve(file);
    if (check) {
        const actual = readFileSync(path, 'utf8');
        if (actual !== content) {
            const expectedLines = content.split('\n'), actualLines = actual.split('\n');
            const index = expectedLines.findIndex((line, i) => line !== actualLines[i]);
            const line = index >= 0 ? index + 1 : Math.min(expectedLines.length, actualLines.length) + 1;
            console.error(JSON.stringify({ file, line, expected: expectedLines[index] ?? '<EOF>', actual: actualLines[index] ?? '<EOF>' }));
            throw new Error('Generated contract drift: ' + file);
        }
    }
    else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
    }
}
console.log(`Contract ${check ? 'verified' : 'generated'}: ${ROUTES.length} routes; request schemas only`);
