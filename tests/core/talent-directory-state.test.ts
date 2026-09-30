import {test} from 'node:test';
import assert from 'node:assert/strict';
const listeners=new Map<string,()=>void>();
(globalThis as any).window={addEventListener:(name:string,fn:()=>void)=>listeners.set(name,fn)};
const historyMock={state:null as any,replaceState(value:any){this.state=value;},pushState(value:any){this.state=value;}};(globalThis as any).history=historyMock;
const {safeDirectoryState,bindDirectoryIdentity,saveDirectoryState,readDirectoryState,clearDirectoryMemory,emptyDirectoryState}=await import('../../apps/admin-web/src/directory-state.ts');
const personId='00000000-0000-4000-8000-000000000001',roleId='00000000-0000-4000-8000-000000000002';
test('safe history state persists only strict filters, pagination and person-role IDs, never DTO or secrets',()=>{
 const state={...emptyDirectoryState(),query:{role:['model','actor'],location:['shenzhen','guangzhou']},page:2,selected:[{personId,personRoleId:roleId}],roleChoices:{[personId]:roleId}};
 assert.deepEqual(safeDirectoryState(state),state);
 for(const patch of [{...state,token:'secret'},{...state,query:{birthDate:'2000-01-01'}},{...state,query:{contact:'123'}},{...state,query:{constructor:['model']}},{...state,selected:[{personId,personRoleId:roleId,displayName:'DTO'}]},{...state,page:0},{...state,query:{role:['model','model']}},{...state,selected:Array(201).fill({personId,personRoleId:roleId})}])assert.throws(()=>safeDirectoryState(patch));
});
test('logout, expiry, different member and same-member new session reject all historic state',()=>{
 const me={membershipId:personId,directoryStateScope:'session-scope-a'} as any,state={...emptyDirectoryState(),page:2,selected:[{personId,personRoleId:roleId}]};bindDirectoryIdentity(me);saveDirectoryState('candidate',state);const old=structuredClone(historyMock.state);assert.equal(readDirectoryState('candidate').page,2);
 clearDirectoryMemory();assert.equal(historyMock.state,null);historyMock.state=old;bindDirectoryIdentity({...me,directoryStateScope:'session-scope-b'});assert.equal(historyMock.state,null);assert.equal(readDirectoryState('candidate').page,1);
 historyMock.state=old;bindDirectoryIdentity({...me,membershipId:roleId});assert.equal(readDirectoryState('candidate').selected.length,0);
 bindDirectoryIdentity(me);saveDirectoryState('candidate',state);listeners.get('once-session-expired')!();assert.equal(historyMock.state,null);historyMock.state=old;listeners.get('popstate')!();assert.equal(historyMock.state,null);
});
