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

test('role choice may stay pending across pages, but cannot carry arbitrary data or contradict a chosen role',()=>{
 const state={...emptyDirectoryState(),selected:[{personId,personRoleId:null,pendingRole:true}]};assert.deepEqual(safeDirectoryState(state).selected,state.selected);
 assert.throws(()=>safeDirectoryState({...state,selected:[{personId,personRoleId:roleId,pendingRole:true}]}));assert.throws(()=>safeDirectoryState({...state,selected:[{personId,personRoleId:null,pendingRole:false}]}));
});

test('professional applied conditions and unfinished edits survive detail return, history and reload within one identity',()=>{
 const me={membershipId:personId,directoryStateScope:'professional-session'} as any;
 const professionalQuery={roleCode:'photographer',fields:[{fieldCode:'camera.specialties',codes:['steadicam','trinity'],match:'ALL' as const}],capabilities:[{capabilityCode:'resolve',minLevel:'WORKING' as const}]};
 const professionalDraft={roleCode:'director',fields:[{fieldCode:'role.started_year',min:2020}],capabilities:[{capabilityCode:''}]};
 const state={...emptyDirectoryState(),query:{role:['photographer']},page:2,selected:[{personId,personRoleId:roleId},{personId:roleId,personRoleId:personId}],roleChoices:{[personId]:roleId},professionalQuery,professionalDraft};
 bindDirectoryIdentity(me);saveDirectoryState('library',state);const entry=structuredClone(historyMock.state);
 assert.deepEqual(readDirectoryState('library'),state);
 historyMock.state=structuredClone(entry);listeners.get('popstate')!();assert.deepEqual(readDirectoryState('library'),state);
 bindDirectoryIdentity(me);assert.deepEqual(readDirectoryState('library'),state);
 assert.equal(historyMock.state.onceDirectory.version,2);
 assert.deepEqual(readDirectoryState('candidate'),emptyDirectoryState());
 bindDirectoryIdentity({...me,directoryStateScope:'new-session'});assert.deepEqual(readDirectoryState('library'),emptyDirectoryState());
 historyMock.state=entry;listeners.get('popstate')!();assert.equal(historyMock.state,null);
});

test('professional history rejects payloads, invalid fields, unbounded values and old versions',()=>{
 const state={...emptyDirectoryState(),professionalQuery:{roleCode:'photographer',fields:[{fieldCode:'camera.specialties',codes:['steadicam'],match:'ALL'}]},professionalDraft:{fields:[]}};
 for(const professionalQuery of [{fields:[],privateText:'secret'},{fields:[{fieldCode:'camera.specialties',text:'private'}]},{fields:[{fieldCode:'camera.specialties',codes:Array(31).fill('a')}]},{fields:[],capabilities:[{capabilityCode:'resolve',minLevel:'OWNER'}]},{fields:[{fieldCode:'role.started_year',min:NaN}]},{fields:[{fieldCode:'some.date',from:'2026-02-31'}]},{fields:[{fieldCode:'camera.specialties',codes:['secret text']}]},{fields:[{fieldCode:'camera.specialties',state:'UNKNOWN',codes:['steadicam']}]},{fields:Array(11).fill({fieldCode:'role.started_year'})}])assert.throws(()=>safeDirectoryState({...state,professionalQuery}));
 bindDirectoryIdentity({membershipId:personId,directoryStateScope:'schema-version'} as any);
 historyMock.state={onceDirectory:{version:1,membershipId:personId,scope:'schema-version',views:{library:state}}};
 listeners.get('popstate')!();assert.equal(historyMock.state,null);
});
