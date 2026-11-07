import {ResourceRun} from './resource-run.mjs';
const scope=new ResourceRun();
try{
    // Small synthetic files, serial execution, no server/container/model requests.
    await scope.command(process.execPath,['--experimental-strip-types','--test','--test-concurrency=1','tests/documents/parser.test.mjs','tests/documents/workflow.test.mjs','tests/documents/batches.test.mjs','tests/documents/work-grouping.test.mjs','tests/documents/fields.test.mjs'],{timeout:180000});
    scope.record.outcome='PASS';
}catch{
    scope.record.outcome='FAIL';process.exitCode=1;
}finally{
    try{await scope.cleanup();console.log('Document parser resources: '+scope.record.status);}
    catch{console.error('RESOURCE_LEAK: document test cleanup failed');process.exitCode=1;}
}
