import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, member, sourceInput, result, type Client } from '../support/fixtures.ts';

type F = Awaited<ReturnType<typeof fixture>>;
async function ok(p: ReturnType<Client['raw']>, status=200){const r=await p;assert.equal(r.status,status,JSON.stringify(r.body));return result(r);}
async function person(c:Client,name:string,more:Record<string,unknown>={}){return (await ok(c.cmd('POST','/people',{displayName:name,roles:['model'],inlineSource:sourceInput(),...more}),201)).resourceId as string;}
async function root(c:Client,kind:'works'|'projects',title:string,more:Record<string,unknown>={}){return (await ok(c.cmd('POST','/'+kind,{title,inlineSource:sourceInput(),...more}),201)).resourceId as string;}
async function get(c:Client,path:string){return ok(c.raw('GET',path));}
async function mutate(c:Client,path:string,suffix:string,body:Record<string,unknown>){const d=await get(c,path);return ok(c.cmd('POST',path+suffix,{expectedRevision:d.revision,...body}));}

async function richPerson(f:F,name='SR1 模特'){
  return (await ok(f.owner.cmd('POST','/people',{displayName:name,aliases:['SR1 Alias'],roles:['model'],cityCode:'shenzhen',languageCodes:['en'],skillCodes:['lifestyle'],inlineSource:sourceInput()}),201)).resourceId as string;
}

test('SR1 structured profile filters return explicit match reasons and unknown fields are not matches', async()=>{
  const f=await fixture(), rich=await richPerson(f), unknown=await person(f.owner,'SR1 信息待补');
  const r=await get(f.owner,'/people/search?role=model&cityCode=shenzhen&languageCode=en&skillCode=lifestyle');
  assert.equal(r.total,1); assert.equal(r.items[0].id,rich); assert.equal(r.semantics.scoring,false);
  assert.deepEqual(r.items[0].match.direct.map((x:any)=>x.field),['role','cityCode','languageCode','skillCode']);
  assert.deepEqual((await get(f.owner,'/people/search?q=信息待补')).items[0].match.unknownFields,['cityCode','languageCodes','skillCodes']);
  assert.equal((await get(f.owner,'/people/search?cityCode=shenzhen')).items.some((x:any)=>x.id===unknown),false);
});

test('SR1 current field evidence can be required by age without treating old evidence as fresh', async()=>{
  const f=await fixture(), id=await richPerson(f,'SR1 核验人才'); let p=await get(f.owner,'/people/'+id);
  await ok(f.owner.cmd('POST','/field-evidence',{personId:id,expectedRevision:p.revision,fieldPath:'roles',sourceId:p.sourceId,sourceRevision:p.source.revision}));
  let r=await get(f.owner,'/people/search?role=model&verifiedWithinDays=90'); assert.equal(r.total,1); assert.equal(r.items[0].match.direct[0].verification.state,'CURRENT');
  f.clock.advance(91*86400000); await f.owner.login();
  r=await get(f.owner,'/people/search?role=model&verifiedWithinDays=90'); assert.equal(r.total,0);
  r=await get(f.owner,'/people/search?role=model&verifiedWithinDays=180'); assert.equal(r.total,1); assert.equal(r.items[0].match.direct[0].verification.state,'CURRENT');
});

test('SR1 work keyword/origin and ACTUAL project are relationship facts, not nomination or score', async()=>{
  const f=await fixture(), id=await richPerson(f,'SR1 家具模特'), w=await root(f.owner,'works','SR1 家具生活方式作品',{description:'现代家居 Lifestyle 场景',origin:'EXTERNAL',originNote:'合成外部作品'}), p=await root(f.owner,'projects','SR1 家具商业项目');
  await mutate(f.owner,'/works/'+w,'/credits',{personId:id,roleCode:'model',note:'合成出镜署名'});
  await mutate(f.owner,'/projects/'+p,'/participants',{personId:id,roleCode:'model',state:'NOMINATED',note:''});
  assert.equal((await get(f.owner,'/people/search?workQ=家具&workOrigin=EXTERNAL&actualProject=true')).total,0);
  let pd=await get(f.owner,'/projects/'+p), entry=pd.participants[0];
  await ok(f.owner.cmd('POST','/projects/'+p+'/participants/update',{expectedRevision:pd.revision,entryId:entry.id,state:'ACTUAL',note:'合成现场实际完成拍摄'}));
  const r=await get(f.owner,'/people/search?workQ=家具&workOrigin=EXTERNAL&actualProject=true');
  assert.equal(r.total,1); assert.equal(r.items[0].id,id); assert.equal(r.items[0].match.actualProjectCount,1); assert.equal(r.items[0].match.matchedWorks[0].id,w); assert.equal(r.semantics.sort,'UPDATED_DESC');
});

test('SR1 restricted projects are excluded from relationship counts for users outside that scope', async()=>{
  const f=await fixture(), ed=await member(f,'sr-search-editor'), id=await richPerson(f,'SR1 权限人才');
  const projectId=(await ok(ed.client.cmd('POST','/projects',{title:'SR1 受限实际项目',inlineSource:sourceInput(true)}),201)).resourceId as string;
  await mutate(ed.client,'/projects/'+projectId,'/participants',{personId:id,roleCode:'model',state:'ACTUAL',note:'合成实际参与'});
  const owner=await get(f.owner,'/people/search?q=SR1 权限人才'), editor=await get(ed.client,'/people/search?q=SR1 权限人才');
  assert.equal(owner.items[0].match.actualProjectCount,0); assert.equal(editor.items[0].match.actualProjectCount,1);
  assert.equal((await get(f.owner,'/people/search?q=SR1 权限人才&actualProject=true')).total,0);
  assert.equal((await get(ed.client,'/people/search?q=SR1 权限人才&actualProject=true')).total,1);
});


test('SR1 H1 handoff basic-profile access does not expose hidden work or project relationships', async()=>{
  const f=await fixture(), ed=await member(f,'sr-h1-editor');
  const id=(await ok(ed.client.cmd('POST','/people',{displayName:'SR1 H1 私有人才',roles:['model'],cityCode:'shenzhen',inlineSource:sourceInput(true)}),201)).resourceId as string;
  const w=(await ok(ed.client.cmd('POST','/works',{title:'SR1 H1 私有作品',origin:'EXTERNAL',inlineSource:sourceInput(true)}),201)).resourceId as string;
  const p=(await ok(ed.client.cmd('POST','/projects',{title:'SR1 H1 私有项目',inlineSource:sourceInput(true)}),201)).resourceId as string;
  await mutate(ed.client,'/works/'+w,'/credits',{personId:id,roleCode:'model',note:'私有署名'});
  await mutate(ed.client,'/projects/'+p,'/participants',{personId:id,roleCode:'model',state:'ACTUAL',note:'私有实际参与'});
  const profile=await get(ed.client,'/people/'+id), handoff=(await ok(ed.client.cmd('POST','/people/'+id+'/handoffs',{expectedRevision:profile.revision,expectedSourceRevision:profile.source.revision,recipientId:f.membershipId,purpose:'EDIT',expiresAt:new Date(f.clock.now().getTime()+3600000).toISOString(),acknowledgeLimitedAccess:true}),201)).resourceId as string;
  await ok(f.owner.cmd('POST','/handoffs/'+handoff+'/accept',{expectedRevision:1}));
  const visible=await get(f.owner,'/people/search?q=SR1%20H1%20私有人才'); assert.equal(visible.total,1); assert.equal(visible.items[0].match.actualProjectCount,0); assert.equal(visible.items[0].match.visibleWorkCount,0);
  assert.equal((await get(f.owner,'/people/search?q=SR1%20H1%20私有人才&actualProject=true')).total,0);
  assert.equal((await get(f.owner,'/people/search?q=SR1%20H1%20私有人才&workQ=私有')).total,0);
});

test('SR1 search rejects ambiguous verification and unsupported query keys', async()=>{
  const f=await fixture();
  assert.equal((await f.owner.raw('GET','/people/search?verifiedWithinDays=90')).status,400);
  assert.equal((await f.owner.raw('GET','/people/search?actualProject=false')).status,400);
  assert.equal((await f.owner.raw('GET','/people/search?budget=1000')).status,400);
  assert.equal((await f.owner.raw('GET','/people/search?role=model&verifiedWithinDays=0')).status,400);
});
