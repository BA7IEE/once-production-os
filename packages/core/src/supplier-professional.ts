import {randomUUID} from 'node:crypto';
import type {Actor,Clock,Config,Person,Source,TableMap} from './model.ts';
import type {TalentActor} from './talent-auth-model.ts';
import type {TalentAccessGrant,Exposure} from './talent-maintenance-model.ts';
import type {Tx} from './store.ts';
import {base,touch,cas,workspaceRow} from './helpers.ts';
import {digest,parseStrictJson} from './json.ts';
import {invariant,missing,AppError} from './errors.ts';
import {sourceCurrent,sourceFor,requirePermission,deletionBlocked} from './policy.ts';
import {td2PersonFor} from './talent-v2-graph.ts';
import {loadVisibility} from './visibility.ts';
import {requireExposureBasis} from './talent-exposure-basis.ts';
import {encryptDraftPayload,decryptDraftPayload} from './private-draft-payload.ts';
import {catalogView,ensureBuiltinCatalog,publishedCatalog} from './supplier-field-catalog.ts';
import {validateProfessional,ProfessionalDraftSchema} from './supplier-field-validation.ts';
import {answerKey,type ProfessionalAnswer,type ProfessionalDraft,type SupplierField,type ProfessionalRecord,type FieldComponent} from './supplier-field-contract.ts';
import type {SupplierFact} from './supplier-field-model.ts';
import {v,uuid,revision} from './validation.ts';
export const ProfessionalWriteSchema=v.object({expectedPersonRevision:revision,sourceId:uuid,sourceRevision:revision,professional:ProfessionalDraftSchema,
 replace:v.array(v.object({id:uuid,revision}),300)});
const isRoot=(r:SupplierFact)=>r.recordKey==='single';
const context=(r:SupplierFact)=>`supplier-fact:${r.workspaceId}:${r.personId}:${r.id}`;
export class SupplierProfessional{
 readonly clock:Clock;readonly config:Config;
 constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
 async validate(tx:Tx,workspaceId:string,roles:string[],input:unknown,previous?:ProfessionalDraft,internal=false){
  const raw=ProfessionalDraftSchema.parse(input),catalog=await publishedCatalog(tx,workspaceId,raw.catalogVersion);
  invariant(raw.catalogDigest===catalog.definitionDigest,'FIELD_CATALOG_CONFLICT','字段目录摘要不一致，请重新读取资料版本',409);
  return validateProfessional(raw,catalog.definition,roles,previous,internal);
 }
 async scalar(tx:Tx,row:SupplierFact){
  if(row.valueState!=='KNOWN')return undefined;
  switch(row.valueType){case 'TEXT':return parseStrictJson(decryptDraftPayload(row.textCiphertext!,this.config.contactKey,context(row)));case 'NUMBER':return row.numberValue;
   case 'BOOLEAN':return row.booleanValue;case 'DATE':return row.dateValue;case 'CODE':return row.codeValue;case 'CODE_SET':return (await tx.find('supplierFactChoices',{workspaceId:row.workspaceId,factId:row.id})).map(c=>c.code).sort();default:return undefined;}
 }
 async answer(tx:Tx,root:SupplierFact,all?:SupplierFact[]):Promise<ProfessionalAnswer>{
  const answer:ProfessionalAnswer={fieldCode:root.fieldCode,roleCode:root.roleCode,state:root.valueState};if(root.valueState!=='KNOWN')return answer;
  if(root.valueType!=='STATE')answer.value=await this.scalar(tx,root);
  else{const rows=(all??await tx.find('supplierFacts',{workspaceId:root.workspaceId,personId:root.personId,sourceId:root.sourceId,setId:root.setId,status:'ACTIVE'})).filter(r=>!isRoot(r)&&r.personRoleId===root.personRoleId&&r.sourceId===root.sourceId&&r.fieldCode===root.fieldCode&&r.setId===root.setId&&r.status==='ACTIVE');
   const records=new Map<string,ProfessionalRecord>();for(const r of rows){const record=records.get(r.recordKey)??{id:r.recordKey,values:{}};record.values[r.componentCode]=await this.scalar(tx,r);records.set(r.recordKey,record);}answer.value=[...records.values()].sort((a,b)=>a.id.localeCompare(b.id));}
  return answer;
 }
 async roleAvailable(tx:Tx,workspaceId:string,role:TableMap['personRoles']){
  if(role.workspaceId!==workspaceId||role.status!=='ACTIVE')return false;
  const evidence=(await tx.find('evidence',{workspaceId,personRoleId:role.id,fieldPath:'roleCode'})).filter(e=>e.valueDigest===digest(role.roleCode));
  const refs=evidence.length?evidence.map(e=>({id:e.sourceId,revision:e.sourceRevision})):[{id:role.sourceId,revision:null}];
  for(const ref of refs){const source=await workspaceRow(tx,'sources',ref.id,workspaceId);if(!source||ref.revision!==null&&source.revision!==ref.revision||!sourceCurrent(source,this.clock)||await deletionBlocked(tx,workspaceId,'SOURCE',source.id))continue;
   try{await requireExposureBasis(tx,source,this.clock);return true;}catch(e){if(!(e instanceof AppError&&e.status===404))throw e;}}
  return false;
 }
 async readable(tx:Tx,row:SupplierFact){
  if(row.status!=='ACTIVE')return false;const source=await workspaceRow(tx,'sources',row.sourceId,row.workspaceId);
  if(!source||source.revision!==row.sourceRevision||!sourceCurrent(source,this.clock)||await deletionBlocked(tx,row.workspaceId,'SOURCE',row.sourceId))return false;
  if(row.roleCode){const role=row.personRoleId?await tx.get('personRoles',row.personRoleId):null;if(!role||role.personId!==row.personId||role.workspaceId!==row.workspaceId||role.roleCode!==row.roleCode||role.status!=='ACTIVE')return false;
   // A role supplied by a different source also needs a current basis.
   if(!await this.roleAvailable(tx,row.workspaceId,role))return false;}
  try{await requireExposureBasis(tx,source,this.clock);}catch(e){if(e instanceof AppError&&e.status===404)return false;throw e;}return true;
 }
 async self(tx:Tx,actor:TalentActor,personId:string,grant:TalentAccessGrant):Promise<ProfessionalDraft|undefined>{
  const all=await tx.find('supplierFacts',{workspaceId:actor.workspaceId,personId,status:'ACTIVE'}),answers:ProfessionalAnswer[]=[];
  for(const e of grant.selfExposureManifest.filter(e=>e.kind==='supplierField')){const row=all.find(r=>r.id===e.targetId&&isRoot(r));
   if(!row||row.visibility!=='SELF_SHARED'||row.sourceId!==e.sourceId||row.sourceRevision!==e.sourceRevision||!await this.readable(tx,row))continue;
   const a=await this.answer(tx,row,all);if(e.field!==a.fieldCode||e.valueDigest!==digest(a))continue;answers.push(a);}
  if(!answers.length)return undefined;
  const current=await publishedCatalog(tx,actor.workspaceId);
  return {catalogVersion:current.version,catalogDigest:current.definitionDigest,answers};
 }
 async writeScalar(tx:Tx,seed:Omit<SupplierFact,'id'|'createdAt'|'updatedAt'|'revision'|'valueType'|'numberValue'|'booleanValue'|'dateValue'|'codeValue'|'textCiphertext'>,f:FieldComponent|SupplierField,value:unknown){
  const row:SupplierFact={...base(seed.workspaceId,this.clock),...seed,valueType:f.type==='RECORDS'?'STATE':f.type,numberValue:null,booleanValue:null,dateValue:null,codeValue:null,textCiphertext:null};
  if(seed.recordKey==='single')row.id=seed.setId;
  if(seed.valueState==='KNOWN'&&f.type!=='RECORDS'){
   if(f.type==='TEXT')row.textCiphertext=encryptDraftPayload(JSON.stringify(value),this.config.contactKey,context(row));
   else if(f.type==='NUMBER')row.numberValue=value as number;else if(f.type==='BOOLEAN')row.booleanValue=value as boolean;else if(f.type==='DATE')row.dateValue=value as string;else if(f.type==='CODE')row.codeValue=value as string;
  }
  await tx.insert('supplierFacts',row);if(f.type==='CODE_SET'&&seed.valueState==='KNOWN')for(const code of value as string[])await tx.insert('supplierFactChoices',{...base(seed.workspaceId,this.clock),factId:row.id,code});return row;
 }
 async retire(tx:Tx,root:SupplierFact){
  const rows=await tx.find('supplierFacts',{workspaceId:root.workspaceId,personId:root.personId,sourceId:root.sourceId,setId:root.setId,status:'ACTIVE'});
  for(const row of rows)if(row.setId===root.setId)await tx.replace('supplierFacts',{...touch(row,this.clock),status:'RETIRED'});
 }
 async apply(tx:Tx,person:Person,source:Source,data:ProfessionalDraft,retireIds:string[]=[],grant:TalentAccessGrant|null=null):Promise<Exposure[]>{
  await ensureBuiltinCatalog(tx,person.workspaceId,this.clock);const catalog=await publishedCatalog(tx,person.workspaceId,data.catalogVersion),exposures:Exposure[]=[];
  for(const id of retireIds){const root=await tx.get('supplierFacts',id);if(root&&root.workspaceId===person.workspaceId&&root.personId===person.id&&isRoot(root))await this.retire(tx,root);}
  // A self update may only retire exactly exposed values it actually replaces.
  for(const a of data.answers)if(grant)for(const e of grant.selfExposureManifest.filter(e=>e.kind==='supplierField'&&e.field===a.fieldCode)){
   const root=await tx.get('supplierFacts',e.targetId);if(root&&root.personId===person.id&&root.roleCode===a.roleCode&&root.visibility==='SELF_SHARED'&&await this.readable(tx,root)&&e.valueDigest===digest(await this.answer(tx,root)))await this.retire(tx,root);
  }
  for(const a of data.answers){
   const f=catalog.definition.fields.find(f=>f.code===a.fieldCode)!;
   let roleId:string|null=null;if(a.roleCode){const roles=await tx.find('personRoles',{workspaceId:person.workspaceId,personId:person.id,roleCode:a.roleCode,status:'ACTIVE'});
    for(const role of roles){if(await this.roleAvailable(tx,person.workspaceId,role)){roleId=role.id;break;}}
    invariant(roleId,'FIELD_ROLE_UNAVAILABLE','对应职业已不可用，请重新读取并确认职业',409);}
   const seed={workspaceId:person.workspaceId,personId:person.id,personRoleId:roleId,roleCode:a.roleCode,sourceId:source.id,sourceRevision:source.revision,catalogVersion:data.catalogVersion,setId:randomUUID(),fieldCode:a.fieldCode,recordKey:'single',componentCode:'value',valueState:a.state,status:'ACTIVE' as const,visibility:f.visibility};
   const root=await this.writeScalar(tx,seed,f,a.value);
   if(f.type==='RECORDS'&&a.state==='KNOWN')for(const record of a.value as ProfessionalRecord[])for(const c of f.components!)if(Object.hasOwn(record.values,c.code))await this.writeScalar(tx,{...seed,recordKey:record.id,componentCode:c.code,valueState:'KNOWN'},c,record.values[c.code]);
   if(f.visibility==='SELF_SHARED')exposures.push({kind:'supplierField',targetId:root.id,field:f.code,valueDigest:digest(a),sourceId:source.id,sourceRevision:source.revision});
  }return exposures;
 }
 async internal(tx:Tx,actor:Actor,personId:string){requirePermission(actor,'records.read');const person=await td2PersonFor(tx,actor,personId),visibility=await loadVisibility(tx,actor,this.clock),all=await tx.find('supplierFacts',{workspaceId:actor.workspaceId,personId,status:'ACTIVE'}),entries=[];
  for(const root of all.filter(isRoot)){if(!visibility.source(root.sourceId)||!await this.readable(tx,root))continue;const catalog=await publishedCatalog(tx,actor.workspaceId,root.catalogVersion),field=catalog.definition.fields.find(f=>f.code===root.fieldCode);if(!field)continue;
   entries.push({id:root.id,revision:root.revision,sourceId:root.sourceId,sourceRevision:root.sourceRevision,sourceTitle:visibility.source(root.sourceId)!.title,catalogVersion:root.catalogVersion,field,answer:await this.answer(tx,root,all)});}
  return {personId,revision:person.revision,catalog:catalogView(await publishedCatalog(tx,actor.workspaceId),true),entries};
 }
 async update(tx:Tx,actor:Actor,personId:string,input:unknown){requirePermission(actor,'records.write');const d=ProfessionalWriteSchema.parse(input),person=await td2PersonFor(tx,actor,personId);cas(person,d.expectedPersonRevision);
  invariant(new Set(d.replace.map(t=>t.id)).size===d.replace.length,'FIELD_REPLACEMENT_DUPLICATE','同一字段事实不能重复替换',422);
  const source=await sourceFor(tx,actor,d.sourceId,this.clock);cas(source,d.sourceRevision);const roles=(await tx.find('personRoles',{workspaceId:actor.workspaceId,personId,status:'ACTIVE'})).map(r=>r.roleCode);
  const priorAnswers:ProfessionalAnswer[]=[];for(const target of d.replace){const root=await workspaceRow(tx,'supplierFacts',target.id,actor.workspaceId);if(!root||root.personId!==personId||!isRoot(root)||!await this.readable(tx,root))missing();cas(root,target.revision);await sourceFor(tx,actor,root.sourceId,this.clock);priorAnswers.push(await this.answer(tx,root));}
  const data=await this.validate(tx,actor.workspaceId,roles,d.professional,{...d.professional,answers:priorAnswers},true);
  const replacementKeys=new Set(data.answers.map(answerKey));
  invariant(priorAnswers.every(a=>replacementKeys.has(answerKey(a))),'FIELD_REPLACEMENT_REQUIRED','被替换的字段必须明确提供对应人物或职业的新值或清空状态',422);
  const exposedGrants=await tx.find('talentAccessGrants',{workspaceId:actor.workspaceId,personId,state:'ACTIVE'}),newExposure=await this.apply(tx,person,source,data,d.replace.map(r=>r.id));
  for(const g of exposedGrants){const old=g.selfExposureManifest.filter(e=>e.kind==='supplierField'&&d.replace.some(r=>r.id===e.targetId));if(!old.length)continue;
   const keys=new Set(priorAnswers.filter((_,i)=>old.some(e=>e.targetId===d.replace[i]?.id)).map(answerKey));
   const additions=[];for(const e of newExposure){const root=(await tx.get('supplierFacts',e.targetId))!;if(keys.has(answerKey({fieldCode:e.field,roleCode:root.roleCode})))additions.push(e);}
   await tx.replace('talentAccessGrants',{...touch(g,this.clock),selfExposureManifest:[...g.selfExposureManifest.filter(e=>!old.includes(e)),...additions]});}
  const next=touch(person,this.clock);await tx.replace('people',next);return next;
 }
}
