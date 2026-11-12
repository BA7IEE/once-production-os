import {ResourceRun} from '../../../scripts/resource-run.mjs';
import {acquireLock,preflight} from '../../../scripts/resource-lifecycle.mjs';
import {registeredTemp} from '../../../scripts/registered-temp.mjs';
const scope = new ResourceRun(); let release; let finalCode=1;
try {
 release=acquireLock(); preflight(); scope.check();
 process.env.ONCE_RESOURCE_RUN_DIR=scope.directory;
 const temp=registeredTemp(); process.env.TMPDIR=temp.path;
 const run=await scope.command(process.execPath,['artifacts/recovery-delivery-20261112/core-controlled/runner.mjs'],{timeout:1800000,allowFailure:true});
 scope.record.outcome=run.code===0?'PASS':'FAIL'; scope.record.testExit=run.code; scope.save(); finalCode=run.code===0?0:1;
} catch(error) {scope.record.outcome='FAIL';scope.save();console.error('Controlled Core run failed or was interrupted:',error.message);}
finally {
 try {await scope.cleanup();release?.();console.log(JSON.stringify({resourceRunId:scope.id,status:scope.record.status,outcome:scope.record.outcome,remaining:scope.record.remaining}));}
 catch(error){console.error('Controlled Core cleanup failed:',error.message);finalCode=1;}
}
process.exitCode=finalCode;
