/** Real private filesystem + native sharp subprocess; synthetic images only. Build API first. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, chmod, symlink, mkdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { Application } from '../../dist/packages/core/src/api.js';
import { LocalMediaProvider } from '../../dist/apps/api/src/media/local-provider.js';
import { MediaWorker } from '../../dist/apps/api/src/media/worker.js';
import { fixture, createPerson, result } from '../support/fixtures.ts';
const digest=b=>createHash('sha256').update(b).digest('hex');
async function setup(mime='image/png',custom) {
 const f=await fixture();f.app.config.mediaEnabled=true;
 // The compiled worker calls this Application's domain methods; no process has database/secret env values.
 const pid=await createPerson(f.owner,'合成图片测试',true),p=f.store.rows('people')[0],s=f.store.rows('sources')[0];
 const bytes=custom??await sharp({create:{width:64,height:40,channels:3,background:'#226688'}}).toFormat(mime.split('/')[1]).withMetadata({orientation:6}).toBuffer();
 const c=await f.owner.cmd('POST','/uploads',{sourceId:s.id,personId:pid,expectedSourceRevision:s.revision,fileName:'synthetic.'+mime.split('/')[1],mime,expectedBytes:bytes.length,sha256:digest(bytes)});
 assert.equal(c.status,201,JSON.stringify(c.body));const id=result(c).resourceId;
 const root=await mkdtemp(join(tmpdir(),'once-private-image-')),provider=await LocalMediaProvider.create(root);
 async function auth(fn){return f.store.transaction(async tx=>fn(tx,await f.app.identity.authenticate(tx,f.owner.jar.once_session)));}
 const receiving=await auth((tx,a)=>f.app.media.beginReceive(tx,a,id,bytes.length));
 const resultIO=await provider.receive(receiving,Readable.from([bytes]),new AbortController().signal);
 await auth((tx,a)=>f.app.media.finishReceive(tx,a,id,receiving.receiveToken,resultIO.bytes,resultIO.sha256));
 const u=f.store.rows('uploads')[0];const queued=await f.owner.cmd('POST','/uploads/'+id+'/complete',{expectedRevision:u.revision});assert.equal(queued.status,202);
 return{...f,root,provider,id,bytes,receiving,auth,worker:new MediaWorker(f.app,provider),cleanup:()=>rm(root,{recursive:true,force:true})};
}
for(const mime of ['image/png','image/jpeg','image/webp'])test('real '+mime+' is sealed and re-encoded; EXIF removed and original inaccessible',async()=>{const f=await setup(mime);try{await f.worker.cycle(new AbortController().signal);const a=f.store.rows('assets')[0];assert.ok(a,JSON.stringify(f.store.rows('uploads')));const preview=await f.provider.readPreview(a),m=await sharp(preview).metadata();assert.equal(m.format,'jpeg');assert.equal(m.exif,undefined);assert.equal(m.xmp,undefined);assert.equal(m.icc,undefined);assert.equal(m.orientation,undefined);assert.equal(m.width,40);assert.equal(m.height,64);assert.notEqual(digest(preview),digest(f.bytes));const sealed=join(f.provider.work(a.id,a.objectToken),'original.bin');assert.equal(digest(await readFile(sealed)),digest(f.bytes));assert.equal((await stat(sealed)).mode&0o222,0);await assert.rejects(readFile(f.provider.staging(f.receiving)));}finally{await f.cleanup();}});
test('HTML disguised as PNG never reaches READY',async()=>{const f=await setup('image/png',Buffer.from('<html>not an image</html>'));try{await f.worker.cycle(new AbortController().signal);assert.equal(f.store.rows('assets').length,0);assert.equal(f.store.rows('uploads')[0].state,'FAILED');}finally{await f.cleanup();}});
test('truncated PNG magic is rejected by actual decoder',async()=>{const f=await setup('image/png',Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));try{await f.worker.cycle(new AbortController().signal);assert.equal(f.store.rows('assets').length,0);assert.equal(f.store.rows('uploads')[0].state,'FAILED');}finally{await f.cleanup();}});
test('changed staging bytes fail seal digest; no unsafe preview',async()=>{const f=await setup();try{await writeFile(f.provider.staging(f.receiving),Buffer.alloc(f.bytes.length));await f.worker.cycle(new AbortController().signal);assert.equal(f.store.rows('assets').length,0);assert.equal(f.store.rows('uploads')[0].state,'FAILED');}finally{await f.cleanup();}});
test('preview tampering is detected before bytes returned',async()=>{const f=await setup();try{await f.worker.cycle(new AbortController().signal);const a=f.store.rows('assets')[0],path=join(f.provider.work(a.id,a.objectToken),'preview.jpg');await chmod(path,0o600);await writeFile(path,Buffer.alloc(a.previewBytes));await assert.rejects(f.provider.readPreview(a));}finally{await f.cleanup();}});
test('per-attempt final paths prevent delayed worker from replacing successful preview',async()=>{const f=await setup();try{const old=await f.app.media.claim();const sealed=await f.provider.seal(old,new AbortController().signal);f.clock.advance(31000);const next=await f.app.media.claim();assert.notEqual(old.leaseToken,next.leaseToken);await f.worker.process(next,new AbortController().signal);const a=f.store.rows('assets')[0];assert.ok(a);await writeFile(sealed.preview,'late obsolete worker output');assert.equal((await sharp(await f.provider.readPreview(a)).metadata()).format,'jpeg');assert.equal(a.objectToken,next.leaseToken);}finally{await f.cleanup();}});
test('atomic terminal purge prevents an old worker from recreating final group',async()=>{const f=await setup();try{const claim=await f.app.media.claim();await f.owner.cmd('POST','/uploads/'+f.id+'/cancel',{expectedRevision:claim.revision});f.clock.advance(86400001);await f.worker.cycle(new AbortController().signal);assert.ok(f.store.rows('uploads')[0].purgedAt);await assert.rejects(f.provider.seal(claim,new AbortController().signal));await assert.rejects(stat(f.provider.group(f.id)));}finally{await f.cleanup();}});
test('provider rejects path traversal IDs and symlink roots',async()=>{const root=await mkdtemp(join(tmpdir(),'once-media-paths-'));try{const p=await LocalMediaProvider.create(join(root,'store'));assert.throws(()=>p.group('../../outside'));await symlink(join(root,'store'),join(root,'link'));await assert.rejects(LocalMediaProvider.create(join(root,'link')));}finally{await rm(root,{recursive:true,force:true});}});
test('stream byte limit cuts oversize receive and cannot rewrite the same staging key',async()=>{const f=await setup();try{await assert.rejects(f.provider.receive(f.receiving,Readable.from([f.bytes]),new AbortController().signal));const u={...f.receiving,id:randomUUID(),expectedBytes:2,expectedHash:digest(Buffer.from('ok'))};await assert.rejects(f.provider.receive(u,Readable.from([Buffer.from('overflow')]),new AbortController().signal));assert.ok((await stat(f.provider.staging(u))).size<=2);}finally{await f.cleanup();}});

test('restore-check opens existing media read-only and verifies original plus preview digests',async()=>{const f=await setup();try{
 await f.worker.cycle(new AbortController().signal);const a=f.store.rows('assets')[0];assert.ok(a);
 const before=(await stat(join(f.root,'.once-private-media-v1'))).mtimeMs;
 const reopened=await LocalMediaProvider.openExisting(f.root);
 await reopened.verifyAsset(a);
 assert.equal((await stat(join(f.root,'.once-private-media-v1'))).mtimeMs,before);
 const original=join(reopened.work(a.uploadId,a.objectToken),'original.bin');
 await chmod(original,0o600);await writeFile(original,Buffer.alloc(a.bytes));
 await assert.rejects(reopened.verifyAsset(a));
}finally{await f.cleanup();}});
test('restore-check opener refuses an unregistered root without initializing it',async()=>{const root=await mkdtemp(join(tmpdir(),'once-media-restore-empty-'));try{
 await assert.rejects(LocalMediaProvider.openExisting(root));
 await assert.rejects(stat(join(root,'.once-private-media-v1')));
}finally{await rm(root,{recursive:true,force:true});}});
