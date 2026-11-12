import { constants } from 'node:fs';
import { open, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../../packages/core/src/errors.ts';
import { uuid } from '../../../../packages/core/src/validation.ts';
import { withSafetyJournalLock } from '../recovery/safety-journal.ts';

/** The lock inode is never removed. All upgraded writers and purge paths for an
 * upload share it; older writers and external writers are NOT fenced by it. */
export async function withCosNamespaceLock<T>(root:string,id:string,work:()=>Promise<T>):Promise<T>{
 return withSafetyJournalLock(join(root,`.once-cos-${uuid.parse(id)}`),work);
}

export async function syncDirectory(path:string):Promise<void>{
 const dir=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
 try{await dir.sync();}finally{await dir.close();}
}

/** Persist uncertainty before the first outbound PUT; never overwrite a prior
 * unresolved marker when retrying. A crashed writer leaves the marker behind. */
export async function beginCosPublication(work:string):Promise<void>{
 let marker;
 try{marker=await open(join(work,'.cos-publishing'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);}
 catch(e){if((e as NodeJS.ErrnoException).code==='EEXIST')throw new AppError(503,'COS_PUBLICATION_UNRESOLVED','存在结果未知的COS写入，请先核对');throw e;}
 try{await marker.writeFile('PENDING\n');await marker.sync();}finally{await marker.close();}
 await syncDirectory(work);
}
export async function finishCosPublication(work:string):Promise<void>{
 await unlink(join(work,'.cos-publishing'));
 await syncDirectory(work);
}

export type DeleteObservation='ACKNOWLEDGED'|'UNKNOWN'|'NOT_ATTEMPTED';
export interface CosReconciliationReceipt {
 schema:'once-cos-reconciliation-v1';
 state:'RECONCILIATION_REQUIRED';
 targetDigest:string;
 uploadId:string;
 list:'NOT_ATTEMPTED'|'UNKNOWN'|'NONAUTHORITATIVE';
 candidates:Array<{key:string;sources:Array<'work-directory'|'listed'|'purge-intent'>;delete:DeleteObservation}>;
}

/** This receipt is diagnostic evidence, never authority to finalize deletion.
 * It records only keys and outcome categories, never credentials or SDK errors. */
export async function writeCosReconciliationReceipt(quarantine:string,receipt:CosReconciliationReceipt):Promise<void>{
 const temp=join(quarantine,`.cos-reconciliation-${randomUUID()}.tmp`);
 let file;
 try{
  file=await open(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  await file.writeFile(JSON.stringify(receipt)+'\n');await file.sync();await file.close();file=undefined;
  await rename(temp,join(quarantine,'.cos-reconciliation.json'));
  await syncDirectory(quarantine);
 }finally{if(file)await file.close();await rm(temp,{force:true});}
}
