import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {ResourceRun} from '../../scripts/resource-run.mjs';
import {registeredTemp} from '../../scripts/registered-temp.mjs';

test('short browser temp remains journal-owned and cleanup rejects a substituted path',async()=>{
 const scope=new ResourceRun({simulation:true}),previous=process.env.ONCE_RESOURCE_RUN_DIR;
 process.env.ONCE_RESOURCE_RUN_DIR=scope.directory;
 try{
  const temp=registeredTemp({short:true});assert.ok(temp.path.length<70);assert.ok(existsSync(temp.path));
  const name=readdirSync(scope.directory).find(n=>n.startsWith('temporary-')),path=join(scope.directory,name),original=readFileSync(path,'utf8');
  writeFileSync(path,JSON.stringify({...JSON.parse(original),path:'/tmp'}));
  await assert.rejects(scope.cleanup(),/RESOURCE_LEAK/);assert.ok(existsSync(temp.path));assert.ok(existsSync('/tmp'));
  writeFileSync(path,original);await scope.cleanup();assert.equal(scope.record.status,'ZERO_RESIDUE');assert.equal(existsSync(temp.path),false);
 }finally{if(previous===undefined)delete process.env.ONCE_RESOURCE_RUN_DIR;else process.env.ONCE_RESOURCE_RUN_DIR=previous;}
});
