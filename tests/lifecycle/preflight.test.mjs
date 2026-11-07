import {test} from 'node:test';
import assert from 'node:assert/strict';
import {preflight,boundedLinuxPreflight} from '../../scripts/resource-lifecycle.mjs';
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
test('managed Linux requires finite cgroup headroom and real swap bounds',()=>{
 const values={'/sys/fs/cgroup/memory.max':String(8*1024**3),'/sys/fs/cgroup/memory.current':String(1024**3),'/sys/fs/cgroup/memory.swap.current':'0'};
 const read=path=>values[path];
 preflight({platform:'linux',env:{DOCKER_HOST:env.DOCKER_HOST,ONCE_RUNNER:'managed-linux'},read});
 for(const limit of ['max','NaN',String(2*1024**3)]){values['/sys/fs/cgroup/memory.max']=limit;assert.throws(()=>boundedLinuxPreflight(read));}
 values['/sys/fs/cgroup/memory.max']=String(8*1024**3);values['/sys/fs/cgroup/memory.swap.current']=String(5*1024**3);assert.throws(()=>boundedLinuxPreflight(read));
 assert.throws(()=>boundedLinuxPreflight(()=>{throw new Error('no cgroup');}));
});
