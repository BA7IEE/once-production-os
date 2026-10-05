import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {ResourceRun} from '../../scripts/resource-run.mjs';
import {registeredBrowser} from '../../scripts/registered-browser.mjs';
import {ownedPostgres} from '../../scripts/test-postgres-owned.mjs';

test('browser launch with no exposed PID is UNKNOWN and retains the owned run lock (simulated browser and Docker)',async()=>{
 const scope=new ResourceRun({simulation:true});let container=false,unlocked=false;
 scope.command=async(command,args)=>{
  if(args[0]==='ps')return '';
  if(args[0]==='run'){container=true;return 'synthetic-container';}
  if(args[0]==='exec')return '';
  if(args[0]==='port')return '127.0.0.1:12345';
  assert.equal(command,process.execPath);
  await registeredBrowser({async launchServer(){
   const intents=readdirSync(scope.directory).filter(n=>n.startsWith('browser-'));
   assert.equal(intents.length,1);assert.equal(JSON.parse(readFileSync(scope.directory+'/'+intents[0],'utf8')).status,'REGISTERED');
   throw new Error('synthetic launch failure before PID exposure');
  }});
 };
 const previous=process.env.ONCE_RESOURCE_RUN_DIR;process.env.ONCE_RESOURCE_RUN_DIR=scope.directory;
 try{
  await assert.rejects(ownedPostgres({scope,suite:'browser-flow',baseline:'business-flow',guard:()=>{},lock:()=>()=>{unlocked=true;},cleanupCommand:async(_command,args)=>{
   if(args[0]==='stop'){container=false;return '';}
   return container?'synthetic-container':'';
  }}),/RESOURCE_LEAK/);
  assert.equal(container,false);assert.equal(unlocked,false);assert.equal(scope.record.status,'CLEANUP_FAILED');assert.equal(scope.record.remaining.unresolvedBrowserLaunches,1);
 }finally{if(previous===undefined)delete process.env.ONCE_RESOURCE_RUN_DIR;else process.env.ONCE_RESOURCE_RUN_DIR=previous;}
});
