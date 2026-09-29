/** Subprocess fixture: real PrismaStore and SDK worker; never a production entry. */
import {PrismaClient} from '@prisma/client';
import {Application} from '../../packages/core/src/api.ts';
import {PrismaStore} from '../../apps/api/src/prisma-store.ts';
import {AiWorker} from '../../apps/api/src/ai/worker.ts';
import {installedModelClient} from '../../apps/api/src/ai/installed-client.ts';
process.once('message',async(message:any)=>{
 const db=new PrismaClient({datasources:{db:{url:process.env.DATABASE_URL_TD2_TEST}},log:[]});
 try{
  const config={...message.config,contactKey:Buffer.from(message.contactKey,'hex'),csrfKey:Buffer.from(message.csrfKey,'hex')};
  const store=new PrismaStore(db);
  const pause=async()=>{process.send?.({phase:message.phase});await new Promise(()=>{});};
  const transaction=store.transaction.bind(store);
  store.transaction=fn=>transaction(tx=>fn(new Proxy(tx,{get(target,key){
   if(key==='insert')return async(table:any,row:any)=>{await target.insert(table,row);if(message.phase==='before-attempt-commit'&&table==='aiAttempts'||message.phase==='before-response-commit'&&table==='aiResponseMetadata')await pause();};
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }})));
  const app=new Application(store,config,{now:()=>new Date(message.now)});
  const mapped:typeof fetch=async(url,init)=>{
   if(message.phase==='before-http')await pause();
   const parsed=new URL(String(url));if(parsed.origin!=='https://models.example.test')throw new Error('Unexpected fixture origin');
   return fetch(`http://127.0.0.1:${message.port}${parsed.pathname}`,init);
  };
  await new AiWorker(app,id=>installedModelClient(app,id,mapped)).cycle(new AbortController().signal);
  await db.$disconnect();process.send?.({done:true});process.disconnect();
 }catch{await db.$disconnect();process.send?.({failed:true});process.disconnect();process.exitCode=1;}
});
