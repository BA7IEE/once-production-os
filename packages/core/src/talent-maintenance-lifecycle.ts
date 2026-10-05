import type {Actor,Clock,Table} from './model.ts';
import type {Tx} from './store.ts';
import {touch} from './helpers.ts';
import {digest} from './json.ts';
import {scopeVisible} from './policy.ts';
export const MAINTENANCE_TABLES=['personMedia','talentInvitations','talentInvitationContexts','talentClaims','talentAccessGrants','talentConsents','talentSubmissions','talentSubmissionItems','sourceAttributions','sourceUseBases'] as const;
export async function maintenanceSnapshot(tx:Tx,workspaceId:string,personIds?:string[]){
 const data:Record<string,Record<string,unknown>[]>={};for(const table of MAINTENANCE_TABLES)data[table]=(await tx.find(table,{workspaceId})).map(r=>({...r})).sort((a,b)=>a.id.localeCompare(b.id));
 if(personIds){const ids=new Set(personIds);data.personMedia=data.personMedia!.filter(r=>ids.has(String(r.personId)));for(const t of ['talentInvitations','talentClaims','talentAccessGrants','talentConsents','talentSubmissions'])data[t]=data[t]!.filter(r=>ids.has(String(r.personId??r.targetPersonId??r.proposedPersonId)));const invitations=new Set(data.talentInvitations!.map(r=>r.id)),submissions=new Set(data.talentSubmissions!.map(r=>r.id)),consents=new Set(data.talentConsents!.map(r=>r.id));data.talentInvitationContexts=data.talentInvitationContexts!.filter(r=>invitations.has(r.invitationId));data.talentSubmissionItems=data.talentSubmissionItems!.filter(r=>submissions.has(r.submissionId));data.sourceAttributions=data.sourceAttributions!.filter(r=>submissions.has(r.submissionId));data.sourceUseBases=data.sourceUseBases!.filter(r=>consents.has(r.consentId)||submissions.has(r.submissionId));}
 return {data,digest:digest(data),count:Object.values(data).reduce((sum,r)=>sum+r.length,0)};
}
export async function maintenanceScopeBlocker(tx:Tx,actor:Actor,data:Record<string,Record<string,unknown>[]>,mode:'ALL'|'MERGE_CURRENT'='ALL'){
 // STAGED material on either merge root retains the original upload review scope,
 // including rejected/partial submissions whose text decision is already closed.
 if(mode==='MERGE_CURRENT')for(const r of data.personMedia??[])if(r.usageState==='STAGED'){
  const asset=await tx.get('assets',String(r.assetId)),upload=asset?await tx.get('uploads',asset.uploadId):null;
  if(!upload||!await scopeVisible(tx,actor,upload.scopeId))return 'TALENT_MAINTENANCE_HIDDEN_DEPENDENCY';
 }
 for(const [table,rows] of Object.entries(data))for(const r of rows){
  // Merge retains the complete history in its digest and revokes external access.
  // Closed intake records are not authority over formal Person/Source media.
  // Pending claims, open submissions and active invitations still need intake scope.
  const historical=table==='talentClaims'&&['APPROVED','REJECTED','WITHDRAWN','EXPIRED'].includes(String(r.state))&&!r.reserved
   ||table==='talentInvitations'&&['CLAIMED','EXHAUSTED','REVOKED','EXPIRED'].includes(String(r.state))
   ||table==='talentSubmissions'&&['APPROVED','PARTIALLY_APPROVED','REJECTED','WITHDRAWN','EXPIRED'].includes(String(r.state));
  if(mode==='MERGE_CURRENT'&&historical)continue;
  if(typeof r.scopeId==='string'&&!await scopeVisible(tx,actor,r.scopeId))return 'TALENT_MAINTENANCE_HIDDEN_DEPENDENCY';
 }return null;
}
/** Existing merge's explicit revocation acknowledgement also closes external access on BOTH
 * roots. No account is silently transferred; retained submissions cannot read the merged alias. */
export async function revokePersonMaintenance(tx:Tx,workspaceId:string,personIds:string[],clock:Clock,erase=false){const ids=new Set(personIds);
 for(const g of await tx.find('talentAccessGrants',{workspaceId}))if(ids.has(g.personId))await tx.replace('talentAccessGrants',{...touch(g,clock),state:'REVOKED',authorizationEpoch:g.authorizationEpoch+1,selfExposureManifest:[],...(erase?{approvalBasis:'[ERASED]'}:{})});
 for(const i of await tx.find('talentInvitations',{workspaceId}))if(i.targetPersonId&&ids.has(i.targetPersonId))await tx.replace('talentInvitations',{...touch(i,clock),state:'REVOKED',tokenHash:null,recipientHash:null});
 for(const c of await tx.find('talentClaims',{workspaceId}))if(c.targetPersonId&&ids.has(c.targetPersonId)){if(c.reserved){const i=(await tx.get('talentInvitations',c.invitationId))!;await tx.replace('talentInvitations',{...touch(i,clock),reservedCount:i.reservedCount-1});}await tx.replace('talentClaims',{...touch(c,clock),state:c.state==='PENDING'?'WITHDRAWN':c.state,reserved:false,...(erase?{ownershipBasis:'[ERASED]'}:{})});}
 for(const s of await tx.find('talentSubmissions',{workspaceId}))if((s.personId&&ids.has(s.personId))||(s.proposedPersonId&&ids.has(s.proposedPersonId)&&erase)){await tx.replace('talentSubmissions',{...touch(s,clock),state:['DRAFT','SUBMITTED'].includes(s.state)?'WITHDRAWN':s.state,...(erase?{publicReason:'',expiresAt:clock.now().toISOString(),...(s.principalKind==='MACHINE'?{sourceDeclaration:{erased:true}}:{})}: {})});if(erase)for(const i of await tx.find('talentSubmissionItems',{workspaceId,submissionId:s.id}))await tx.replace('talentSubmissionItems',{...touch(i,clock),values:{erased:true},baseline:{}});}
}
export async function isolateTalentMaintenance(tx:Tx,workspaceId:string,clock:Clock,accountId?:string,erase=false){
 for(const g of await tx.find('talentAccessGrants',{workspaceId}))if(!accountId||g.talentAccountId===accountId)await tx.replace('talentAccessGrants',{...touch(g,clock),state:accountId?'REVOKED':'RECOVERY_REVIEW',authorizationEpoch:g.authorizationEpoch+1,selfExposureManifest:[]});
 if(!accountId){for(const i of await tx.find('talentInvitations',{workspaceId}))await tx.replace('talentInvitations',{...touch(i,clock),state:'REVOKED',tokenHash:null,reservedCount:0});for(const c of await tx.find('talentInvitationContexts',{workspaceId}))await tx.replace('talentInvitationContexts',{...touch(c,clock),expiresAt:clock.now().toISOString()});}
 for(const c of await tx.find('talentClaims',{workspaceId}))if((!accountId||c.talentAccountId===accountId)&&c.state==='PENDING'){if(accountId&&c.reserved){const i=(await tx.get('talentInvitations',c.invitationId))!;await tx.replace('talentInvitations',{...touch(i,clock),reservedCount:i.reservedCount-1});}await tx.replace('talentClaims',{...touch(c,clock),state:'EXPIRED',reserved:false});}
 for(const s of await tx.find('talentSubmissions',{workspaceId}))if(!accountId||s.talentAccountId===accountId){if(['DRAFT','SUBMITTED'].includes(s.state))await tx.replace('talentSubmissions',{...touch(s,clock),state:'EXPIRED'});if(erase)for(const i of await tx.find('talentSubmissionItems',{workspaceId,submissionId:s.id}))await tx.replace('talentSubmissionItems',{...touch(i,clock),values:{erased:true},baseline:{}});}
}
export async function inspectTalentMaintenance(tx:Tx,workspaceId:string){const snapshot=await maintenanceSnapshot(tx,workspaceId);const blockers:string[]=[];if(snapshot.data.talentInvitations!.some(r=>r.tokenHash||r.state==='ACTIVE'))blockers.push('TALENT_INVITATION_ACTIVE');if(snapshot.data.talentAccessGrants!.some(r=>r.state==='ACTIVE'))blockers.push('TALENT_GRANT_ACTIVE');if(snapshot.data.talentSubmissions!.some(r=>r.principalKind==='MACHINE'&&['DRAFT','SUBMITTED'].includes(String(r.state))))blockers.push('MACHINE_INGESTION_ACTIVE');if(snapshot.data.talentClaims!.some(r=>r.reserved))blockers.push('TALENT_ADMISSION_ACTIVE');return {graphDigest:snapshot.digest,count:snapshot.count,blockers};}
export async function cleanupTalentMaintenance(tx:Tx,clock:Clock){
 const now=clock.now().getTime();
 for(const c of await tx.find('talentClaims',{reserved:true})){const i=await tx.get('talentInvitations',c.invitationId);if(i&&(Date.parse(c.admissionUntil)<=now||Date.parse(i.expiresAt)<=now||i.state!=='ACTIVE')){await tx.replace('talentClaims',{...touch(c,clock),reserved:false});await tx.replace('talentInvitations',{...touch(i,clock),reservedCount:i.reservedCount-1});}}
 for(const s of await tx.find('talentSubmissions'))if(Date.parse(s.expiresAt)<=now){const rows=await tx.find('talentSubmissionItems',{workspaceId:s.workspaceId,submissionId:s.id});if(rows.some(i=>!i.values.erased)||s.principalKind==='MACHINE'&&!s.sourceDeclaration?.erased){await tx.replace('talentSubmissions',{...touch(s,clock),state:['DRAFT','SUBMITTED'].includes(s.state)?'EXPIRED':s.state,publicReason:'',...(s.principalKind==='MACHINE'?{sourceDeclaration:{erased:true}}:{})});for(const i of rows)await tx.replace('talentSubmissionItems',{...touch(i,clock),values:{erased:true},baseline:{}});}}
}
