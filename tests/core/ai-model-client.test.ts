import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelClient,ModelCallError,validateModelConnection,type ModelConnection} from '../../apps/api/src/ai/model-client.ts';
const output={changes:[],unknowns:['No evidence supplied']};
const base:ModelConnection={name:'Synthetic endpoint',baseURL:'https://models.example.test/v1',protocol:'openai-chat',model:'custom-model',timeoutMs:1000,maxOutputTokens:512};
const ctx=()=>({signal:new AbortController().signal,deadlineAt:new Date(Date.now()+10000).toISOString()});
const chat=(text=JSON.stringify(output),extra:Record<string,unknown>={})=>({id:'synthetic-response',object:'chat.completion',created:1,model:base.model,choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:8,total_tokens:20},...extra});
for(const protocol of ['openai-chat','openai-responses','anthropic-messages'] as const){
 test(`SDK ${protocol} uses the configured endpoint/model/key and returns normalized usage`,async()=>{
  let calls=0;
  const mocked:typeof fetch=async(url,init)=>{
   calls++;assert.equal(String(url),base.baseURL+({'openai-chat':'/chat/completions','openai-responses':'/responses','anthropic-messages':'/messages'}[protocol]));
   const headers=new Headers(init?.headers);assert.equal(headers.get(protocol==='anthropic-messages'?'x-api-key':'authorization'),protocol==='anthropic-messages'?'synthetic-key':'Bearer synthetic-key');
   assert.equal(init?.redirect,'error');const sent=JSON.parse(String(init?.body));assert.equal(sent.model,'custom-model');assert.ok(!sent.tools?.length);
   if(protocol==='openai-responses')assert.equal(sent.store,false);
   const body=protocol==='openai-chat'?chat():protocol==='openai-responses'
    ?{id:'synthetic-response',created_at:1,model:base.model,object:'response',status:'completed',output:[{type:'message',id:'msg_1',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:12,output_tokens:8,total_tokens:20}}
    :{id:'synthetic-response',type:'message',role:'assistant',model:base.model,content:[{type:'text',text:JSON.stringify(output)}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:12,output_tokens:8}};
   return Response.json(body);
  };
  const result=await new ModelClient({...base,protocol},'synthetic-key',mocked).call({taskType:'extract_profile',chunks:[]},ctx());
  assert.equal(calls,1);assert.equal(result.outputStatus,'VALID_JSON');assert.deepEqual(result.output,output);assert.equal(result.usage.inputTokens,12);assert.equal(result.usage.outputTokens,8);
 });
}
test('missing usage remains unknown; malformed suggestions retain returned usage',async()=>{
 const noUsage=await new ModelClient(base,'synthetic-key',async()=>Response.json(chat(undefined,{usage:undefined}))).call({},ctx());
 assert.equal(noUsage.outputStatus,'VALID_JSON');assert.equal(noUsage.usage.inputTokens,null);assert.equal(noUsage.usage.outputTokens,null);
 const invalid=await new ModelClient(base,'synthetic-key',async()=>Response.json(chat('{not json'))).call({},ctx());
 assert.equal(invalid.outputStatus,'INVALID_JSON');assert.equal(invalid.output,null);assert.equal(invalid.usage.inputTokens,12);
 const length=await new ModelClient(base,'synthetic-key',async()=>Response.json(chat(undefined,{choices:[{index:0,message:{role:'assistant',content:JSON.stringify(output)},finish_reason:'length'}]}))).call({},ctx());
 assert.equal(length.outputStatus,'INCOMPLETE');assert.equal(length.output,null);
 const noId=await new ModelClient(base,'synthetic-key',async()=>Response.json(chat(undefined,{id:undefined}))).call({},ctx());
 assert.equal(noId.providerResponseId,null);
});
test('HTTP throttling and provider errors never retry or expose raw error bodies',async()=>{
 for(const status of [429,500]){
  let calls=0;const client=new ModelClient(base,'synthetic-key',async()=>{calls++;return Response.json({error:{message:'PRIVATE SOURCE synthetic-key'}},{status});});
  await assert.rejects(client.call({},ctx()),e=>e instanceof ModelCallError&&e.code==='OUTCOME_UNKNOWN'&&!JSON.stringify(e).includes('PRIVATE')&&!e.stack?.includes('synthetic-key'));
  assert.equal(calls,1);
 }
});
test('expired and cancelled requests are rejected before HTTP; in-flight abort propagates',async()=>{
 let calls=0;const client=new ModelClient(base,'synthetic-key',async()=>{calls++;throw new Error('private');});
 await assert.rejects(client.call({},{...ctx(),deadlineAt:new Date(0).toISOString()}),e=>e instanceof ModelCallError&&e.code==='NOT_SENT');
 const stop=new AbortController();stop.abort();await assert.rejects(client.call({},{...ctx(),signal:stop.signal}),e=>e instanceof ModelCallError&&e.code==='NOT_SENT');assert.equal(calls,0);
 const inflight=new AbortController();let observed=false;
 const waiting=new ModelClient(base,'synthetic-key',async(_url,init)=>{inflight.abort();observed=init?.signal?.aborted===true;throw init?.signal?.reason;});
 await assert.rejects(waiting.call({},{...ctx(),signal:inflight.signal}),ModelCallError);assert.equal(observed,true);
});
test('untrusted configuration and oversized provider responses are rejected',async()=>{
 for(const baseURL of ['http://localhost/v1','https://key:secret@example.test/v1','https://example.test/v1?key=secret','https://example.test/v1#secret'])assert.throws(()=>validateModelConnection({...base,baseURL}),ModelCallError);
 assert.throws(()=>validateModelConnection({...base,protocol:'unknown'}),ModelCallError);
 assert.throws(()=>new ModelClient(base,'key\r\nheader'),ModelCallError);
 await assert.rejects(new ModelClient(base,'synthetic-key',async()=>new Response('a'.repeat(1024*1024+1))).call({},ctx()),ModelCallError);
});
