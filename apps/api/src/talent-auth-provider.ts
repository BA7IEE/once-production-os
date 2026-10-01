import type {AuthProvider,TalentAuthConfig} from '../../../packages/core/src/talent-auth-model.ts';
/** Explicit HTTPS notification gateway contract. No automatic retries, redirects, or provider-body logging. */
export function configuredAuthProvider(c:TalentAuthConfig|undefined):AuthProvider|undefined {
 if(!c?.enabled)return undefined;
 return {async send(input){try{
  const r=await fetch(c.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(c.timeoutMs),headers:{'Content-Type':'application/json','Authorization':'Bearer '+c.credential,'Idempotency-Key':input.requestKey},body:JSON.stringify({...input,sender:c.sender,template:c.template})});
  // A timeout, transport error or unrecognized response cannot prove non-delivery.
  if(!r.ok){await r.body?.cancel();return 'UNKNOWN';}
  const reader=r.body?.getReader();if(!reader)return 'UNKNOWN';let size=0;const chunks:Uint8Array[]=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return 'UNKNOWN';}chunks.push(value);}const data=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {requestKey?:unknown;state?:unknown};
  return data.requestKey===input.requestKey&&['ACCEPTED','DELIVERED','FAILED','UNKNOWN'].includes(String(data.state))?data.state as 'ACCEPTED'|'DELIVERED'|'FAILED'|'UNKNOWN':'UNKNOWN';
 }catch{return 'UNKNOWN';}}};
}
