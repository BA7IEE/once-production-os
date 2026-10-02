import test from 'node:test';
import assert from 'node:assert/strict';
import {secretMatcher,assertSecretAbsent,assertStoredSecretsAbsent} from '../support/secret-leak.mjs';
const otp='123456',bearer='once_machine.synthetic-secret-very-long-token',receive='12345600-0000-4000-8000-000000000000',signed='https://private.invalid/file?q-signature=synthetic-signature',matchers=[secretMatcher('OTP',otp),secretMatcher('BEARER_TOKEN',bearer),secretMatcher('RECEIVE_TOKEN',receive)];
function rejected(type:string,value:unknown,kind:string,extra=matchers){let message='';try{assertSecretAbsent([{type,value}],extra);}catch(e){message=(e as Error).message;}assert.ok(message.startsWith('SECRET_LEAK record='+type));assert.ok(message.includes('path=$'));assert.ok(message.includes('secret='+kind));for(const raw of [otp,bearer,receive,signed])assert.equal(message.includes(raw),false,'failure diagnostics must not contain secret');}
test('typed UUID/hash/count/time OTP collisions never mask genuine payload strings',()=>{
 const value={id:'00000000-0000-4000-8000-000000123456',commandKey:'00000000-0000-4000-8000-000000123456',requestDigest:'a'.repeat(58)+otp,count:123456,createdAt:'2026-10-15T12:34:56.123Z',timestamp:1700000123456,result:{resourceId:'00000000-0000-4000-8000-000000123456',resourceIds:['00000000-0000-4000-8000-000000123456'],revision:123456,planDigest:'b'.repeat(58)+otp}};
 assert.equal(JSON.stringify(value).includes(otp),true,'old serialized substring strategy deterministically reports a false leak');
 assertSecretAbsent([{type:'RECEIPT',value},{type:'LOG',value:{metadata:value,message:'completed'}}],matchers);
 for(const type of ['RECEIPT','AUDIT','LOG','REQUEST','RESPONSE'])for(const key of ['body','payload','message','detail','changedFields','unknownContent'])rejected(type,{[key]:'verification='+otp},'OTP');
 rejected('RECEIPT',{result:{message:'a'.repeat(58)+otp}},'OTP');rejected('AUDIT',{changedFields:[otp]},'OTP');rejected('LOG',{metadata:{otp}},'OTP');rejected('RESPONSE',{body:{otp:123456}},'OTP');
});
test('real tokens and authorization/signed URL leaks fail even when they look like UUID metadata',()=>{
 rejected('RECEIPT',{result:{body:bearer}},'BEARER_TOKEN');rejected('AUDIT',{detail:receive},'RECEIVE_TOKEN');rejected('RECEIPT',{resourceId:receive},'RECEIVE_TOKEN');
 rejected('LOG',{metadata:{requestDigest:'f'.repeat(64)}},'AUTH_SECRET',[secretMatcher('AUTH_SECRET','f'.repeat(64))]);
 rejected('LOG',{message:'Authorization: Bearer unknown-secret'},'AUTHORIZATION_HEADER');rejected('LOG',{metadata:{headers:{Authorization:'Bearer unknown-secret'}}},'AUTHORIZATION_HEADER');rejected('AUDIT',{detail:signed},'SIGNED_URL');rejected('RECEIPT',{result:{receiveToken:receive}},'RECEIVE_TOKEN',[]);
 assertSecretAbsent([{type:'LOG',value:{headers:{Authorization:'[REDACTED]'}}}],matchers);
 rejected('LOG',{message:encodeURIComponent(bearer)},'BEARER_TOKEN');rejected('LOG',{message:JSON.stringify({body:'code='+otp}).replace(otp,'\\u0031\\u0032\\u0033\\u0034\\u0035\\u0036')},'OTP');rejected('LOG',{[otp]:'hidden'},'OTP');
 rejected('LOG',{message:'{"body":"code=123456","body":"benign"}'},'OTP');rejected('LOG',{message:'{"body":"\\u0031\\u0032\\u0033\\u0034\\u0035\\u0036","body":"benign"}'},'OTP');
 try{assertSecretAbsent([{type:'LOG',value:{[bearer.slice(0,20)]:otp}}],matchers);assert.fail('expected secret leak');}catch(e){const message=(e as Error).message;assert.equal(message.includes(bearer.slice(0,20)),false);assert.ok(message.includes('path=$.<field#0>'));}
});
test('stored guard joins log chunks, parses metadata, and scans receipt/audit bodies without printing secrets',async()=>{
 const db={commandReceipt:{findMany:async()=>[{result:{resourceId:'00000000-0000-4000-8000-000000123456'}}]},auditEvent:{findMany:async()=>[{changedFields:['intro']}]}};
 await assertStoredSecretsAbsent(db,['{"metadata":{"requestId":"00000000-0000-4000-8000-000000123456"},"message":"done"}\n'],matchers);
 await assert.rejects(assertStoredSecretsAbsent(db,['code=123','456\n'],matchers),e=>{const s=(e as Error).message;assert.equal(s.includes(otp),false);return /record=LOG.*secret=OTP/.test(s);});
 const receiving={...db,mediaUpload:{findMany:async()=>[{receiveToken:receive}]},commandReceipt:{findMany:async()=>[{result:{resourceId:receive}}]}};
 await assert.rejects(assertStoredSecretsAbsent(receiving,[]),e=>{const s=(e as Error).message;assert.equal(s.includes(receive),false);return /record=RECEIPT.*secret=RECEIVE_TOKEN/.test(s);});
});
