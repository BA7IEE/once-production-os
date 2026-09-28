import type {Application} from '../../../../packages/core/src/api.ts';
import {connectionRow,connectionKey,currentAiConfig} from '../../../../packages/core/src/ai-connection.ts';
import {digest} from '../../../../packages/core/src/json.ts';
import {ModelClient} from './model-client.ts';
import type {InstalledAiAdapter} from './worker.ts';

export async function installedModelClient(core:Application,workspaceId:string,fetchImpl:typeof fetch=fetch):Promise<InstalledAiAdapter|null>{
 const loaded=await core.store.transaction(async tx=>{
  const row=await connectionRow(tx,workspaceId),config=await currentAiConfig(tx,workspaceId,core.config);
  return row&&config?{row,config,key:connectionKey(row,core.config)}:null;
 });
 if(!loaded)return null;
 const client=new ModelClient(loaded.row.settings,loaded.key,fetchImpl,()=>core.clock.now().getTime());
 return {providerIdentityHash:loaded.config.providerIdentityHash,send:async(input,context)=>{
  const result=await client.call(input,context);
  return {output:result.output,evidenceDigest:digest({usage:result.usage,responseId:result.providerResponseId}),
   metadata:{...result.usage,providerResponseId:result.providerResponseId,outputStatus:result.outputStatus}};
 }};
}
