import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
/** BrowserServer exposes the detached browser process for the owning finally supervisor. */
export async function registeredBrowser(type,options={}){
 const root=process.env.ONCE_RESOURCE_RUN_DIR;if(!root)throw new Error('ResourceRun is required before browser launch');
 const intent=join(root,'browser-'+randomUUID()+'.json');
 writeFileSync(intent,JSON.stringify({status:'REGISTERED'}),{mode:0o600,flag:'wx'});
 const server=await type.launchServer(options);let browser;
 try{
  const pid=server.process().pid;
  if(!Number.isSafeInteger(pid)||pid<=1)throw new Error('Browser process identity unavailable');
  const path=join(root,`process-${pid}.json`),record={pgid:pid,supervisorPid:process.pid,started:new Date().toISOString(),status:'ACTIVE'};
  writeFileSync(path,JSON.stringify(record),{mode:0o600});
  browser=await type.connect(server.wsEndpoint());
  return {browser,async close(){try{await browser.close();}finally{await server.close();writeFileSync(path,JSON.stringify({...record,status:'KILL_SENT'}),{mode:0o600});writeFileSync(intent,JSON.stringify({status:'CLOSED'}),{mode:0o600});}}};
 }catch(error){await server.close();writeFileSync(intent,JSON.stringify({status:'CLOSED'}),{mode:0o600});throw error;}
}
