import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
/** Nested tests share the owning run journal; intent is durable before mkdir. */
export function registeredTemp(){
 const root=process.env.ONCE_RESOURCE_RUN_DIR;if(!root)throw new Error('ResourceRun is required before temporary directory creation');
 const id=randomUUID(),path=join(root,'temp-'+id),record=join(root,'temporary-'+id+'.json');
 writeFileSync(record,JSON.stringify({path,status:'REGISTERED'}),{mode:0o600,flag:'wx'});mkdirSync(path,{mode:0o700});
 return {path,cleanup(){rmSync(path,{recursive:true,force:true});writeFileSync(record,JSON.stringify({path,status:'REMOVED'}),{mode:0o600});}};
}
