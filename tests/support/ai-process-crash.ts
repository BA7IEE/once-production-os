import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import type {Application} from '../../packages/core/src/api.ts';
import type {Store} from '../../packages/core/src/store.ts';
import {connectionInput} from './ai-connections.ts';
import {result,type Client} from './fixtures.ts';

export async function verifyAiProcessCrash(f:{app:Application;store:Store;owner:Client}){
 const saved=(await f.store.transaction(tx=>tx.find('aiConnections')))[0]!;
 const configured=await f.owner.cmd('POST','/ai-connection',{...connectionInput,expectedRevision:saved.revision,apiKey:'',connection:{...connectionInput.connection,timeoutMs:120000}});
 assert.equal(configured.status,200);
 const revision=(await f.store.transaction(tx=>tx.get('aiConnections',saved.id)))!.revision;
 const queued=await f.owner.cmd('POST','/ai-connection/test',{expectedRevision:revision,confirmTest:true});assert.equal(queued.status,200);
 const runId=result(queued).resourceId as string;
 const before=(await f.store.transaction(tx=>tx.find('aiBudgets'))).reduce((n,b)=>n+b.reservedUnits,0);
 let requests=0;let received!:()=>void;const arrival=new Promise<void>(resolve=>{received=resolve;});
 const server=createServer(async(req,_res)=>{requests++;for await(const _ of req){}received();});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 const {contactKey,csrfKey,...config}=f.app.config;
 const children:ReturnType<typeof fork>[]=[];
 const start=(now:number)=>{
  const child=fork(new URL('./ai-crash-child.ts',import.meta.url),[],{execArgv:['--experimental-strip-types'],stdio:['ignore','ignore','ignore','ipc']});children.push(child);
  child.send({config,contactKey:contactKey.toString('hex'),csrfKey:csrfKey.toString('hex'),now,port:address.port});return child;
 };
 const bounded=async<T>(promise:Promise<T>):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Crash fixture synchronization timeout')),15000);})]);}finally{clearTimeout(timer);}
 };
 try{
  const first=start(f.app.clock.now().getTime());await bounded(arrival);
  const attempt=(await f.store.transaction(tx=>tx.find('aiAttempts',{runId})))[0]!;assert.equal(attempt.state,'MAY_HAVE_EXECUTED');
  const died=once(first,'exit');first.kill('SIGKILL');assert.equal((await bounded(died))[1],'SIGKILL');
  // Fresh processes use the same committed database before and after the request window.
  for(const elapsed of [0,131000]){
   const child=start(f.app.clock.now().getTime()+elapsed);const exited=once(child,'exit');
   const [message]=await bounded(once(child,'message'));assert.deepEqual(message,{done:true});assert.equal((await bounded(exited))[0],0);
  }
  assert.equal(requests,1);const run=await f.store.transaction(tx=>tx.get('aiRuns',runId));assert.equal(run!.state,'UNKNOWN');
  assert.equal((await f.store.transaction(tx=>tx.find('aiAttempts',{runId}))).length,1);
  assert.equal((await f.store.transaction(tx=>tx.find('aiBudgets'))).reduce((n,b)=>n+b.reservedUnits,0),before);
  assert.equal((await f.store.transaction(tx=>tx.find('aiResponseMetadata',{runId}))).length,0);
 }finally{
  for(const child of children)if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await bounded(exited);}
  server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
 }
}
