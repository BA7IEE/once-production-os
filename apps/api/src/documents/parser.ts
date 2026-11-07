import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,lstat,realpath,rm,chmod} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {promisify} from 'node:util';
import {DOCUMENT_LIMITS,validateDocumentManifest,type DocumentManifest} from '../../../../packages/core/src/document-schema.ts';
import {parseStrictJson} from '../../../../packages/core/src/json.ts';
import {AppError,invariant} from '../../../../packages/core/src/errors.ts';

const execute=promisify(execFile);
const knownErrors=new Set(['PDF_PASSWORD_REQUIRED','PDF_INVALID','PAGE_LIMIT_EXCEEDED','PAGE_SELECTION_INVALID',
    'FILE_SIZE_EXCEEDED','IMAGE_FORMAT_UNSUPPORTED','IMAGE_PIXELS_EXCEEDED','INPUT_CHANGED','INPUT_FILE_INVALID',
    'NO_PAGES_EXTRACTED','OUTPUT_LIMIT_EXCEEDED']);
export interface ParsedDocument {
    manifest:DocumentManifest;
    directory:string;
    /** Caller owns the result until published. Always dispose in finally. */
    dispose():Promise<void>;
}

/** Count pages without rendering the entire document. Discovery has the same
 * private directory, credential-free child, byte digest and deadline boundary. */
export async function inspectDocumentFile(input:{path:string;sha256:string;bytes:number;workRoot:string;signal:AbortSignal}):Promise<number>{
    input.signal.throwIfAborted();
    invariant(isAbsolute(input.path)&&isAbsolute(input.workRoot)&&await realpath(input.workRoot)===resolve(input.workRoot),'DOCUMENT_PATH_INVALID','材料处理目录无效',503);
    const source=await lstat(input.path);
    invariant(source.isFile()&&!source.isSymbolicLink()&&source.size===input.bytes&&input.bytes>0&&input.bytes<=DOCUMENT_LIMITS.inputBytes,'DOCUMENT_INPUT_INVALID','材料文件大小或类型无效',422);
    let stdout:string;
    try{
        ({stdout}=await execute('python3',[resolve('workers/document-parser/parser.py'),'--input',input.path,'--output',join(input.workRoot,'unused-inspection-output'),'--inspect'],{
            cwd:input.workRoot,env:{PATH:process.env.PATH??'/usr/bin:/bin',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',LANG:'C.UTF-8'},
            timeout:90000,maxBuffer:65536,killSignal:'SIGKILL',signal:input.signal,encoding:'utf8'}));
    }catch(error){
        let code='DOCUMENT_EXTRACTION_FAILED';
        try{const body=JSON.parse(String((error as {stdout?:string}).stdout??''));if(knownErrors.has(body.error))code=body.error;}catch{}
        throw new AppError(422,code,'材料页数读取失败，请检查文件；整份解析最多支持 100 页');
    }
    const result=parseStrictJson(stdout) as {totalPages:number;sha256:string;bytes:number};
    invariant(result&&Number.isSafeInteger(result.totalPages)&&result.totalPages>0&&result.totalPages<=DOCUMENT_LIMITS.pages,'DOCUMENT_OUTPUT_INVALID','材料页数无效',422);
    invariant(result.sha256===input.sha256&&result.bytes===input.bytes,'DOCUMENT_INPUT_CHANGED','材料在处理过程中发生变化',409);
    return result.totalPages;
}

/** Local file processing only: caller must authorize the input before invoking this
 * adapter. The child receives no application, provider or database credentials. */
export async function parseDocumentFile(input:{path:string;sha256:string;bytes:number;workRoot:string;
    signal:AbortSignal;pages?:number[];python?:string;script?:string}):Promise<ParsedDocument>{
    input.signal.throwIfAborted();
    invariant(isAbsolute(input.path)&&isAbsolute(input.workRoot),'DOCUMENT_PATH_INVALID','材料处理目录无效',503);
    invariant(await realpath(input.workRoot)===resolve(input.workRoot),'DOCUMENT_PATH_INVALID','材料处理目录无效',503);
    const source=await lstat(input.path);
    invariant(source.isFile()&&!source.isSymbolicLink()&&source.size===input.bytes&&input.bytes>0&&input.bytes<=DOCUMENT_LIMITS.inputBytes,
        'DOCUMENT_INPUT_INVALID','材料文件大小或类型无效',422);
    if(input.pages)invariant(input.pages.length>0&&input.pages.length<=DOCUMENT_LIMITS.pages&&new Set(input.pages).size===input.pages.length
        &&input.pages.every(p=>Number.isSafeInteger(p)&&p>0),'DOCUMENT_PAGES_INVALID','选择的页码无效',422);
    const directory=await mkdtemp(join(input.workRoot,'document-'));
    await chmod(directory,0o700);
    const output=join(directory,'parsed'),dispose=()=>rm(directory,{recursive:true,force:true});
    try{
        const args=[resolve(input.script??'workers/document-parser/parser.py'),'--input',input.path,'--output',output];
        if(input.pages)args.push('--pages',input.pages.join(','));
        let stdout:string;
        try{
            const result=await execute(input.python??'python3',args,{cwd:directory,
                env:{PATH:process.env.PATH??'/usr/bin:/bin',PYTHONNOUSERSITE:'1',PYTHONDONTWRITEBYTECODE:'1',LANG:'C.UTF-8'},
                timeout:90000,maxBuffer:65536,killSignal:'SIGKILL',signal:input.signal,encoding:'utf8'});
            stdout=result.stdout;
        }catch(error){
            // Never propagate child stderr, paths or native codec exceptions.
            let code='DOCUMENT_EXTRACTION_FAILED';
            try{const body=JSON.parse(String((error as {stdout?:string}).stdout??''));if(knownErrors.has(body.error))code=body.error;}catch{}
            throw new AppError(422,code,'材料解析未完成，请检查文件或选择较少页面重试');
        }
        const summary=JSON.parse(stdout);
        invariant(summary.manifest==='manifest.json'&&['READY','PARTIAL'].includes(summary.status),'DOCUMENT_OUTPUT_INVALID','解析结果无效',422);
        const manifestPath=join(output,'manifest.json'),stat=await lstat(manifestPath);
        invariant(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=DOCUMENT_LIMITS.manifestBytes,'DOCUMENT_OUTPUT_INVALID','解析清单无效',422);
        const manifest=validateDocumentManifest(parseStrictJson(await readFile(manifestPath,'utf8')));
        invariant(manifest.input.sha256===input.sha256&&manifest.input.bytes===input.bytes,
            'DOCUMENT_INPUT_CHANGED','材料在处理过程中发生变化',409);
        const files=new Map(manifest.pages.flatMap(p=>[p.image,...p.images.flatMap(i=>[i.image,...i.nativeImage?[i.nativeImage]:[]])]).map(f=>[f.file,f]));
        for(const file of files.values()){
            input.signal.throwIfAborted();
            const path=join(output,file.file),entry=await lstat(path);
            invariant(entry.isFile()&&!entry.isSymbolicLink()&&entry.size===file.bytes,'DOCUMENT_OUTPUT_INVALID','解析图片不完整',422);
            const bytes=await readFile(path);
            invariant(createHash('sha256').update(bytes).digest('hex')===file.sha256,'DOCUMENT_OUTPUT_INVALID','解析图片校验失败',422);
        }
        return {manifest,directory:output,dispose};
    }catch(error){await dispose();throw error;}
}
