import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {ModelClient,ModelCallError} from '../../apps/api/src/ai/model-client.ts';

// Only this synthetic origin is remapped. Production continues to require HTTPS.
const connection={name:'Wire fixture',baseURL:'https://models.example.test/v1',protocol:'openai-chat' as const,model:'wire-model',timeoutMs:1000,maxOutputTokens:512};
for(const fault of ['timeout','partial-body','reset','redirect','429','500'] as const){
 test(`actual HTTP ${fault} leaves outcome unknown and never retries`,{timeout:10000},async()=>{
  let requests=0;const server=createServer(async(req,res)=>{
   requests++;let body='';for await(const chunk of req)body+=chunk;
   assert.equal(req.url,'/v1/chat/completions');assert.equal(JSON.parse(body).model,'wire-model');assert.equal(req.headers.authorization,'Bearer synthetic-key');
   if(fault==='timeout')return;
   if(fault==='partial-body'){res.writeHead(200,{'content-type':'application/json','content-length':'9999'});res.write('{"id":"partial"');return;}
   if(fault==='reset'){req.socket.destroy();return;}
   if(fault==='redirect'){res.writeHead(307,{location:'/must-not-follow'});res.end();return;}
   res.writeHead(Number(fault),{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'PRIVATE synthetic-key'}}));
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
  const mapped:typeof fetch=async(url,init)=>{const parsed=new URL(String(url));assert.equal(parsed.origin,'https://models.example.test');return fetch(`http://127.0.0.1:${address.port}${parsed.pathname}`,init);};
  try{
   await assert.rejects(new ModelClient(connection,'synthetic-key',mapped).call({queryText:'synthetic'}, {signal:new AbortController().signal,deadlineAt:new Date(Date.now()+5000).toISOString()}),e=>e instanceof ModelCallError&&e.code==='OUTCOME_UNKNOWN'&&!JSON.stringify(e).includes('PRIVATE'));
   assert.equal(requests,1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
 });
}
