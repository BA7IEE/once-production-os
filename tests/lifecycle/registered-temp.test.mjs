import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readdirSync} from 'node:fs';
import {ResourceRun} from '../../scripts/resource-run.mjs';
test('nested temporary migration files are registered and reclaimed after child failure',async()=>{
 const scope=new ResourceRun();
 try{await assert.rejects(scope.command(process.execPath,['--input-type=module','-e',"import {registeredTemp} from './scripts/registered-temp.mjs';registeredTemp();throw new Error('synthetic child failure');"],{capture:true,timeout:3000}));assert.equal(readdirSync(scope.directory).filter(n=>n.startsWith('temporary-')).length,1);}
 finally{const result=await scope.cleanup();assert.equal(result.status,'ZERO_RESIDUE');assert.equal(result.remaining.temporaryDirectories,0);for(const name of readdirSync(scope.directory).filter(n=>n.startsWith('temp-')))assert.equal(existsSync(scope.directory+'/'+name),false);}
});
