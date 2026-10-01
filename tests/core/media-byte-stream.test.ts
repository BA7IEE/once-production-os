import type COS from 'cos-nodejs-sdk-v5';
import {CosMediaProvider} from '../../apps/api/src/media/cos-provider.ts';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer, get as httpGet} from 'node:http';
import type {get as HttpsGet} from 'node:https';
import type {AddressInfo} from 'node:net';
import {Readable} from 'node:stream';
import {openHttpsByteStream, exactLengthStream, type ByteStreamRequest} from '../../apps/api/src/media/byte-stream.ts';
import type {MediaAsset} from '../../packages/core/src/media-model.ts';
const params=(signal:AbortSignal):ByteStreamRequest=>({objectRef:{asset:{} as MediaAsset,identity:'"sealed"',bytes:1000},start:10,endInclusive:19,signal});
async function consume(s:Readable){const b=[];for await(const c of s)b.push(c);return Buffer.concat(b);}
test('real HTTP storage protocol: only exact 206 identity/length/range accepted; ignores and redirects rejected',async()=>{
    let mode='good';const seen:Array<Record<string,unknown>>=[];
    const server=createServer((req,res)=>{
        seen.push(req.headers);let status=206,headers:Record<string,string>={'content-length':'10','content-range':'bytes 10-19/1000',etag:'"sealed"'};
        if(mode==='ignored'){status=200;delete headers['content-range'];}
        if(mode==='redirect'){status=302;headers.location='https://elsewhere.invalid/private';}
        if(mode==='changed')headers.etag='"replaced"';
        if(mode==='badRange')headers['content-range']='bytes 0-9/1000';
        if(mode==='encoded')headers['content-encoding']='gzip';
        if(mode==='oversized')headers['content-length']='11';
        res.writeHead(status,headers);res.end(Buffer.alloc(Number(headers['content-length']),7));
    });
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const local='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    // Real loopback HTTP stands in for the TLS transport, not for COS service verification.
    const transport:typeof HttpsGet=((_url:unknown,options:object,callback:Parameters<typeof httpGet>[2])=>httpGet(local,options,callback)) as typeof HttpsGet;
    try{
        const opened=await openHttpsByteStream(new URL('https://synthetic.invalid/object'),params(new AbortController().signal),transport);
        assert.deepEqual(await consume(opened.stream),Buffer.alloc(10,7));assert.equal(seen[0]!.range,'bytes=10-19');assert.equal(seen[0]!['if-match'],'"sealed"');
        for(mode of ['ignored','redirect','changed','badRange','encoded','oversized'])await assert.rejects(openHttpsByteStream(new URL('https://synthetic.invalid/object'),params(new AbortController().signal),transport),{code:'MEDIA_FILE_INVALID'});
    }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
    const cancelled=new AbortController(),object={uploadId:randomUUID(),objectToken:randomUUID(),bytes:10,mime:'video/mp4'} as MediaAsset;
    const cos=new CosMediaProvider('/unused',{headObject:async()=>{cancelled.abort();return {statusCode:200,headers:{'content-length':'10'},ETag:'"sealed"'};}} as unknown as COS,{Bucket:'synthetic-123456',Region:'ap-guangzhou'},'once');
    await assert.rejects(cos.statImmutableObject(object,cancelled.signal),{code:'MEDIA_CANCELLED'},'client cancellation must not be misclassified as corruption/quarantine');
});
test('bounded stream detects truncated/oversized bodies and cancels upstream without buffering full object',async()=>{
    for(const n of [9,11]){
        const output=exactLengthStream(Readable.from([Buffer.alloc(n)]),10,new AbortController().signal);
        await assert.rejects(consume(output.stream),{code:'MEDIA_FILE_INVALID'});
    }
    let produced=0;const input=new Readable({highWaterMark:65536,read(){produced++;this.push(Buffer.alloc(65536));}}),abort=new AbortController();
    const bounded=exactLengthStream(input,200000000,abort.signal);await new Promise<void>(r=>setImmediate(r));
    assert.ok(produced<=4,'backpressure bounds unread upstream production');assert.ok(bounded.stream.readableLength<=65536);abort.abort();assert.equal(input.destroyed,true);assert.equal(bounded.stream.destroyed,true);
});
