import {test} from 'node:test';
import assert from 'node:assert/strict';
import {navigationFor,routeFor} from '../../apps/admin-web/src/app/navigation.ts';
import {rememberList,recallList,clearListMemory} from '../../apps/admin-web/src/app/list-memory.ts';
test('UI navigation uses granular permissions; deep links map to the same permission entry',()=>{
 const viewer=navigationFor(['records.read']);
 assert.ok(viewer.some(p=>p.key==='people'));assert.ok(!viewer.some(p=>['members','deletions','merges','media'].includes(p.key)));
 assert.equal(routeFor('/talents/123')?.key,'people');assert.equal(routeFor('/api/v1/people'),undefined);
 assert.equal(routeFor('/talents-unrelated'),undefined);
});
test('UI session text lives only in identity keyed ephemeral memory and is cleared on sign out',()=>{
 rememberList('member-a:talents',{query:'synthetic'});assert.equal(recallList('member-b:talents',null),null);
 clearListMemory();assert.equal(recallList('member-a:talents',null),null);
});
