import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import sharp from 'sharp';
import {registeredTemp} from '../../scripts/registered-temp.mjs';
import {parseDocumentFile,inspectDocumentFile} from '../../apps/api/src/documents/parser.ts';

async function fixture(run){
    const temporary=registeredTemp();
    try{
        execFileSync('python3',[resolve('tests/documents/fixtures.py'),temporary.path],{timeout:15000,stdio:'pipe'});
        const parse=async(name,extra={})=>{
            const path=join(temporary.path,name),bytes=await readFile(path);
            return parseDocumentFile({path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,
                workRoot:temporary.path,signal:new AbortController().signal,...extra});
        };
        await run(parse,temporary.path);
    }finally{temporary.cleanup();}
}

test('real PDF produces native text, located regions and actual standalone images, including a rotated page',async()=>{
    await fixture(async parse=>{
        const result=await parse('portfolio.pdf');
        try{
            const m=result.manifest;
            assert.equal(m.status,'READY');assert.equal(m.pages.length,2);assert.equal(m.totalPages,2);
            assert.match(m.pages[0].text,/Lin He/);assert.match(m.pages[0].text,/sample@example.invalid/);
            assert.ok(m.pages[0].textRegions.some(r=>r.text.includes('Director')));
            assert.equal(m.pages[1].rotation,90);
            for(const page of m.pages){
                assert.equal(page.images.length,1);
                const crop=page.images[0];
                assert.ok(crop.bbox.every(x=>x>=0&&x<=1));assert.ok(crop.nativeImage);
                assert.notEqual(crop.image.sha256,page.image.sha256);
                const png=await sharp(join(result.directory,crop.image.file)).raw().toBuffer({resolveWithObject:true});
                // Real crop content must contain the synthetic photograph's red and
                // blue halves; merely returning a placeholder or blank page fails.
                let red=0,blue=0;
                for(let i=0;i<png.data.length;i+=png.info.channels){
                    if(png.data[i]>150&&png.data[i+2]<100)red++;
                    if(png.data[i+2]>150&&png.data[i]<100)blue++;
                }
                const pixels=png.info.width*png.info.height;
                assert.ok(red/pixels>0.35);assert.ok(blue/pixels>0.35);
            }
        }finally{await result.dispose();}
        await assert.rejects(stat(result.directory),{code:'ENOENT'});
    });
});

test('scanned PDF keeps its visual input without pretending native text was recognized',async()=>{
    await fixture(async parse=>{
        const result=await parse('scan.pdf');
        try{
            assert.equal(result.manifest.pages[0].needsVisualText,true);
            assert.equal(result.manifest.pages[0].text,'');
            assert.equal(result.manifest.pages[0].images.length,1);
            assert.ok(result.manifest.pages[0].image.bytes>1000);
        }finally{await result.dispose();}
    });
});

test('selected pages are explicitly partial and retain original page numbers',async()=>{
    await fixture(async parse=>{
        const result=await parse('portfolio.pdf',{pages:[2]});
        try{assert.equal(result.manifest.status,'PARTIAL');assert.equal(result.manifest.totalPages,2);
            assert.deepEqual(result.manifest.requestedPages,[2]);assert.equal(result.manifest.pages[0].page,2);
        }finally{await result.dispose();}
    });
});

test('uploaded image yields a visual page and separately preserved image',async()=>{
    await fixture(async parse=>{
        const result=await parse('photo.png');
        try{const page=result.manifest.pages[0];assert.equal(result.manifest.input.kind,'IMAGE');
            assert.equal(page.images[0].method,'UPLOADED_IMAGE');assert.equal(page.images[0].nativeImage.width,480);
        }finally{await result.dispose();}
    });
});

test('password, damaged input, stale digest and invalid selection fail with fixed errors and no temporary files',async()=>{
    await fixture(async(parse,directory)=>{
        for(const [name,extra,code] of [
            ['password.pdf',{},'PDF_PASSWORD_REQUIRED'],['broken.pdf',{},'PDF_INVALID'],
            ['portfolio.pdf',{sha256:'0'.repeat(64)},'DOCUMENT_INPUT_CHANGED'],
            ['portfolio.pdf',{pages:[3]},'PAGE_SELECTION_INVALID'],['portfolio.pdf',{pages:[1,1]},'DOCUMENT_PAGES_INVALID']
        ]){
            await assert.rejects(parse(name,extra),error=>error.code===code&&!error.message.includes('synthetic-password'));
            assert.equal((await readdir(directory)).filter(x=>x.startsWith('document-')).length,0);
        }
    });
});

test('whole-document discovery counts pages without rendering and refuses more than 100 pages',async()=>{
    await fixture(async(_parse,directory)=>{
        for(const [name,count] of [['long-portfolio.pdf',10],['photo.png',1]]){
            const path=join(directory,name),data=await readFile(path);
            assert.equal(await inspectDocumentFile({path,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,workRoot:directory,signal:new AbortController().signal}),count);
        }
        for(const [name,code] of [['over-limit.pdf','PAGE_LIMIT_EXCEEDED'],['password.pdf','PDF_PASSWORD_REQUIRED'],['broken.pdf','PDF_INVALID']]){
            const path=join(directory,name),data=await readFile(path);
            await assert.rejects(inspectDocumentFile({path,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length,workRoot:directory,signal:new AbortController().signal}),e=>e.code===code);
        }
        assert.equal((await readdir(directory)).some(n=>n.startsWith('document-')||n==='unused-inspection-output'),false);
    });
});
