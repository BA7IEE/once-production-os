import assert from 'node:assert/strict';
import {Client,sourceInput} from './fixtures.ts';
import {expectResponse as ok} from './talent-v2-maintenance.ts';
import {TALENT_SCHEMA_VERSION as schemaVersion} from '../../packages/core/src/talent-v2-model.ts';
/** Same command/read assertions run against MemoryStore and real PrismaStore. */
export async function verifyLegacyProjection(owner:Client){
 const sourceId=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;
 const personId=ok(await owner.cmd('POST','/people',{sourceId,displayName:'合成兼容查询',roles:['model'],languageCodes:['en'],cityCode:'shenzhen',heightCm:178})).resourceId as string;
 const legacy=async()=>ok(await owner.raw('GET',`/people/${personId}`),200),typed=async()=>ok(await owner.raw('GET',`/td2/people/${personId}`),200);
 assert.equal((await legacy()).heightCm,178);assert.equal((await legacy()).professionalManaged,false);
 ok(await owner.cmd('POST',`/td2/people/${personId}/enroll`,{schemaVersion,expectedRevision:1,sourceRevision:1}),200);
 const read=await legacy();assert.equal(read.professionalManaged,true);assert.deepEqual(read.roles,['model']);assert.deepEqual(read.languageCodes,['en']);assert.equal(read.heightCm,null,'unreviewed old height must not become current measured height');
 const add=async(slug:string,values:Record<string,unknown>,basis=sourceId)=>owner.cmd('POST',`/td2/people/${personId}/${slug}`,{schemaVersion,expectedPersonRevision:(await typed()).revision,sourceId:basis,sourceRevision:1,values});
 const actor=ok(await add('roles',{roleCode:'actor'})).resourceId as string;ok(await add('languages',{languageCode:'fr',speakingLevelCode:'WORKING'}));
 let current=await typed();const model=current.facts.personRoles.find((r:any)=>r.roleCode==='model');
 ok(await owner.cmd('PATCH',`/td2/roles/${model.id}`,{schemaVersion,expectedRevision:model.revision,expectedPersonRevision:current.revision,sourceId,sourceRevision:1,values:{status:'INACTIVE'}}),200);
 const ids=(r:any)=>r.items.map((p:any)=>p.id).sort();const subset=(r:any)=>ids(r).includes(personId);
 for(const [oldQuery,newQuery]of [['role=model','role=model'],['role=actor','role=actor'],['languageCode=fr','language=fr'],['cityCode=shenzhen','location=shenzhen&locationRelation=BASE']]){const expected=subset(ok(await owner.raw('GET','/td2/people?'+newQuery),200));assert.equal(subset(ok(await owner.raw('GET','/people?'+oldQuery),200)),expected);assert.equal(subset(ok(await owner.raw('GET','/talent-search?'+oldQuery),200)),expected);}
 assert.deepEqual((await legacy()).roles,['actor']);assert.ok((await legacy()).languageCodes.includes('fr'));
 const before=await legacy();for(const patch of [{roles:['model']},{languageCodes:['zh']},{cityCode:'guangzhou'},{skillCodes:['commercial']},{heightCm:190}]){const denied=await owner.cmd('PATCH',`/people/${personId}`,{expectedRevision:before.revision,...patch});assert.equal(denied.status,409);assert.equal((denied.body as any).error.code,'TD2_TYPED_WRITE_REQUIRED');}
 assert.equal((await legacy()).revision,before.revision);const deniedEvidence=await owner.cmd('POST','/field-evidence',{personId,expectedRevision:before.revision,fieldPath:'roles',sourceId,sourceRevision:1});assert.equal(deniedEvidence.status,409);assert.equal((deniedEvidence.body as any).error.code,'TD2_TYPED_EVIDENCE_REQUIRED');
 ok(await owner.cmd('PATCH',`/people/${personId}`,{expectedRevision:before.revision,displayName:'合成兼容基础编辑'}),200);assert.equal((await legacy()).displayName,'合成兼容基础编辑');
 const otherSource=ok(await owner.cmd('POST','/sources',sourceInput())).resourceId as string;ok(await add('languages',{languageCode:'zh'},otherSource));assert.ok((await legacy()).languageCodes.includes('zh'));
 ok(await owner.cmd('POST',`/sources/${otherSource}/suspend`,{expectedRevision:1,reason:'合成来源不可用后兼容列表必须同步遮蔽'}),200);assert.ok(!(await legacy()).languageCodes.includes('zh'));assert.equal(subset(ok(await owner.raw('GET','/people?languageCode=zh'),200)),false);
 current=await typed();ok(await owner.cmd('PATCH',`/td2/roles/${actor}`,{schemaVersion,expectedRevision:1,expectedPersonRevision:current.revision,sourceId,sourceRevision:1,values:{status:'INACTIVE'}}),200);assert.deepEqual((await legacy()).roles,[],'no fallback to frozen legacy model role');
 return {personId,sourceId};
}

export async function verifyDelegatedLegacyProjection(owner:Client,now:Date){
 const login='compat-'+Math.random().toString(36).slice(2),member=ok(await owner.raw('POST','/memberships',{loginName:login,displayName:'合成受限接收人',role:'ADMIN',extraPermissions:[]})),receiver=new Client(owner.app,'192.0.2.222');ok(await receiver.activate(member.activationToken),200);ok(await receiver.login(login),200);
 const me=ok(await owner.raw('GET','/me'),200);const scopeId=ok(await owner.cmd('POST','/scopes',{name:'合成专业资料私有范围',membershipIds:[me.membershipId]})).resourceId as string;
 const sourceId=ok(await owner.cmd('POST','/sources',{...sourceInput(),scopeId})).resourceId as string;
 const personId=ok(await owner.cmd('POST','/people',{sourceId,displayName:'合成受限专业人物',roles:['model'],languageCodes:['en'],cityCode:'shenzhen',heightCm:179})).resourceId as string;
 ok(await owner.cmd('POST',`/td2/people/${personId}/enroll`,{schemaVersion,expectedRevision:1,sourceRevision:1}),200);
 const person=ok(await owner.raw('GET',`/people/${personId}`),200);const handoff=ok(await owner.cmd('POST',`/people/${personId}/handoffs`,{expectedRevision:person.revision,expectedSourceRevision:1,recipientId:member.membershipId,purpose:'EDIT',expiresAt:new Date(now.getTime()+3600000).toISOString(),acknowledgeLimitedAccess:true})).resourceId as string;
 ok(await receiver.cmd('POST',`/handoffs/${handoff}/accept`,{expectedRevision:1}),200);const detail=ok(await receiver.raw('GET',`/people/${personId}`),200);assert.equal(detail.access.mode,'HANDOFF');assert.equal(detail.professionalManaged,true);assert.deepEqual(detail.roles,[]);assert.deepEqual(detail.languageCodes,[]);assert.equal(detail.heightCm,null);assert.equal(detail.cityCode,null);
 assert.equal((await receiver.raw('GET',`/td2/people/${personId}`)).status,404);assert.ok(!ok(await receiver.raw('GET','/people?role=model'),200).items.some((p:any)=>p.id===personId));assert.ok(!ok(await receiver.raw('GET','/talent-search?role=model'),200).items.some((p:any)=>p.id===personId));
 ok(await receiver.cmd('PATCH',`/people/${personId}`,{expectedRevision:detail.revision,intro:'合成有限交接基本整理'}),200);
}
