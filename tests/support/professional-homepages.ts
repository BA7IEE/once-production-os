import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Store} from '../../packages/core/src/store.ts';
import type {TalentActor} from '../../packages/core/src/talent-auth-model.ts';
import {supplierFixture} from './supplier-profiles.ts';
import {unitReady} from './media-staging.ts';
import type {HomepageDraft} from '../../packages/core/src/professional-homepage-schema.ts';

export async function homepageFixture(store:Store,roleCode='director',secondWork=false){
 const f=await supplierFixture(store);f.app.config.professionalHomepagesEnabled=true;f.app.config.mediaEnabled=true;
 const schema=f.ok(await f.a.client.raw('GET','/portal/profile-schema',undefined,f.headers()));f.profile.locationCodes=[schema.locations[0].code];f.profile.languageCodes=schema.languages.slice(0,1).map((r:any)=>r.code);
 if(roleCode==='model'){f.profile.roleCodes.push('model');Object.assign(f.profile.measurements,{heightCm:178,bustCm:85,waistCm:65,hipsCm:90});}
 const draft=await f.create(),sid=draft.resourceId,revision=async()=>(await store.transaction(tx=>tx.get('talentSubmissions',sid)))!.revision;
 const workspaceId=(await store.transaction(tx=>tx.find('workspaces')))[0]!.id;
 const actor:TalentActor={actorKind:'TALENT',workspaceId,talentAccountId:f.a.accountId,sessionEpoch:1,sessionId:''};
 const create=async(extra={})=>f.ok(await f.a.client.raw('POST','/portal/uploads',{context:{kind:'TALENT_SUBMISSION',submissionId:sid},expectedSubmissionRevision:await revision(),fileName:'anonymous-portfolio.jpg',mime:'image/jpeg',expectedBytes:100,sha256:'a'.repeat(64),...extra},f.headers()));
 const asset=await unitReady({...f,create,revision,expect:(p:Promise<any>,status=200)=>p.then(r=>f.ok(r,status)),actor,submissionId:sid,grantId:undefined,claimId:f.input.claimId,headers:()=>f.headers()} as Parameters<typeof unitReady>[0]);
 const work={clientItemKey:'homepage-case',mode:'CREATE_EXTERNAL_WORK',targetWorkId:null,expectedWorkRevision:null,personRoleId:null,declaredRoleCode:roleCode,title:'匿名导演代表作',description:'已确认的匿名案例介绍',datePrecision:'YEAR',caseDate:'2026',location:'',industryCode:null,workTypeCodes:[],brandDisplayName:'匿名品牌',creditNote:roleCode==='model'?'出镜模特':'导演，负责整体创意和现场执导',coverAssetId:asset,items:[{referenceKind:'SUBMISSION_STAGED_ASSET',assetId:asset}]};
 f.ok(await f.a.client.raw('POST','/portal/submissions/'+sid+'/works',{expectedRevision:await revision(),works:secondWork?[work,{...work,clientItemKey:'remaining-case',title:'保留的另一个匿名作品',coverAssetId:null,items:[]}]:[work]},f.headers()));
 f.ok(await f.a.client.raw('POST','/portal/profile-drafts/'+sid+'/confirm',{expectedRevision:await revision(),accepted:true},f.headers()));
 const confirmed=await f.read(sid),personId=confirmed.personId,own=f.ok(await f.a.client.raw('GET','/portal/supplier-profiles/'+personId,undefined,f.headers()));
 const options=f.ok(await f.a.client.raw('GET','/portal/homepage-options/'+personId,undefined,f.headers()));
 const input:HomepageDraft={personRoleId:options.roles.find((r:any)=>r.roleCode===roleCode).id,includeIntro:true,cityCode:options.cityCodes[0]??'',skillCodes:[],languageCodes:options.languageCodes,measurementFields:roleCode==='model'?['heightCm','bustCm','waistCm','hipsCm']:[],contactIds:[options.contacts[0].id],coverAssetId:asset,portfolioAssetId:null,works:[{creditId:options.works[0].credit.id,assetIds:[asset],externalUrl:'https://example.com/anonymous-director-work'}]};
 const created=f.ok(await f.a.client.raw('POST','/portal/homepages',{personId,draft:input},f.headers())),id=created.resourceId;
 const get=async()=>f.ok(await f.a.client.raw('GET','/portal/homepages/'+id,undefined,f.headers()));
 const publishBody=async()=>({expectedRevision:(await get()).revision,previewDigest:f.ok(await f.a.client.raw('GET','/portal/homepages/'+id+'/preview',undefined,f.headers())).previewDigest,expiresAt:new Date(f.clock.now().getTime()+180*86400000).toISOString(),consentVersion:'once-public-homepage-v1',publicAccepted:true,mediaRightsAccepted:true,adultDeclared:true});
 const publish=async(key=randomUUID())=>{const body=await publishBody();return {result:f.ok(await f.a.client.raw('POST','/portal/homepages/'+id+'/publish',body,f.headers(f.a,key))),body,key};};
 const slug=(await get()).slug;
 const publicRead=async()=>f.a.client.raw('GET','/public/homepages/'+slug);
 assert.equal((await publicRead()).status,404,'an unpublished draft is never public');
 return {...f,workspaceId,sid,personId,own,options,input,id,asset,get,publish,publishBody,publicRead};
}

export async function verifyHomepageErasure(f:Awaited<ReturnType<typeof homepageFixture>>){
 const body={targetKind:'WORK',targetId:f.options.works[0].id,expectedRevision:1},preview=f.ok(await f.owner.raw('POST','/deletion-requests/preview',body));assert.equal(preview.complete,true,JSON.stringify(preview));
 const requestId=f.ok(await f.owner.cmd('POST','/deletion-requests',{...body,previewDigest:preview.previewDigest,reason:'匿名作品及其个人主页全历史清理验证'}),201).resourceId;
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+requestId+'/block',{expectedRevision:1,previewDigest:preview.previewDigest,acknowledgeBlock:true}));
 let request=f.ok(await f.owner.raw('GET','/deletion-requests/'+requestId));const items=await f.store.transaction(tx=>tx.find('deletionItems',{requestId}));assert.ok(items.some(i=>i.resourceKind==='professionalHomepage'));
 for(const item of items.filter(i=>i.decision==='PENDING')){f.ok(await f.owner.cmd('POST','/deletion-requests/'+requestId+'/decisions',{expectedRevision:request.revision,entryId:item.id,decision:'APPLY_PROPOSED',decisionReason:'已核对，清除主页草稿和全部公开版本'}));request=f.ok(await f.owner.raw('GET','/deletion-requests/'+requestId));}
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+requestId+'/plan/freeze',{expectedRevision:request.revision,acknowledgePlan:true}));request=f.ok(await f.owner.raw('GET','/deletion-requests/'+requestId));
 f.ok(await f.owner.cmd('POST','/deletion-requests/'+requestId+'/cleaning/start',{expectedRevision:request.revision,planDigest:request.planDigest,acknowledgeIrreversible:true}));
 for(let i=0;i<100;i++){const task=await f.app.deletionCleanup.claim();if(!task)break;await f.app.deletionCleanup.process(task);}
 const root=await f.store.transaction(tx=>tx.get('professionalHomepages',f.id));assert.equal(root!.state,'ERASED');assert.equal(root!.draftCiphertext,null);assert.equal(root!.currentVersionId,null);assert.ok((await f.store.transaction(tx=>tx.find('homepageVersions',{homepageId:f.id}))).every(v=>v.state==='ERASED'&&!v.contentCiphertext));
 const cleaned=await f.store.transaction(tx=>tx.get('deletionRequests',requestId));
 const progress=await f.store.transaction(tx=>tx.find('deletionItems',{requestId}));
 assert.equal(cleaned!.cleanupErrorCode,null,JSON.stringify(progress.map(i=>({kind:i.resourceKind,state:i.cleanupState,code:i.cleanupErrorCode}))));
 const final=await f.app.deletionFinalization.claim();assert.ok(final,JSON.stringify(progress.map(i=>({kind:i.resourceKind,state:i.cleanupState,code:i.cleanupErrorCode}))));await f.app.deletionFinalization.finish(final!);
}
