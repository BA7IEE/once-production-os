import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentManifest,validateDocumentProposal,DocumentProposalSchema} from '../../packages/core/src/document-schema.ts';
import {documentFixture} from '../support/documents.ts';
import {DEFAULT_SUPPLIER_FIELD_CATALOG} from '../../packages/core/src/supplier-field-defaults.ts';
import {digest} from '../../packages/core/src/json.ts';

test('document proposal preserves separate facts, images, work credits and original evidence',()=>{
 const {manifest,proposal,dictionary}=documentFixture();
 assert.deepEqual(validateDocumentManifest(manifest),manifest);
 assert.deepEqual(validateDocumentProposal(proposal,manifest,dictionary),proposal);
});
test('company brochures and shoot briefs cannot become people, credentials, work authorship or supplier portraits',()=>{
 const {manifest,proposal,dictionary}=documentFixture();dictionary.subjectPolicy='SUPPLIER_SUBJECT_V2';
 for(const documentKind of ['COMPANY_PROFILE','SHOOT_BRIEF','UNKNOWN'] as const){const p={...proposal,documentKind,subjectAssociation:'UNCERTAIN' as const};assert.throws(()=>validateDocumentProposal(p,manifest,dictionary));
  const safe={...p,fields:[],works:[],images:[]};assert.equal(validateDocumentProposal(safe,manifest,dictionary).fields.length,0);}
 assert.throws(()=>validateDocumentProposal(proposal,manifest,dictionary),'new intake requires an explicit material and subject classification');
});
test('AI maps controlled professional fields while preserving career boundaries and rejecting invented or internal terms',()=>{
 const {manifest,proposal,dictionary}=documentFixture();dictionary.professional={version:1,digest:digest(DEFAULT_SUPPLIER_FIELD_CATALOG),definition:DEFAULT_SUPPLIER_FIELD_CATALOG};
 const p={...proposal,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',professionalFields:[{key:'focus',fieldCode:'production.focus',roleCode:'director',value:['commercial'],evidence:proposal.fields[0]!.evidence}]};
 assert.equal(validateDocumentProposal(p,manifest,dictionary).professionalFields!.length,1);
 for(const item of [{...p.professionalFields[0],value:['made_up']},{...p.professionalFields[0],fieldCode:'camera.duties',value:['dp']},{...p.professionalFields[0],fieldCode:'internal.relationship_tags',roleCode:null,value:['contacted']}])assert.throws(()=>validateDocumentProposal({...p,professionalFields:[item]},manifest,dictionary));
});
test('native AI suggestions preserve explicit units, registered levels and unverified qualification claims',()=>{
 const {manifest,proposal,dictionary}=documentFixture();dictionary.native={capabilities:[{code:'editing',label:'合成剪辑工具',applicableRoleCodes:['director'],levelSchemeCode:'ABILITY_5'}],languages:[{code:'zh',label:'中文'},{code:'en',label:'英语'}]};
 const p={...proposal,documentKind:'PERSON_PROFILE',subjectAssociation:'EXPLICIT_AUTHOR',nativeFields:[{key:'native',field:'capabilityDetails',value:[{roleCode:'director',capabilityCode:'editing',levelCode:'WORKING'}],evidence:proposal.fields[0]!.evidence}]};
 assert.equal(validateDocumentProposal(p,manifest,dictionary).nativeFields!.length,1);
 const variant=(field:string,value:unknown)=>({...p,nativeFields:[{...p.nativeFields[0],field,value}]});
 assert.throws(()=>validateDocumentProposal(variant('capabilityDetails',[{roleCode:'director',capabilityCode:'editing',levelCode:'NATIVE'}]),manifest,dictionary));
 assert.throws(()=>validateDocumentProposal(variant('measurementDetails',{shoeSizeValue:'39'}),manifest,dictionary));
 assert.doesNotThrow(()=>validateDocumentProposal(variant('measurementDetails',{shoeSizeValue:'39',shoeSizeSystem:'EU'}),manifest,dictionary));
 assert.throws(()=>validateDocumentProposal(variant('credentials',[{roleCode:'director',credentialTypeCode:'OTHER',credentialName:'Synthetic claim',issuerName:null,issuedOn:null,expiresOn:null,status:'VERIFIED'}]),manifest,dictionary));
});
test('shape-correct proposals cannot cite unprocessed pages, fabricated quotes or nonexistent images',()=>{
 for(const mutate of [
  (p:any)=>{p.fields[0].evidence[0].page=2;},
  (p:any)=>{p.fields[0].evidence[0].quote='Invented person';},
  (p:any)=>{p.works[0].imageKeys=['missing'];},
  (p:any)=>{p.works[0].roleCode='invented-role';},
  (p:any)=>{p.images[0].page=2;},
  (p:any)=>{p.unknowns=[{targetKey:'missing',field:'role',reason:'Unknown'}];}
 ]){
  const {manifest,proposal,dictionary}=documentFixture();mutate(proposal);
  assert.throws(()=>validateDocumentProposal(proposal,manifest,dictionary));
 }
});
test('visual text requires a usable location; unsupported dictionary wording stays an explicit unknown',()=>{
 const {manifest,proposal,dictionary}=documentFixture();
 proposal.fields[0]!.evidence=[{page:1,bbox:[0.1,0.1,0.8,0.2],kind:'VISUAL',quote:null}];
 proposal.unknowns=[{targetKey:null,field:'locationCodes',reason:'Unmapped city in original material'}];
 assert.equal(validateDocumentProposal(proposal,manifest,dictionary).unknowns.length,1);
 proposal.fields[0]!.evidence[0]!.bbox=null;
 assert.throws(()=>validateDocumentProposal(proposal,manifest,dictionary));
});
test('typed field values, dictionary codes, region bounds and unique candidate keys are enforced',()=>{
 for(const mutate of [
  (p:any)=>{p.fields[0].value={name:'Lin He'};},
  (p:any)=>{p.fields[0].field='heightCm';p.fields[0].value=999;},
  (p:any)=>{p.fields[0].field='roleCodes';p.fields[0].value=['invented'];},
  (p:any)=>{p.fields.push({...p.fields[0],key:'name2'});},
  (p:any)=>{p.images[0].key='name';},
  (p:any)=>{p.images[0].bbox=[0.8,0.2,0.1,0.5];},
  (p:any)=>{p.images[0].bbox=[-0.1,0,1,1];},
  (p:any)=>{p.execute='tool call';}
 ]){
  const {manifest,proposal,dictionary}=documentFixture();mutate(proposal);
  assert.throws(()=>validateDocumentProposal(proposal,manifest,dictionary));
 }
});
test('partial and failed page coverage cannot be presented as a complete document',()=>{
 const {manifest}=documentFixture();manifest.totalPages=2;
 assert.throws(()=>validateDocumentManifest(manifest));
 manifest.status='PARTIAL';assert.equal(validateDocumentManifest(manifest).status,'PARTIAL');
 manifest.requestedPages=[1,2];assert.throws(()=>validateDocumentManifest(manifest));
 manifest.failedPages=[{page:2,code:'PAGE_EXTRACTION_FAILED'}];assert.equal(validateDocumentManifest(manifest).failedPages.length,1);
 manifest.pages[0]!.image.file='../outside.png';assert.throws(()=>validateDocumentManifest(manifest));
});
test('new document schema does not admit arbitrary nested values or future schema versions',()=>{
 const {proposal}=documentFixture();
 assert.throws(()=>DocumentProposalSchema.parse({...proposal,schemaVersion:'future'}));
 assert.throws(()=>DocumentProposalSchema.parse({...proposal,works:[{...proposal.works[0],personId:'other-person'}]}));
});
