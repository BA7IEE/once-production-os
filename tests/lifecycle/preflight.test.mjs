import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight} from '../../scripts/resource-lifecycle.mjs';
const env={DOCKER_HOST:'unix:///var/run/docker.sock',CI:'true',GITHUB_ACTIONS:'true'};
test('isolated Linux Actions accepts local Docker without macOS sysctl',()=>{
 preflight({platform:'linux',env,exec:()=>assert.fail('macOS command on Linux')});
});
test('a Linux CI claim needs Actions and a local Unix Docker endpoint',()=>{
 assert.throws(()=>preflight({platform:'linux',env:{...env,GITHUB_ACTIONS:'false'}}));
 assert.throws(()=>preflight({platform:'linux',env:{...env,DOCKER_HOST:'tcp://remote:2375'}}));
});
test('Actions variables never bypass shared Mac pressure or Swap gates',()=>{
 for(const [swap,pressure] of [[7814,'1'],[1024,'2']])assert.throws(()=>preflight({platform:'darwin',env,exec:(_cmd,args)=>args[0]==='vm.swapusage'?`used = ${swap}M`:pressure}));
 preflight({platform:'darwin',env,exec:(_cmd,args)=>args[0]==='vm.swapusage'?'used = 1024M':'1'});
});
