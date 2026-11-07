import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelClient,ModelCallError,type ModelConnection} from '../../apps/api/src/ai/model-client.ts';
import {documentFixture,pagePng} from '../support/documents.ts';
const base:ModelConnection={name:'Synthetic document endpoint',baseURL:'https://models.example.test/v1',protocol:'openai-chat',model:'synthetic-vision',timeoutMs:1000,maxOutputTokens:4096};
const context=()=>({signal:new AbortController().signal,deadlineAt:new Date(Date.now()+10000).toISOString()});
function response(protocol:ModelConnection['protocol'],output:unknown){
 const text=JSON.stringify(output);
 return protocol==='openai-chat'?{id:'doc-response',object:'chat.completion',created:1,model:base.model,
  choices:[{index:0,message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:30,completion_tokens:20,total_tokens:50}}
  :protocol==='openai-responses'?{id:'doc-response',created_at:1,model:base.model,object:'response',status:'completed',
   output:[{type:'message',id:'msg_1',role:'assistant',status:'completed',content:[{type:'output_text',text,annotations:[]}]}],usage:{input_tokens:30,output_tokens:20,total_tokens:50}}
  :{id:'doc-response',type:'message',role:'assistant',model:base.model,content:[{type:'text',text}],stop_reason:'end_turn',stop_sequence:null,usage:{input_tokens:30,output_tokens:20}};
}
for(const protocol of ['openai-chat','openai-responses','anthropic-messages'] as const){
 test(`document ${protocol} sends actual page image bytes and accepts grounded structured works`,async()=>{
  const {manifest,proposal,dictionary}=documentFixture();let calls=0;
  const client=new ModelClient({...base,protocol},'synthetic-key',async(_url,init)=>{
   calls++;const body=String(init?.body),sent=JSON.parse(body);
   assert.ok(body.includes(pagePng.toString('base64')));assert.ok(body.includes('Lin He'));
   assert.ok(!body.includes('page-0001.png'));assert.ok(!sent.tools?.length);assert.equal(init?.redirect,'error');
   if(protocol==='openai-responses')assert.equal(sent.store,false);
   return Response.json(response(protocol,proposal));
  });
  const result=await client.callDocument({manifest,dictionary,pages:[{page:1,bytes:pagePng}]},context());
  assert.equal(calls,1);assert.equal(result.outputStatus,'VALID_JSON');assert.deepEqual(result.output,proposal);
  assert.equal(result.usage.inputTokens,30);
 });
}
test('document transport rejects wrong bytes and excessive page batches before sending anything',async()=>{
 const {manifest,dictionary}=documentFixture();let calls=0;
 const client=new ModelClient(base,'synthetic-key',async()=>{calls++;throw new Error();});
 for(const pages of [[],[{page:1,bytes:Buffer.from('changed')}],[{page:2,bytes:pagePng}],Array(5).fill({page:1,bytes:pagePng})])
  await assert.rejects(client.callDocument({manifest,dictionary,pages},context()),e=>e instanceof ModelCallError&&e.code==='NOT_SENT');
 assert.equal(calls,0);
});
test('document responses with fabricated evidence retain usage but cannot become candidates',async()=>{
 const {manifest,proposal,dictionary}=documentFixture();proposal.fields[0]!.evidence[0]!.quote='Fabricated private data';
 const client=new ModelClient(base,'synthetic-key',async()=>Response.json(response(base.protocol,proposal)));
 const result=await client.callDocument({manifest,dictionary,pages:[{page:1,bytes:pagePng}]},context());
 assert.equal(result.outputStatus,'INVALID_JSON');assert.equal(result.output,null);assert.equal(result.usage.outputTokens,20);
});
test('document timeout or provider error does not auto retry and does not expose provider content',async()=>{
 const {manifest,dictionary}=documentFixture();let calls=0;
 const client=new ModelClient(base,'synthetic-key',async()=>{calls++;return Response.json({error:{message:'PRIVATE_DOCUMENT synthetic-key'}},{status:500});});
 await assert.rejects(client.callDocument({manifest,dictionary,pages:[{page:1,bytes:pagePng}]},context()),
  e=>e instanceof ModelCallError&&e.code==='OUTCOME_UNKNOWN'&&!String(e.stack).includes('PRIVATE_DOCUMENT'));
 assert.equal(calls,1);
});
