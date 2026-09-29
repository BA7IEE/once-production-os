import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {forbiddenBrowserGlobals} from '../../scripts/browser-storage-policy.mjs';
const file='apps/admin-web/src/pending-marker.ts';
test('storage exception accepts only the fixed boolean marker; business payloads and aliases remain blocked',()=>{
 assert.deepEqual(forbiddenBrowserGlobals(file,readFileSync(file,'utf8')),[]);
 for(const source of ["sessionStorage.setItem('once-pending-command',body)","sessionStorage.setItem('once-pending-command','sensitive')","sessionStorage.setItem(key,'1')","sessionStorage.getItem('business')","sessionStorage.clear()","const store=sessionStorage;","localStorage.setItem('once-pending-command','1')","eval(body)","const dangerouslySetInnerHTML={__html:body}"]){assert.ok(forbiddenBrowserGlobals(file,source).length>0,source);}
 assert.ok(forbiddenBrowserGlobals('apps/admin-web/src/api.ts',"sessionStorage.setItem('once-pending-command','1')").length>0);
});
