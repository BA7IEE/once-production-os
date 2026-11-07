import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {invariant} from './errors.ts';
const MAX_BYTES=16_000_000;
/** Separate domain and limits from the much smaller Contact ciphertext contract. */
export function encryptDraftPayload(text:string,key:Buffer,context:string){
 invariant(key.length===32&&Buffer.byteLength(text)<=MAX_BYTES,'DRAFT_PAYLOAD_INVALID','草稿内容超过限制或密钥不可用',422);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from('once:private-draft:v1:'+context));
 const bytes=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
 return ['dp1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
export function decryptDraftPayload(encoded:string,key:Buffer,context:string){
 try{
  invariant(encoded.length<22_000_000,'DRAFT_PAYLOAD_INVALID','草稿大小无效',422);
  const parts=encoded.split('.'),[version,iv,tag,data]=parts;
  invariant(parts.length===4&&version==='dp1'&&iv&&tag&&data&&[iv,tag,data].every(s=>/^[A-Za-z0-9_-]+$/.test(s))&&Buffer.from(iv,'base64url').length===12&&Buffer.from(tag,'base64url').length===16,'DRAFT_PAYLOAD_INVALID','草稿内容无效',422);
  const encrypted=Buffer.from(data,'base64url');invariant(encrypted.length<=MAX_BYTES,'DRAFT_PAYLOAD_INVALID','草稿大小无效',422);
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));cipher.setAAD(Buffer.from('once:private-draft:v1:'+context));cipher.setAuthTag(Buffer.from(tag,'base64url'));
  return Buffer.concat([cipher.update(encrypted),cipher.final()]).toString('utf8');
 }catch{invariant(false,'DRAFT_DECRYPT_FAILED','草稿无法读取，请检查密钥恢复情况',503);}
}
