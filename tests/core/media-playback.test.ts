import {FaultStore} from '../support/fault-store.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {mkdtemp, realpath, mkdir, writeFile, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import express from 'express';
import type {AddressInfo} from 'node:net';
import {fixture, createPerson, result} from '../support/fixtures.ts';
import {playbackRange, MEDIA_PLAYBACK_DEFAULTS} from '../../packages/core/src/media-playback.ts';
import {PlaybackBudget, loadPlaybackLimits} from '../../apps/api/src/media/playback-limits.ts';
import {LocalMediaProvider} from '../../apps/api/src/media/local-provider.ts';
import {registerPlaybackHttp} from '../../apps/api/src/media/playback-http.ts';
const signal = () => new AbortController().signal;
const code = (expected: string) => (e: unknown) => !!e && typeof e === 'object' && 'code' in e && e.code === expected;

test('playback HTTP ranges: exact, open, suffix, oversized, invalid and ignored multi-range', () => {
    for (const [header, expected] of [[undefined,[200,0,99]],['bytes=10-19',[206,10,19]],['bytes=90-',[206,90,99]],['bytes=-10',[206,90,99]],['bytes=-500',[206,0,99]],['bytes=0-500',[206,0,99]],['bytes=100-',[416,0,99]],['bytes=-0',[416,0,99]],['bytes=20-10',[416,0,99]],['bytes=999999999999999999999-',[416,0,99]],['bytes=x-2',[416,0,99]],['bytes=0-1,5-6',[200,0,99]],['items=0-1',[200,0,99]]] as const) {
        const actual = playbackRange(header,100); assert.deepEqual([actual.status,actual.start,actual.endInclusive],expected,header);
    }
});
test('playback quota: per actor/workspace, no session bypass, idempotent release, rate and byte caps', () => {
    const b = new PlaybackBudget({...MEDIA_PLAYBACK_DEFAULTS,workspaceStreams:2,requestsPerMinute:3,bytesPerMinute:30});
    const one=b.enter('w','actor',10,100),two=b.enter('w','actor',10,100);
    assert.throws(()=>b.enter('w','actor',1,100),code('MEDIA_PLAY_BUSY'));
    assert.throws(()=>b.enter('w','other',1,100),code('MEDIA_PLAY_BUSY'));
    one();one();const three=b.enter('w','actor',10,100);three();two();
    assert.throws(()=>b.enter('w','actor',0,100),code('MEDIA_PLAY_RATE_LIMITED'));
    assert.throws(()=>b.enter('w','another',31,100),code('MEDIA_PLAY_RATE_LIMITED'));
    b.enter('w','actor',10,60101)();
    assert.throws(()=>loadPlaybackLimits({MEDIA_PLAY_MAX_SECONDS:'Infinity'}),code('MEDIA_PLAY_CONFIG_INVALID'));
    assert.throws(()=>loadPlaybackLimits({MEDIA_PLAY_ACTOR_STREAMS:'3'}),code('MEDIA_PLAY_CONFIG_INVALID'));
    assert.equal(loadPlaybackLimits({MEDIA_PLAY_MAX_SECONDS:'30'}).maxSeconds,30);
});
async function prepared() {
    const f=await fixture(); f.app.config.mediaEnabled=true;
    const personId=await createPerson(f.owner,'视频合成',true),p=f.store.rows('people')[0]!,s=f.store.rows('sources')[0]!;
    const bytes=Buffer.from('synthetic video bytes for HTTP authorization tests'),hash=createHash('sha256').update(bytes).digest('hex');
    const made=await f.owner.cmd('POST','/uploads',{sourceId:s.id,personId,expectedSourceRevision:s.revision,fileName:'video.mp4',mime:'video/mp4',expectedBytes:bytes.length,sha256:hash});assert.equal(made.status,201);
    const id=result(made).resourceId;
    const auth=<T>(fn:(tx:import('../../packages/core/src/store.ts').Tx,a:import('../../packages/core/src/model.ts').Actor)=>Promise<T>)=>f.store.transaction(async tx=>fn(tx,await f.app.identity.authenticate(tx,f.owner.jar.once_session!)));
    const u=await auth((tx,a)=>f.app.media.beginReceive(tx,a,id,bytes.length));await auth((tx,a)=>f.app.media.finishReceive(tx,a,id,u.receiveToken!,bytes.length,hash));
    await f.owner.cmd('POST','/uploads/'+id+'/complete',{expectedRevision:f.store.rows('uploads')[0]!.revision});
    const claimed=(await f.app.media.claim())!;await f.app.media.finish(claimed,{mime:'video/mp4',sha256:hash,bytes:bytes.length,width:10,height:10,previewBytes:20,previewHash:'b'.repeat(64)});
    const asset=f.store.rows('assets')[0]!,root=await mkdtemp(join(await realpath(tmpdir()),'once-play-')),provider=await LocalMediaProvider.create(root);
    await mkdir(provider.work(id,asset.objectToken),{recursive:true,mode:0o700});const file=join(provider.work(id,asset.objectToken),'original.bin');await writeFile(file,bytes,{mode:0o400});
    const server=express();registerPlaybackHttp(server,f.app,provider);const listening=server.listen(0,'127.0.0.1');await new Promise<void>(resolve=>listening.once('listening',resolve));
    const origin='http://127.0.0.1:'+(listening.address() as AddressInfo).port;f.app.config.origin=origin;
    const headers={Cookie:'once_session='+f.owner.jar.once_session};
    const get=(extra:Record<string,string>={},suffix='')=>fetch(origin+'/api/v1/assets/'+id+'/playback'+suffix,{headers:{...headers,...extra}});
    return {...f,provider,asset,bytes,file,get,headers,origin,auth,cleanup:async()=>{listening.closeAllConnections();await new Promise<void>(resolve=>listening.close(()=>resolve()));await rm(root,{recursive:true,force:true});}};
}
test('real local bounded stream: identity mismatch, writeable file and abort are rejected',async()=>{
    const f=await prepared();try{
        const ref=await f.provider.statImmutableObject(f.asset,signal());const s=await f.provider.openByteStream({objectRef:ref,start:2,endInclusive:5,signal:signal()});
        const chunks=[];for await(const b of s.stream)chunks.push(b);assert.deepEqual(Buffer.concat(chunks),f.bytes.subarray(2,6));
        await chmod(f.file,0o600);await assert.rejects(f.provider.openByteStream({objectRef:ref,start:0,endInclusive:2,signal:signal()}),code('MEDIA_FILE_INVALID'));
        await writeFile(f.file,Buffer.alloc(f.bytes.length));await chmod(f.file,0o400);await assert.rejects(f.provider.openByteStream({objectRef:ref,start:0,endInclusive:2,signal:signal()}),code('MEDIA_FILE_INVALID'));
        const c=new AbortController();c.abort();await assert.rejects(f.provider.statImmutableObject(f.asset,c.signal),code('MEDIA_CANCELLED'));
    }finally{await f.cleanup();}
});
test('real HTTP playback: 200/206/416, privacy/authentication, current source and audit',async()=>{
    const f=await prepared();try{
        const full=await f.get();assert.equal(full.status,200);assert.deepEqual(Buffer.from(await full.arrayBuffer()),f.bytes);assert.equal(full.headers.get('content-type'),'video/mp4');assert.equal(full.headers.get('accept-ranges'),'bytes');
        const part=await f.get({Range:'bytes=2-5'});assert.equal(part.status,206);assert.equal(part.headers.get('content-range'),`bytes 2-5/${f.bytes.length}`);assert.deepEqual(Buffer.from(await part.arrayBuffer()),f.bytes.subarray(2,6));
        assert.equal((await f.get({Range:'bytes=9999-'})).status,416);
        const multi=await f.get({Range:'bytes=0-1,5-6'});assert.equal(multi.status,200);await multi.arrayBuffer();
        assert.equal((await f.get({Cookie:''})).status,401);
        assert.equal((await f.get({Cookie:'once_talent_session=not-internal'})).status,401);
        assert.equal((await f.get({Authorization:'Bearer once_machine.synthetic'})).status,403);
        assert.equal((await f.get({'X-ONCE-Membership':randomUUID()})).status,409);
        assert.equal((await f.get({},'?key=not-accepted')).status,400);
        assert.equal(f.store.rows('audits').filter(a=>a.action==='asset.playback').length,3);
        const source=f.store.rows('sources')[0]!;await f.owner.cmd('POST','/sources/'+source.id+'/suspend',{expectedRevision:source.revision,reason:'合成撤回'});
        assert.equal((await f.get({Range:'bytes=0-2'})).status,404);
    }finally{await f.cleanup();}
});
test('revocation while opening stream denies first byte',async()=>{
    const f=await prepared();try{
        const open=f.provider.openByteStream.bind(f.provider);
        f.provider.openByteStream=async r=>{const out=await open(r);await f.owner.cmd('POST','/assets/'+f.asset.id+'/quarantine',{expectedRevision:1});return out;};
        const r=await f.get();assert.equal(r.status,404);assert.match(r.headers.get('content-type')!,/json/);assert.equal(f.store.rows('audits').filter(a=>a.action==='asset.playback').length,0);
    }finally{await f.cleanup();}
});

test('playback audit failure rolls back and sends no video bytes',async()=>{
    const f=await prepared();try{
        const faults=new FaultStore(f.store);f.app.store=faults;
        faults.afterInsert=(table,row)=>{if(table==='audits' && 'action' in row && row.action==='asset.playback')throw new Error('synthetic audit failure');};
        const before=f.store.rows('audits').length;const response=await f.get();assert.equal(response.status,503);assert.equal(f.store.rows('audits').length,before);assert.match(response.headers.get('content-type')!,/json/);
    }finally{await f.cleanup();}
});

test('storage mismatch quarantines exact asset with SYSTEM audit, without revealing storage path',async()=>{
    const f=await prepared();try{
        await chmod(f.file,0o600);
        f.app.safetyIntent={writeAhead:async()=>{throw new Error('synthetic journal outage');},committed:async()=>{},aborted:async()=>{}};
        assert.equal((await f.get()).status,503);assert.equal(f.store.rows('assets')[0]!.state,'READY','journal failure blocks mutation as well as video');
        const intents:Array<import('../../packages/core/src/safety-intent.ts').SafetyIntent>=[],completed:string[]=[];
        f.app.safetyIntent={writeAhead:async intent=>{intents.push(intent);},committed:async(_intent,id)=>{completed.push(id);},aborted:async()=>{}};
        const response=await f.get();assert.equal(response.status,503);
        assert.equal(intents.length,1);assert.deepEqual(completed,[f.asset.id]);
        assert.equal(f.store.rows('audits').find(a=>a.action==='asset.integrity-quarantine')!.requestId,intents[0]!.requestId);
        assert.equal(f.store.rows('assets')[0]!.state,'QUARANTINED');
        const event=f.store.rows('audits').find(a=>a.action==='asset.integrity-quarantine')!;assert.equal(event.principalKind,'SYSTEM');
        assert.ok(!(await response.text()).includes(f.file));assert.equal((await f.get()).status,404);
    }finally{await f.cleanup();}
});
