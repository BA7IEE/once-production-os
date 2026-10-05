import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ownedSequence} from '../../scripts/test-postgres-owned.mjs';

const createScope=()=>({controller:new AbortController(),record:{status:'REGISTERED'}});
test('independent failure continues only after cleanup and still fails the sequence',async()=>{
 const visited=[];
 await assert.rejects(ownedSequence(['first','second'],{createScope,execute:async({scope,baseline})=>{
  visited.push(baseline);scope.record={status:'ZERO_RESIDUE',outcome:'FAIL'};
  if(baseline==='first')throw new Error('business assertion failed');
  return {remaining:{containers:0,processes:0}};
 }}),AggregateError);
 assert.deepEqual(visited,['first','second']);
});
for(const condition of ['CLEANUP_FAILED','NOT_RUN','INTERRUPTED']) {
 test(`sequence stops after ${condition}, never launches another suite`,async()=>{
  const visited=[];
  await assert.rejects(ownedSequence(['first','second'],{createScope,execute:async({scope,baseline})=>{
   visited.push(baseline);scope.record={status:condition==='CLEANUP_FAILED'?condition:'ZERO_RESIDUE',outcome:condition};
   if(condition==='INTERRUPTED')scope.controller.abort();
   throw new Error(condition);
  }}),new RegExp(condition));
  assert.deepEqual(visited,['first']);
 });
}
