import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PortalDraftState} from '../../apps/admin-web/src/portal-draft-state.ts';
import {PortalCommands,PortalRequestError} from '../../apps/admin-web/src/portal-command.ts';
const snapshot=(id='draft-a',revision=1,intro='服务器简介',media='QUEUED')=>({id,revision,media,items:[{field:'displayName',value:'本人姓名'},{field:'aliases',value:['旧别名']},{field:'intro',value:intro}]});
test('portal media polling and consent readback update revision without replacing editable identity',()=>{
 const d=new PortalDraftState<ReturnType<typeof snapshot>>('owner','draft-a');assert.equal(d.receive(d.beginRead(),[snapshot()]),true);
 d.change('name','新姓名');d.change('aliases','新别名');d.change('intro','正在输入的简介');
 assert.equal(d.receive(d.beginRead(),[snapshot('draft-a',2,'服务器简介','READY')]),true);
 assert.equal(d.snapshot!.revision,2);assert.equal(d.snapshot!.media,'READY');assert.deepEqual(d.fields,{name:'新姓名',aliases:'新别名',intro:'正在输入的简介'});assert.equal(d.dirty,true);
});
test('portal late reads cannot return a switched draft, older revision or previous owner view',()=>{
 const d=new PortalDraftState<ReturnType<typeof snapshot>>('owner','draft-a'),old=d.beginRead();d.open(snapshot('draft-b'));
 assert.equal(d.receive(old,[snapshot('draft-a')]),false);assert.equal(d.id,'draft-b');
 const slower=d.beginRead(),latest=d.beginRead();assert.equal(d.receive(latest,[snapshot('draft-b',3)]),true);assert.equal(d.receive(slower,[snapshot('draft-b',2)]),false);assert.equal(d.snapshot!.revision,3);
 assert.equal(d.receive(d.beginRead(),[snapshot('draft-b',1)]),false);
 const beforeLogout=d.beginRead();d.deactivate();assert.equal(d.receive(beforeLogout,[snapshot('draft-b',4)]),false);assert.equal(d.accepts({...beforeLogout,owner:'other-account'}),false);
});
test('portal unknown save and failed readback keep text until explicit same-request recovery succeeds',async()=>{
 const d=new PortalDraftState<ReturnType<typeof snapshot>>('owner','draft-a');d.open(snapshot());d.change('intro','本次保存的简介');
 const sent:Array<{body:unknown;key:string}>=[];const receipt={operationId:'11111111-1111-4111-8111-111111111111',resourceId:'22222222-2222-4222-8222-222222222222',revision:2,state:'SUCCEEDED'};
 const commands=new PortalCommands(async(_p,_m,body,key)=>{sent.push({body,key});if(sent.length===1)throw new PortalRequestError('响应丢失',0,'NETWORK_ERROR',true);return receipt;},()=>{});
 await assert.rejects(()=>commands.submit('owner','/submissions/draft-a',{intro:d.fields.intro},'PATCH'));d.receive(d.beginRead(),[snapshot()]);assert.equal(d.dirty,true);assert.equal(d.fields.intro,'本次保存的简介');
 await commands.replay('owner');assert.deepEqual(sent[0],sent[1]);assert.equal(commands.hasPending,true);assert.equal(d.dirty,true);
 // A failed GET does not call receive/rendered. Retrying readback must not write again.
 await commands.replay('owner');assert.equal(sent.length,2);assert.equal(d.receive(d.beginRead(),[snapshot('draft-a',2,'本次保存的简介')],true),true);commands.rendered();assert.equal(d.dirty,false);assert.equal(commands.hasPending,false);
});
test('new draft ignores previous view reads and attaches only the confirmed draft identity',()=>{
 const d=new PortalDraftState<ReturnType<typeof snapshot>>('owner','draft-a');d.open(snapshot());const previous=d.beginRead();d.create('grant:new',{name:'新稿',aliases:'',intro:'新内容'});d.change('intro','继续输入');assert.equal(d.receive(previous,[snapshot()]),false);d.attach('draft-b');assert.equal(d.receive(d.beginRead(),[snapshot('draft-b',1,'继续输入')],true),true);assert.equal(d.id,'draft-b');assert.equal(d.dirty,false);assert.equal(d.fields.intro,'继续输入');
});

test('remote identity changes preserve local text and block save until explicit discard and review',()=>{
 const d=new PortalDraftState<ReturnType<typeof snapshot>>('owner','draft-a');d.open(snapshot());d.change('intro','我的未保存修改');
 d.receive(d.beginRead(),[snapshot('draft-a',2,'另一窗口保存的简介')]);assert.equal(d.conflict,true);assert.equal(d.dirty,true);assert.equal(d.fields.intro,'我的未保存修改');assert.equal(d.snapshot!.revision,2);
 d.receive(d.beginRead(),[snapshot('draft-a',3,'另一窗口保存的简介','READY')]);assert.equal(d.conflict,true);assert.equal(d.fields.intro,'我的未保存修改');
 d.discard();assert.equal(d.conflict,false);assert.equal(d.dirty,false);assert.equal(d.fields.intro,'另一窗口保存的简介');d.change('intro','核对后重新填写');d.receive(d.beginRead(),[snapshot('draft-a',4,'另一窗口保存的简介','READY')]);assert.equal(d.conflict,false);assert.equal(d.fields.intro,'核对后重新填写');
});
