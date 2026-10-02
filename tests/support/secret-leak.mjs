/** Acceptance-only structured leakage guard. Never retain secrets in diagnostics/errors. */
import {parseStrictJson} from '../../packages/core/src/json-boundary.ts';
const kinds=new Set(['OTP','BEARER_TOKEN','RECEIVE_TOKEN','SIGNED_URL','AUTHORIZATION_HEADER','SESSION_TOKEN','AUTH_SECRET']);
const recordTypes=new Set(['RECEIPT','AUDIT','LOG','REQUEST','RESPONSE']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{32,128}$/i;
const idFields=new Set(['id','ids','commandKey']);
const digestFields=new Set(['sha256','hash','digest','checksum']);
const timeFields=new Set(['createdAt','updatedAt','expiresAt','validUntil','validFrom','timestamp','decidedAt','consumedAt']);
const countFields=new Set(['revision','count','bytes','expectedBytes','usedBytes','reservedBytes','attempts','position','tests','pass','fail','durationMs','elapsedMs','sessionEpoch','authorizationEpoch','protectionEpoch']);
const diagnosticFields=new Set(['result','body','payload','request','response','headers','metadata','message','detail','changedFields','error','code','otp','authorization','Authorization','receiveToken','sessionToken','bearerToken','accessToken',...idFields,...digestFields,...timeFields,...countFields,'resourceId','requestId','actorId','workspaceId','servicePrincipalId','talentAccountId']);
const redacted=v=>v==null||v===''||['[REDACTED]','<redacted>','***'].includes(v);
const normalized=s=>{try{return decodeURIComponent(s);}catch{return s;}};
const decoded=s=>normalized(s).replace(/\\u([0-9a-f]{4})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));

export function secretMatcher(kind,value){
 if(!kinds.has(kind)||typeof value!=='string'||!value.length)throw new Error('Invalid secret matcher metadata');
 const encoded=encodeURIComponent(value);
 return Object.freeze({kind,matches:s=>s.includes(value)||s.includes(encoded)||decoded(s).includes(value)});
}

export function assertSecretAbsent(records,matchers=[]){
 if(matchers.some(m=>!kinds.has(m.kind)||typeof m.matches!=='function'))throw new Error('Invalid secret matcher metadata');
 const ordered=[...matchers.filter(m=>m.kind!=='OTP'),...matchers.filter(m=>m.kind==='OTP')];
 const fail=(type,path,kind)=>{throw new Error(`SECRET_LEAK record=${type} path=${path} secret=${kind}`);};
 for(const record of records){
  if(!recordTypes.has(record.type))throw new Error('Unknown leakage record type');
  const type=record.type;
  const inspect=(value,path,key='')=>{
   if(value instanceof Date)return;
   if(value&&typeof value==='object'){
    if(Array.isArray(value)){value.forEach((v,i)=>inspect(v,`${path}[${i}]`,key));return;}
    for(const [i,[name,v]]of Object.entries(value).entries()){
     // A malicious field name must not put its contents into the failure path.
     for(const m of ordered)if(m.matches(name))fail(type,`${path}.<field#${i}>`,m.kind);
     inspect(name,`${path}.<field#${i}>`,'<key>');
     const safe=diagnosticFields.has(name)?name:`<field#${i}>`;
     inspect(v,`${path}.${safe}`,name);
    }
    return;
   }
   if(typeof value!=='string'&&typeof value!=='number')return;
   const text=String(value);
   if(typeof value==='string'&&/^[\s]*[\[{]/.test(value)){let parsed;try{parsed=parseStrictJson(value);}catch{}if(parsed&&typeof parsed==='object'){inspect(parsed,path+'.<json>');return;}}
   // Only valid typed metadata skips OTP matching. Body/message/detail strings always scan.
   const identifier=(idFields.has(key)||/(?:Id|Ids|ID|IDs)$/.test(key))&&uuid.test(text);
   const digest=(digestFields.has(key)||/(?:Digest|Hash|Checksum)$/.test(key))&&hex.test(text);
   const timestamp=timeFields.has(key)&&(typeof value==='number'?Number.isSafeInteger(value)&&Math.abs(value)<=8640000000000000:/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(text)&&Number.isFinite(Date.parse(text))&&new Date(text).toISOString()===text);
   const metadata=identifier||digest||timestamp||countFields.has(key)&&typeof value==='number'&&Number.isFinite(value);
   for(const m of ordered)if(!(metadata&&m.kind==='OTP')&&m.matches(text))fail(type,path,m.kind);
   if(!redacted(value)&&/^(authorization|proxy-authorization)$/i.test(key))fail(type,path,'AUTHORIZATION_HEADER');
   if(!redacted(value)&&/^(receiveToken|sessionToken|bearerToken|accessToken)$/i.test(key))fail(type,path,key.toLowerCase()==='receivetoken'?'RECEIVE_TOKEN':key.toLowerCase()==='sessiontoken'?'SESSION_TOKEN':'BEARER_TOKEN');
   if(/authorization\s*[=:]\s*["']?\s*Bearer\s+[^\s"']+/i.test(decoded(text)))fail(type,path,'AUTHORIZATION_HEADER');
   if(/https?:\/\/[^\s"'<>]*[?&](?:x-amz-signature|x-goog-signature|q-signature|signature|sig|authorization)=[^\s"'&<>]+/i.test(decoded(text)))fail(type,path,'SIGNED_URL');
  };
  inspect(record.value,'$');
 }
}

export async function assertStoredSecretsAbsent(db,logs,matchers=[]){
 const receive=typeof db.mediaUpload?.findMany==='function'?await db.mediaUpload.findMany({where:{receiveToken:{not:null}},select:{receiveToken:true}}):[];
 const known=[...matchers,...receive.map(row=>secretMatcher('RECEIVE_TOKEN',row.receiveToken))];
 const records=[{type:'RECEIPT',value:await db.commandReceipt.findMany()},{type:'AUDIT',value:await db.auditEvent.findMany()}];
 for(const line of logs.join('').split(/\r?\n/)){
  if(!line)continue;let value;
  try{value=parseStrictJson(line);}catch{value={message:line};}
  records.push({type:'LOG',value});
 }
 assertSecretAbsent(records,known);
}
