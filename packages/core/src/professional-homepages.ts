import {randomBytes} from 'node:crypto';
import type {Clock,Config} from './model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {Tx} from './store.ts';
import type {Exposure} from './talent-maintenance-model.ts';
import type {ProfessionalHomepage,HomepageVersion,HomepageContent,HomepageDependencies} from './professional-homepage-model.ts';
import {HomepageSchemas,homepageDraftSchema,HOMEPAGE_CONSENT_VERSION,type HomepageDraft} from './professional-homepage-schema.ts';
import {base,touch,cas,workspaceRow} from './helpers.ts';
import {AppError,missing,invariant} from './errors.ts';
import {digest} from './json.ts';
import {decryptContact} from './crypto.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {TalentMaintenance} from './talent-maintenance.ts';
import {SupplierProfiles} from './supplier-profiles.ts';
import {portalWorkCases,exactCreditCurrent,currentWorkExposure} from './talent-work-cases.ts';
import {mediaExposure} from './talent-media-exposure.ts';
import {talentFormalAsset} from './media-collections.ts';
import {sourceCurrent,deletionBlocked} from './policy.ts';
import {requireExposureBasis} from './talent-exposure-basis.ts';
import {ageRange} from './talent-demographics.ts';

export function homepageExternalUrl(value:string){
 if(!value)return '';
 let u:URL;try{u=new URL(value);}catch{invariant(false,'HOMEPAGE_LINK_INVALID','作品替代链接须为完整 HTTPS 地址',422);}
 invariant(u!.protocol==='https:'&&!u!.username&&!u!.password&&!u!.hash&&u!.hostname.includes('.')&&!/^(localhost|.*\.localhost|127\.|0\.|169\.254\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(u!.hostname),'HOMEPAGE_LINK_INVALID','作品替代链接须为公开 HTTPS 地址，不含密码或访问令牌片段',422);
 return u!.href;
}
const unique=(a:string[])=>new Set(a).size===a.length;
const measureLabels:Record<string,string>={heightCm:'身高 cm',bustCm:'胸围 cm',waistCm:'腰围 cm',hipsCm:'臀围 cm'};
function contentFacts(c:HomepageContent){const media=(m:HomepageContent['cover'])=>m?{mime:m.mime}:null;return {...c,cover:media(c.cover),portfolio:media(c.portfolio),works:c.works.map(w=>({...w,media:w.media.map(media)}))};}

export class ProfessionalHomepages {
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 enabled(){invariant(this.config.professionalHomepagesEnabled===true,'NOT_FOUND','主页功能尚未开放',404);}
 key(h:ProfessionalHomepage){return `homepage-draft:${h.workspaceId}:${h.id}`;}
 versionKey(v:HomepageVersion){return `homepage-version:${v.workspaceId}:${v.id}`;}
 previewDigest(p:{content:HomepageContent;dependencies:HomepageDependencies}){return digest({content:contentFacts(p.content),dependencies:{...p.dependencies,assets:p.dependencies.assets.map(({key:_,...a})=>a)}});}
 async owner(tx:Tx,actor:TalentActor,personId:string,grantId?:string){
  this.enabled();const m=new TalentMaintenance(this.clock,this.config),account=await m.account(tx,actor.workspaceId,actor.talentAccountId);
  invariant(account.sessionEpoch===actor.sessionEpoch,'AUTH_REQUIRED','人才账号会话已变化',401);
  const row=(await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId,personId,state:'ACTIVE'})).find(g=>g.relation==='SELF'&&(!grantId||g.id===grantId));if(!row)missing();
  const grant=await m.grant(tx,actor.workspaceId,actor.talentAccountId,row.id);if(grant.relation!=='SELF')missing();
  const person=await m.person(tx,actor.workspaceId,personId);if(person.status!=='ACTIVE')missing();
  for(const p of await tx.find('talentProfiles',{workspaceId:actor.workspaceId,personId})){
   const age=ageRange(p as unknown as Record<string,unknown>,this.clock.now().toISOString().slice(0,10));
   invariant(!age||age.min>=18,'HOMEPAGE_ADULT_REQUIRED','此档案需要监护授权，暂不能自行公开发布',409);
  }
  return {grant,person,account};
 }
 async access(tx:Tx,actor:TalentActor,id:string){
  const h=await workspaceRow(tx,'professionalHomepages',id,actor.workspaceId);if(!h||h.state==='ERASED'||h.talentAccountId!==actor.talentAccountId)missing();
  // Root grantId is the immutable original authorization. The same confirmed SELF
  // account may regain maintenance after an explicit grant renewal; publications
  // pin the exact current grant independently, so old versions never revive.
  await this.owner(tx,actor,h.personId);return h;
 }
 draft(h:ProfessionalHomepage):HomepageDraft {if(!h.draftCiphertext)missing();return homepageDraftSchema.parse(JSON.parse(decryptDraftPayload(h.draftCiphertext,this.config.contactKey,this.key(h))));}
 payload(v:HomepageVersion):HomepageContent {if(!v.contentCiphertext)missing();const p=JSON.parse(decryptDraftPayload(v.contentCiphertext,this.config.contactKey,this.versionKey(v))) as HomepageContent;invariant(digest({content:p,dependencies:v.dependencies})===v.contentDigest,'HOMEPAGE_CONTENT_INVALID','主页版本不可用',503);return p;}
 async options(tx:Tx,actor:TalentActor,personId:string){
  const {grant}=await this.owner(tx,actor,personId),data=await new SupplierProfiles(this.clock,this.config).profile(tx,actor,personId),works=await portalWorkCases(tx,actor,personId,this.clock,this.config);
  const contacts=[];for(const e of grant.selfExposureManifest.filter(e=>e.kind==='contact')){
   const c=await workspaceRow(tx,'contacts',e.targetId,actor.workspaceId);if(!c||c.personId!==personId)continue;
   const value=decryptContact(c.ciphertext,this.config.contactKey,`${actor.workspaceId}:${personId}:${c.id}`);
   if(data.profile.contacts.some(p=>p.kind===c.kind&&p.value===value))contacts.push({id:c.id,kind:c.kind,value});
  }
  const dictionary=(await tx.find('dictionary',{workspaceId:actor.workspaceId,status:'ACTIVE'})).filter(d=>['role','city','language'].includes(d.namespace)).map(d=>({namespace:d.namespace,code:d.code,label:d.labelZh}));
  dictionary.push(...(await tx.find('capabilityDefinitions',{workspaceId:actor.workspaceId,status:'ACTIVE'})).map(d=>({namespace:'skill' as const,code:d.code,label:d.labelZh})));
  return {personId,displayName:data.profile.displayName,intro:data.profile.intro,roleCodes:data.profile.roleCodes,cityCodes:data.profile.locationCodes,skillCodes:data.profile.skillCodes,languageCodes:data.profile.languageCodes,measurements:data.profile.measurements,roles:works.roles,assets:works.assets,works:works.works,contacts,dictionary,consentVersion:HOMEPAGE_CONSENT_VERSION};
 }
 async project(tx:Tx,actor:TalentActor,personId:string,input:HomepageDraft,slug:string){
  const d=homepageDraftSchema.parse(input),{grant,person}=await this.owner(tx,actor,personId),o=await this.options(tx,actor,personId);
  for(const list of [d.contactIds,d.skillCodes,d.languageCodes,d.measurementFields,d.works.map(w=>w.creditId)])invariant(unique(list),'HOMEPAGE_DUPLICATE','主页选择不能重复',422);
  const role=await workspaceRow(tx,'personRoles',d.personRoleId,actor.workspaceId);
  invariant(role&&role.personId===personId&&role.status==='ACTIVE'&&o.roles.some(r=>r.id===role.id)&&o.roleCodes.includes(role.roleCode),'HOMEPAGE_ROLE_REQUIRED','请选择本人当前已确认的职业',422);
  invariant(o.displayName.trim().length>0,'HOMEPAGE_NAME_REQUIRED','请先确认本人姓名',422);
  invariant(!d.cityCode||o.cityCodes.includes(d.cityCode),'HOMEPAGE_FIELD_UNAVAILABLE','城市不在当前本人资料中',409);
  invariant(d.skillCodes.every(c=>o.skillCodes.includes(c))&&d.languageCodes.every(c=>o.languageCodes.includes(c)),'HOMEPAGE_FIELD_UNAVAILABLE','能力或语言已变化，请重新选择',409);
  invariant(!d.measurementFields.length||role.roleCode==='model','HOMEPAGE_MEASUREMENTS_DENIED','身体数据仅能由模特本人逐项选择公开',422);
  const label=(namespace:string,code:string)=>o.dictionary.find(d=>d.namespace===namespace&&d.code===code)?.label??code;
  const selected:Exposure[]=[],sources=new Set<string>([role.sourceId]);
  const select=(kind:string,targetId:string,field?:string,expectedDigest?:string)=>{const e=grant.selfExposureManifest.find(e=>e.kind===kind&&e.targetId===targetId&&(!field||e.field===field)&&(!expectedDigest||e.valueDigest===expectedDigest));if(!e)missing();if(!selected.some(s=>digest(s)===digest(e)))selected.push(e);sources.add(e.sourceId);return e;};
  select('person',personId,'displayName',digest(o.displayName));if(d.includeIntro)select('person',personId,'intro',digest(o.intro));select('personRoles',role.id,'roleCode',digest(role.roleCode));
  for(const [kind,field,codes] of [['talentLocations','locationCode',d.cityCode?[d.cityCode]:[]],['personCapabilities','capabilityCode',d.skillCodes],['personLanguages','languageCode',d.languageCodes]] as const){
   for(const code of codes){let found=false;for(const e of grant.selfExposureManifest.filter(e=>e.kind===kind&&e.field===field&&e.valueDigest===digest(code))){const r=await tx.get(kind,e.targetId),source=await tx.get('sources',e.sourceId);if(r&&r.personId===personId&&r.status==='ACTIVE'&&!(kind==='personCapabilities'&&'personRoleId' in r&&r.personRoleId)&&(r as unknown as Record<string,unknown>)[field]===code&&source?.revision===e.sourceRevision&&sourceCurrent(source,this.clock)){select(kind,e.targetId,field,digest(code));sources.add(r.sourceId);found=true;break;}}if(!found)missing();}
  }
  const contacts=d.contactIds.map(id=>{const c=o.contacts.find(c=>c.id===id);if(!c)missing();select('contact',id,undefined,digest({kind:c.kind,value:c.value}));return {kind:c.kind,value:c.value};});
  const casting=(await tx.find('castingProfiles',{workspaceId:actor.workspaceId,personId})).find(c=>!c.supersededById);
  const measurements=d.measurementFields.map(field=>{const value=(o.measurements as Record<string,unknown>)[field];invariant(value!==null&&value!==undefined&&casting?.currentMeasurementSetId,'HOMEPAGE_FIELD_UNAVAILABLE','该身体数据尚未确认',409);select('measurementSets',casting.currentMeasurementSetId,field,digest(value));return {label:measureLabels[field]!,value:String(value)};});
  const assets:HomepageDependencies['assets']=[],credits:HomepageDependencies['credits']=[];
  const media=async(id:string,workId:string|null=null,workAssetId:string|null=null)=>{
   const f=await talentFormalAsset(tx,actor,id,this.clock,this.config);invariant(f.relation.personId===personId&&(!f.relation.personRoleId||f.relation.personRoleId===role.id),'HOMEPAGE_MEDIA_UNAVAILABLE','素材不属于本人的当前职业',409);
   const exposed=await mediaExposure(tx,grant,'mediaAsset',id,this.clock,this.config);select('mediaAsset',id,undefined,exposed.valueDigest);sources.add(f.relation.sourceId!);
   let item=assets.find(a=>a.id===id&&a.workId===workId);if(!item){item={key:randomBytes(16).toString('hex'),id,workId,workAssetId,sha256:f.asset.sha256,objectToken:f.asset.objectToken,previewHash:f.asset.previewHash};assets.push(item);}
   return {key:item.key,mime:f.asset.mime,url:`/api/v1/public/homepages/${slug}/media/${item.key}/${f.asset.mime==='video/mp4'?'playback':f.asset.mime==='application/pdf'?'attachment':'preview'}`};
  };
  const cover=d.coverAssetId?await media(d.coverAssetId):null;invariant(!cover||cover.mime.startsWith('image/'),'HOMEPAGE_COVER_INVALID','请选择图片作为封面',422);
  const portfolio=d.portfolioAssetId?await media(d.portfolioAssetId):null;invariant(!portfolio||portfolio.mime==='application/pdf','HOMEPAGE_PDF_INVALID','作品集附件须为 PDF',422);
  const works:HomepageContent['works']=[];
  for(const ref of d.works){
   invariant(unique(ref.assetIds),'HOMEPAGE_DUPLICATE','作品素材不能重复',422);
   const w=o.works.find(w=>w.credit.id===ref.creditId);invariant(w&&w.credit.personRoleId===role.id&&w.credit.roleCode===role.roleCode&&w.origin!=='UNKNOWN','HOMEPAGE_WORK_UNAVAILABLE','请选择当前职业、来源明确的本人作品',409);
   const credit=(await tx.get('workCredits',ref.creditId))!,work=(await tx.get('works',w.id))!;
   invariant(credit.sourceId&&credit.personRoleId,'HOMEPAGE_WORK_UNAVAILABLE','作品须有精确职业和署名来源',409);
   let exactExposure:Exposure|undefined;for(const e of grant.selfExposureManifest.filter(e=>e.kind==='workCredit'&&e.targetId===credit.id)){try{const current=await currentWorkExposure(tx,grant,e,this.clock,this.config);if(current.valueDigest===e.valueDigest&&current.sourceId===e.sourceId&&current.sourceRevision===e.sourceRevision){exactExposure=e;break;}}catch(error){if((error as {status?:number}).status!==404)throw error;}}
   if(!exactExposure)missing();select('workCredit',credit.id,undefined,exactExposure.valueDigest);sources.add(work.sourceId);sources.add(credit.sourceId);
   credits.push({id:credit.id,workId:work.id,personRoleId:credit.personRoleId,roleCode:credit.roleCode,sourceId:credit.sourceId,noteDigest:digest(credit.note)});
   const entries=[];for(const id of ref.assetIds){const item=w.items.find(i=>i.assetId===id);invariant(item,'HOMEPAGE_MEDIA_UNAVAILABLE','作品素材已变化，请重新选择',409);entries.push(await media(id,w.id,item.id));}
   const externalUrl=homepageExternalUrl(ref.externalUrl);invariant(entries.length>0||externalUrl,'HOMEPAGE_WORK_EMPTY','每个作品至少选择一项素材或填写外部作品链接',422);
   works.push({title:w.title,description:w.description,responsibility:label('role',role.roleCode)+(credit.note?' · '+credit.note:''),date:w.caseDate??'',brand:w.brandDisplayName??'',media:entries,externalUrl});
  }
  const sourceRows=[];for(const id of sources){const s=await workspaceRow(tx,'sources',id,actor.workspaceId);if(!s||!sourceCurrent(s,this.clock)||await deletionBlocked(tx,actor.workspaceId,'SOURCE',id))missing();await requireExposureBasis(tx,s,this.clock);sourceRows.push({id,revision:s.revision});}
  const content:HomepageContent={displayName:o.displayName,role:label('role',role.roleCode),city:label('city',d.cityCode),intro:d.includeIntro?o.intro:'',skills:d.skillCodes.map(c=>label('skill',c)),languages:d.languageCodes.map(c=>label('language',c)),measurements,contacts,cover,portfolio,works};
  const dependencies:HomepageDependencies={grantId:grant.id,grantEpoch:grant.authorizationEpoch,protectionEpoch:person.protectionEpoch,exposures:selected,sources:sourceRows,credits,assets};
  return {content,dependencies};
 }
 async create(tx:Tx,actor:TalentActor,input:unknown){
  const d=HomepageSchemas.create.parse(input),{grant}=await this.owner(tx,actor,d.personId);
  invariant(!(await tx.find('professionalHomepages',{workspaceId:actor.workspaceId,personId:d.personId})).some(h=>h.state!=='ERASED'),'HOMEPAGE_EXISTS','该人物已有固定主页，请打开原主页继续编辑',409);
  const h:ProfessionalHomepage={...base(actor.workspaceId,this.clock),personId:d.personId,talentAccountId:actor.talentAccountId,grantId:grant.id,slug:randomBytes(18).toString('base64url'),state:'DRAFT',draftCiphertext:null,currentVersionId:null,sourceIds:[],workIds:[],assetIds:[]};
  const p=await this.project(tx,actor,d.personId,d.draft,h.slug);this.putDraft(h,d.draft,p.dependencies);await tx.insert('professionalHomepages',h);return h;
 }
 putDraft(h:ProfessionalHomepage,d:HomepageDraft,p:HomepageDependencies){h.draftCiphertext=encryptDraftPayload(JSON.stringify(d),this.config.contactKey,this.key(h));h.sourceIds=[...new Set([...h.sourceIds,...p.sources.map(s=>s.id)])];h.workIds=[...new Set([...h.workIds,...p.credits.map(c=>c.workId)])];h.assetIds=[...new Set([...h.assetIds,...p.assets.map(a=>a.id)])];}
 async save(tx:Tx,actor:TalentActor,id:string,input:unknown){const d=HomepageSchemas.save.parse(input),h=await this.access(tx,actor,id);cas(h,d.expectedRevision);const p=await this.project(tx,actor,h.personId,d.draft,h.slug),next=touch(h,this.clock);this.putDraft(next,d.draft,p.dependencies);await tx.replace('professionalHomepages',next);return next;}
 async get(tx:Tx,actor:TalentActor,id:string){const h=await this.access(tx,actor,id),versions=(await tx.find('homepageVersions',{workspaceId:h.workspaceId,homepageId:id})).sort((a,b)=>b.versionNumber-a.versionNumber);let needsReview=false,hasUnpublishedChanges=false;try{const latest=await this.project(tx,actor,h.personId,this.draft(h),h.slug),live=versions.find(v=>v.id===h.currentVersionId);hasUnpublishedChanges=!!live&&digest(contentFacts(latest.content))!==digest(contentFacts(this.payload(live)));}catch(error){if(![404,409,422].includes((error as {status?:number}).status??0))throw error;needsReview=true;}return {id:h.id,personId:h.personId,revision:h.revision,state:h.state,slug:h.slug,url:new URL('/p/'+h.slug,this.config.origin).href,draft:this.draft(h),needsReview,hasUnpublishedChanges,currentVersionId:h.currentVersionId,versions:versions.map(v=>({id:v.id,versionNumber:v.versionNumber,state:v.state,expiresAt:v.expiresAt,publishedAt:v.createdAt}))};}
 async exportSelection(tx:Tx,actor:TalentActor,id:string){const h=await this.access(tx,actor,id),p=await this.project(tx,actor,h.personId,this.draft(h),h.slug);return {format:'once-personal-homepage-selection-v1',generatedAt:this.clock.now().toISOString(),homepageUrl:new URL('/p/'+h.slug,this.config.origin).href,state:h.state,selection:contentFacts(p.content)};}
 async signal(tx:Tx,actor:TalentActor,id:string){const h=await this.access(tx,actor,id);return {id:h.id,revision:h.revision};}
 async activity(tx:Tx,actor:TalentActor,id:string){await this.access(tx,actor,id);const rows=await tx.find('audits',{workspaceId:actor.workspaceId,resourceId:id,resourceKind:'professionalHomepage'}),count=(action:string)=>rows.filter(r=>r.action===action).length;return {linkCopies:count('portal.homepage.copyLink'),qrDownloadClicks:count('portal.homepage.qrDownload'),pageReads:count('homepage.public.read'),inquiries:'NOT_COLLECTED',note:'页面读取含预加载、重复打开和调试；复制或下载点击不代表真实外发，也不代表咨询。'};}
 async list(tx:Tx,actor:TalentActor){this.enabled();const items=[];for(const h of await tx.find('professionalHomepages',{workspaceId:actor.workspaceId,talentAccountId:actor.talentAccountId}))if(h.state!=='ERASED'){try{items.push(await this.get(tx,actor,h.id));}catch(e){if((e as {status?:number}).status!==404)throw e;}}return {items};}
 async preview(tx:Tx,actor:TalentActor,id:string){const h=await this.access(tx,actor,id),p=await this.project(tx,actor,h.personId,this.draft(h),h.slug);return {previewDigest:this.previewDigest(p),...p.content,cover:p.content.cover?{...p.content.cover,url:this.privateMedia(actor,p.dependencies,p.content.cover.key,p.content.cover.mime)}:null,portfolio:p.content.portfolio?{...p.content.portfolio,url:this.privateMedia(actor,p.dependencies,p.content.portfolio.key,p.content.portfolio.mime)}:null,works:p.content.works.map(w=>({...w,media:w.media.map(m=>({...m,url:this.privateMedia(actor,p.dependencies,m.key,m.mime)}))}))};}
 privateMedia(actor:TalentActor,p:HomepageDependencies,key:string,mime:string){const a=p.assets.find(a=>a.key===key)!;const contentPart=p.assets.find(x=>x.key===key);if(!contentPart)missing();return `/api/v1/portal/accounts/${actor.talentAccountId}/assets/${a.id}/${mime==='video/mp4'?'playback':mime==='application/pdf'?'attachment':'preview'}`;}
 async publish(tx:Tx,actor:TalentActor,id:string,input:unknown){
  const d=HomepageSchemas.publish.parse(input),h=await this.access(tx,actor,id);cas(h,d.expectedRevision);
  invariant(d.publicAccepted&&d.mediaRightsAccepted&&d.adultDeclared,'HOMEPAGE_PUBLIC_CONSENT_REQUIRED','请本人确认成年、公开字段和所选作品的公开展示权',422);
  invariant(Date.parse(d.expiresAt)>this.clock.now().getTime()&&Date.parse(d.expiresAt)<=this.clock.now().getTime()+366*86400000,'HOMEPAGE_EXPIRY_INVALID','公开许可须在未来一年内到期',422);
  const p=await this.project(tx,actor,h.personId,this.draft(h),h.slug),previous=await tx.find('homepageVersions',{workspaceId:h.workspaceId,homepageId:id});invariant(previous.length<100,'HOMEPAGE_VERSION_LIMIT','主页版本数已达上限',422);
  invariant(this.previewDigest(p)===d.previewDigest,'HOMEPAGE_PREVIEW_STALE','源资料或授权已变化，请重新预览并确认后发布',409);
  const consent={...base(h.workspaceId,this.clock),talentAccountId:actor.talentAccountId,personId:h.personId,claimId:null,purpose:'PUBLIC_PROFILE',textVersion:HOMEPAGE_CONSENT_VERSION,fieldScope:['homepage:'+id,'selection:'+digest(p)],state:'ACTIVE',validUntil:d.expiresAt,revokedAt:null};await tx.insert('talentConsents',consent);
  const v:HomepageVersion={...base(h.workspaceId,this.clock),homepageId:id,versionNumber:Math.max(0,...previous.map(v=>v.versionNumber))+1,talentAccountId:actor.talentAccountId,sessionEpoch:actor.sessionEpoch,recoveryEpoch:this.config.recoveryEpoch,consentId:consent.id,expiresAt:d.expiresAt,state:'PUBLISHED',contentCiphertext:null,contentDigest:digest(p),dependencies:p.dependencies};
  v.contentCiphertext=encryptDraftPayload(JSON.stringify(p.content),this.config.contactKey,this.versionKey(v));invariant(Buffer.byteLength(v.contentCiphertext)<500000,'HOMEPAGE_CONTENT_LIMIT','请减少作品文字和素材数量',422);
  for(const old of previous)if(old.state==='PUBLISHED')await tx.replace('homepageVersions',{...touch(old,this.clock),state:'REVOKED'});
  await tx.insert('homepageVersions',v);const next={...touch(h,this.clock),state:'PUBLISHED' as const,currentVersionId:v.id};await tx.replace('professionalHomepages',next);return next;
 }
 async unpublish(tx:Tx,actor:TalentActor,id:string,input:unknown){const d=HomepageSchemas.unpublish.parse(input),h=await this.access(tx,actor,id);cas(h,d.expectedRevision);for(const v of await tx.find('homepageVersions',{workspaceId:h.workspaceId,homepageId:id}))if(v.state==='PUBLISHED'){await tx.replace('homepageVersions',{...touch(v,this.clock),state:'REVOKED'});const c=await tx.get('talentConsents',v.consentId);if(c&&c.state==='ACTIVE')await tx.replace('talentConsents',{...touch(c,this.clock),state:'REVOKED',revokedAt:this.clock.now().toISOString()});}const next={...touch(h,this.clock),state:'UNPUBLISHED' as const,currentVersionId:null};await tx.replace('professionalHomepages',next);return next;}
 async current(tx:Tx,slug:string){
  this.enabled();if(!/^[A-Za-z0-9_-]{24}$/.test(slug))missing();const h=(await tx.find('professionalHomepages',{slug}))[0];if(!h||h.state!=='PUBLISHED'||!h.currentVersionId)missing();
  const v=await workspaceRow(tx,'homepageVersions',h.currentVersionId,h.workspaceId);if(!v||v.homepageId!==h.id||v.state!=='PUBLISHED'||v.recoveryEpoch!==this.config.recoveryEpoch||v.expiresAt<=this.clock.now().toISOString())missing();
  const actor:TalentActor={actorKind:'TALENT',workspaceId:h.workspaceId,talentAccountId:h.talentAccountId,sessionEpoch:v.sessionEpoch,sessionId:''};
  let own:Awaited<ReturnType<ProfessionalHomepages['owner']>>;
  try{own=await this.owner(tx,actor,h.personId,v.dependencies.grantId);}catch(error){if(error instanceof AppError&&[401,403,404,409].includes(error.status))missing();throw error;}
  const dep=v.dependencies;
  if(own.grant.authorizationEpoch!==dep.grantEpoch||own.person.protectionEpoch!==dep.protectionEpoch)missing();
  const c=await workspaceRow(tx,'talentConsents',v.consentId,h.workspaceId);if(!c||c.talentAccountId!==h.talentAccountId||c.personId!==h.personId||c.purpose!=='PUBLIC_PROFILE'||c.state!=='ACTIVE'||c.textVersion!==HOMEPAGE_CONSENT_VERSION||c.validUntil<=this.clock.now().toISOString()||!c.fieldScope.includes('selection:'+v.contentDigest))missing();
  for(const s of dep.sources){const row=await workspaceRow(tx,'sources',s.id,h.workspaceId);if(!row||row.revision!==s.revision||!sourceCurrent(row,this.clock)||await deletionBlocked(tx,h.workspaceId,'SOURCE',s.id))missing();await requireExposureBasis(tx,row,this.clock);}
  // The independent PUBLIC_PROFILE consent grants this frozen selection. A normal
  // internal text edit does not revoke it; explicit public consent, grant or source
  // withdrawal does. Media and exact credits also have live checks below.
  for(const expected of dep.credits){const c=await workspaceRow(tx,'workCredits',expected.id,h.workspaceId),w=await workspaceRow(tx,'works',expected.workId,h.workspaceId);if(!c||!w||w.status!=='ACTIVE'||w.origin==='UNKNOWN'||await deletionBlocked(tx,h.workspaceId,'WORK',w.id)||c.personId!==h.personId||c.workId!==w.id||c.personRoleId!==expected.personRoleId||c.roleCode!==expected.roleCode||c.sourceId!==expected.sourceId||digest(c.note)!==expected.noteDigest||!await exactCreditCurrent(tx,c,this.clock))missing();}
  for(const expected of dep.assets){const f=await talentFormalAsset(tx,actor,expected.id,this.clock,this.config);if(f.relation.personId!==h.personId||f.asset.sha256!==expected.sha256||f.asset.objectToken!==expected.objectToken||f.asset.previewHash!==expected.previewHash)missing();if(expected.workAssetId){const wa=await workspaceRow(tx,'workAssets',expected.workAssetId,h.workspaceId);if(!wa||wa.assetId!==expected.id||wa.workId!==expected.workId)missing();}}
  return {h,v,actor};
 }
 async publicRead(tx:Tx,slug:string){const c=await this.current(tx,slug);return this.payload(c.v);}
 async publicMedia(tx:Tx,slug:string,key:string){const c=await this.current(tx,slug),item=c.v.dependencies.assets.find(a=>a.key===key);if(!item)missing();const f=await talentFormalAsset(tx,c.actor,item.id,this.clock,this.config);return {asset:f.asset,workspace:c.h.workspaceId,actor:'HOMEPAGE:'+c.h.id};}
}
