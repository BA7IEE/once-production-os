import {NativeDocumentFields,validateNativeDocumentValue} from './supplier-document-native.ts';
import {validateAnswerValue} from './supplier-field-validation.ts';
import {v, type Parsed, type Schema} from './validation.ts';
import {invariant} from './errors.ts';

export const DOCUMENT_PAGES_VERSION = 'once-document-pages-v1';
export const DOCUMENT_PROPOSAL_VERSION = 'once-document-proposal-v1';
export const DOCUMENT_LIMITS = Object.freeze({pages:100, pageText:20000, regions:500, images:500,
    inputBytes:50000000, outputBytes:256000000, manifestBytes:16000000, modelPages:4,
    fields:60, works:50, generatedRegions:100});

const key = v.string(100, 1, /^[A-Za-z0-9_-]+$/);
const hash = v.string(64,64,/^[a-f0-9]{64}$/);
const boxArray = v.array(v.number(0,1,false),4,4);
export const DocumentRegionSchema:Schema<number[]> = {
    json:boxArray.json,
    parse(value,path){
        const box=boxArray.parse(value,path);
        invariant(box[0]!<box[2]!&&box[1]!<box[3]!, 'DOCUMENT_REGION_INVALID','材料定位区域无效',422);
        return box;
    }
};
const image = v.object({file:v.string(100,1,/^(?:page-[0-9]{4,7}|image-0001|p[0-9]+_i[0-9]+-(?:crop|object))\.png$/),
    sha256:hash,bytes:v.number(1,DOCUMENT_LIMITS.outputBytes),width:v.number(1,60000000),height:v.number(1,60000000),mime:v.enum(['image/png'])});
const page = v.object({page:v.number(1,1000000),width:v.number(0.001,60000000,false),height:v.number(0.001,60000000,false),
    rotation:v.number(0,270),image,text:v.string(DOCUMENT_LIMITS.pageText),
    textRegions:v.array(v.object({key,bbox:DocumentRegionSchema,text:v.string(2000)}),DOCUMENT_LIMITS.regions),
    images:v.array(v.object({key,page:v.number(1,1000000),bbox:DocumentRegionSchema,
        method:v.enum(['PAGE_CROP','UPLOADED_IMAGE']),image,nativeImage:v.nullable(image)}),DOCUMENT_LIMITS.images),
    needsVisualText:v.boolean(),warnings:v.array(v.string(100,1,/^[A-Z_]+$/),20)});
export const DocumentManifestSchema = v.object({
    schemaVersion:v.enum([DOCUMENT_PAGES_VERSION]),parserVersion:v.enum(['1.0.0']),
    runtime:v.object({pypdfium2:v.string(50,1),pillow:v.string(50,1)}),
    input:v.object({sha256:hash,bytes:v.number(1,DOCUMENT_LIMITS.inputBytes),kind:v.enum(['PDF','IMAGE'])}),
    status:v.enum(['READY','PARTIAL']),totalPages:v.number(1,1000000),requestedPages:v.array(v.number(1,1000000),DOCUMENT_LIMITS.pages,1),
    pages:v.array(page,DOCUMENT_LIMITS.pages,1),failedPages:v.array(v.object({page:v.number(1,1000000),code:v.enum(['PAGE_EXTRACTION_FAILED'])}),DOCUMENT_LIMITS.pages),
    outputBytes:v.number(1,DOCUMENT_LIMITS.outputBytes)
});
export type DocumentManifest=Parsed<typeof DocumentManifestSchema>;
export type DocumentImage=Parsed<typeof image>;

/** Validate relationships as well as shape: neither a model nor a corrupted manifest
 * may silently replace missing pages with a claim of full coverage. */
export function validateDocumentManifest(value:unknown):DocumentManifest {
    const m=DocumentManifestSchema.parse(value), requested=new Set(m.requestedPages);
    const covered=[...m.pages.map(p=>p.page),...m.failedPages.map(p=>p.page)];
    invariant(requested.size===m.requestedPages.length&&m.requestedPages.every(p=>p<=m.totalPages)
        &&new Set(covered).size===covered.length&&covered.length===requested.size&&covered.every(p=>requested.has(p)),
        'DOCUMENT_COVERAGE_INVALID','材料处理页数不一致',422);
    invariant(m.status!=='READY'||!m.failedPages.length&&requested.size===m.totalPages
        &&m.pages.every(p=>p.warnings.every(w=>!w.includes('TRUNCATED'))),
        'DOCUMENT_COVERAGE_INVALID','部分材料不能标记为全部完成',422);
    const files=new Map<string,DocumentImage>(), keys=new Set<string>();
    for(const p of m.pages){
        invariant([0,90,180,270].includes(p.rotation),'DOCUMENT_ROTATION_INVALID','页面旋转无效',422);
        invariant(p.image.file===`page-${String(p.page).padStart(4,'0')}.png`,'DOCUMENT_IMAGE_INVALID','页面图像不匹配',422);
        for(const r of p.textRegions){invariant(!keys.has(r.key),'DOCUMENT_KEY_DUPLICATE','材料定位键重复',422);keys.add(r.key);}
        for(const i of p.images){invariant(i.page===p.page&&!keys.has(i.key),'DOCUMENT_IMAGE_INVALID','图片与页面不匹配',422);keys.add(i.key);}
        for(const file of [p.image,...p.images.flatMap(i=>[i.image,...i.nativeImage?[i.nativeImage]:[]])]){
            invariant(file.width*file.height<=60000000,'DOCUMENT_IMAGE_INVALID','图片像素超限',422);
            const previous=files.get(file.file);
            invariant(!previous||previous.sha256===file.sha256&&previous.bytes===file.bytes,'DOCUMENT_IMAGE_INVALID','图片清单冲突',422);
            files.set(file.file,file);
        }
    }
    invariant(m.pages.reduce((n,p)=>n+p.images.length,0)<=DOCUMENT_LIMITS.images,'DOCUMENT_IMAGE_LIMIT','提取图片过多',422);
    invariant([...files.values()].reduce((n,f)=>n+f.bytes,0)<=m.outputBytes,'DOCUMENT_OUTPUT_INVALID','材料输出大小不一致',422);
    return m;
}

export const DOCUMENT_FIELDS = ['displayName','aliases','intro','roleCodes','locationCodes','languageCodes','skillCodes',
    'heightCm','bustCm','waistCm','hipsCm','shoeSize','clothingSize','contacts'] as const;
const fieldValues:Record<typeof DOCUMENT_FIELDS[number],Schema<unknown>>={
    displayName:v.string(120,1), aliases:v.array(v.string(120,1),20),intro:v.string(5000),
    roleCodes:v.array(key,20,1),locationCodes:v.array(key,20),languageCodes:v.array(key,20),skillCodes:v.array(key,30),
    heightCm:v.number(50,250,false),bustCm:v.number(20,250,false),waistCm:v.number(20,250,false),hipsCm:v.number(20,250,false),
    shoeSize:v.string(50,1),clothingSize:v.string(50,1),
    contacts:v.array(v.object({kind:v.enum(['PHONE','EMAIL','WECHAT','OTHER']),value:v.string(200,1)}),10)
};
const evidence=v.object({page:v.number(1,1000000),bbox:v.nullable(DocumentRegionSchema),
    kind:v.enum(['TEXT','VISUAL']),quote:v.nullable(v.string(1000,1))});
const proposal = v.object({schemaVersion:v.enum([DOCUMENT_PROPOSAL_VERSION]),
    nativeFields:v.optional(v.array(v.object({key,field:v.enum(NativeDocumentFields),value:v.unknown(),evidence:v.array(evidence,10,1)}),4)),
    documentKind:v.optional(v.enum(['PERSON_PROFILE','COMPANY_PROFILE','SHOOT_BRIEF','OTHER','UNKNOWN'])),
    subjectAssociation:v.optional(v.enum(['EXPLICIT_AUTHOR','UNCERTAIN'])),
    professionalFields:v.optional(v.array(v.object({key,fieldCode:v.string(60,1),roleCode:v.nullable(key),value:v.unknown(),evidence:v.array(evidence,10,1)}),60)),
    fields:v.array(v.object({key,field:v.enum(DOCUMENT_FIELDS),value:v.unknown(),evidence:v.array(evidence,10,1)}),DOCUMENT_LIMITS.fields),
    images:v.array(v.object({key,page:v.number(1,1000000),bbox:DocumentRegionSchema,
        purpose:v.enum(['PORTRAIT','PORTFOLIO','DOCUMENT','OTHER'])}),DOCUMENT_LIMITS.generatedRegions),
    works:v.array(v.object({key,title:v.string(160,1),description:v.string(5000),roleCode:v.nullable(key),
        brandDisplayName:v.string(200),dateText:v.string(100),imageKeys:v.array(key,30),evidence:v.array(evidence,10,1)}),DOCUMENT_LIMITS.works),
    unknowns:v.array(v.object({targetKey:v.nullable(key),field:v.string(100,1),reason:v.string(500,1)}),100)
});
export const DocumentProposalSchema:typeof proposal={...proposal,parse(value,path){
    const p=proposal.parse(value,path);
    return {...p,fields:p.fields.map(f=>({...f,value:fieldValues[f.field].parse(f.value,`fields.${f.field}`)}))};
}};
export type DocumentProposal=Omit<Parsed<typeof DocumentProposalSchema>,'documentKind'|'subjectAssociation'|'professionalFields'|'nativeFields'> & Partial<Pick<Parsed<typeof DocumentProposalSchema>,'documentKind'|'subjectAssociation'|'professionalFields'|'nativeFields'>>;
export interface DocumentDictionary {roles:string[];locations:string[];languages:string[];skills:string[];professional?:import('./supplier-field-contract.ts').SupplierCatalogView;subjectPolicy?:'SUPPLIER_SUBJECT_V2';native?:{capabilities:Array<{code:string;label:string;applicableRoleCodes:string[];levelSchemeCode:string|null}>;languages:Array<{code:string;label:string}>};}

export function validateDocumentProposal(value:unknown, manifest:DocumentManifest, dictionary:DocumentDictionary):DocumentProposal {
    const p=DocumentProposalSchema.parse(value), pages=new Map(manifest.pages.map(x=>[x.page,x]));
    const keys=new Set<string>(),fields=new Set<string>();
    const inputImageKeys=new Set(manifest.pages.flatMap(x=>x.images.map(i=>i.key)));
    for(const item of [...p.fields,...p.images,...p.works,...p.professionalFields??[],...p.nativeFields??[]]){
        invariant(!keys.has(item.key)&&!inputImageKeys.has(item.key),'DOCUMENT_KEY_DUPLICATE','解析候选键重复',422);keys.add(item.key);
    }
    const mappings={roleCodes:dictionary.roles,locationCodes:dictionary.locations,languageCodes:dictionary.languages,skillCodes:dictionary.skills};
    const checkEvidence=(entries:Parsed<typeof evidence>[])=>{
        for(const e of entries){
            const page=pages.get(e.page);
            invariant(page,'DOCUMENT_EVIDENCE_INVALID','解析引用了未处理页面',422);
            if(e.kind==='TEXT')invariant(e.quote&&page.text.includes(e.quote),'DOCUMENT_EVIDENCE_INVALID','引用文字与原材料不一致',422);
            else invariant(e.bbox,'DOCUMENT_EVIDENCE_INVALID','图像识别必须提供核对区域',422);
        }
    };
    if(dictionary.subjectPolicy==='SUPPLIER_SUBJECT_V2')invariant(p.documentKind&&p.subjectAssociation,'DOCUMENT_SUBJECT_REQUIRED','解析须先区分材料类型和资料主体',422);
    if(p.documentKind&&p.documentKind!=='PERSON_PROFILE'||p.subjectAssociation==='UNCERTAIN')invariant(!p.fields.length&&!p.nativeFields?.length&&!p.professionalFields?.length&&!p.works.length&&!p.images.some(i=>i.purpose==='PORTRAIT'),'DOCUMENT_SUBJECT_MISMATCH','公司介绍、拍摄需求及主体不明材料不能填入个人档案或生成本人作品',422);
    const professionalKeys=new Set<string>();
    for(const f of p.professionalFields??[]){const catalog=dictionary.professional?.definition,field=catalog?.fields.find(d=>d.code===f.fieldCode&&d.ai==='SUGGEST'&&d.visibility==='SELF_SHARED');
        invariant(field&&catalog,'DOCUMENT_PROFESSIONAL_UNKNOWN','专业字段没有对应的解析目录',422);
        invariant(p.documentKind==='PERSON_PROFILE'&&p.subjectAssociation==='EXPLICIT_AUTHOR','DOCUMENT_SUBJECT_MISMATCH','专业资料须来自主体明确的个人材料',422);
        invariant(field.owner==='PERSON'?f.roleCode===null:!!f.roleCode&&dictionary.roles.includes(f.roleCode)&&(!field.roles.length||field.roles.includes(f.roleCode)),'DOCUMENT_PROFESSIONAL_ROLE','专业资料和职业不匹配',422);
        const identity=(f.roleCode??'person')+':'+f.fieldCode;invariant(!professionalKeys.has(identity),'DOCUMENT_FIELD_DUPLICATE','同一职业字段应只提出一项建议',422);professionalKeys.add(identity);
        f.value=validateAnswerValue(f.value,field);checkEvidence(f.evidence);
    }
    const nativeKeys=new Set<string>();for(const f of p.nativeFields??[]){invariant(p.documentKind==='PERSON_PROFILE'&&p.subjectAssociation==='EXPLICIT_AUTHOR','DOCUMENT_SUBJECT_MISMATCH','专业资料须来自主体明确的个人材料',422);invariant(!nativeKeys.has(f.field),'DOCUMENT_FIELD_DUPLICATE','同类专业记录应合并为一项建议',422);nativeKeys.add(f.field);f.value=validateNativeDocumentValue(f.field,f.value,dictionary);checkEvidence(f.evidence);}
    for(const f of p.fields){
        invariant(!fields.has(f.field),'DOCUMENT_FIELD_DUPLICATE','同一字段应作为一次建议返回',422);fields.add(f.field);
        checkEvidence(f.evidence);
        if(Object.hasOwn(mappings,f.field)){
            const allowed=mappings[f.field as keyof typeof mappings], values=f.value as string[];
            invariant(new Set(values).size===values.length&&values.every(x=>allowed.includes(x)),
                'DOCUMENT_DICTIONARY_INVALID','解析包含未收录选项，请保留原文并人工核对',422);
        }
    }
    for(const i of p.images)invariant(pages.has(i.page),'DOCUMENT_IMAGE_INVALID','图片引用了未处理页面',422);
    const imageKeys=new Set([...inputImageKeys,...p.images.map(i=>i.key)]);
    for(const w of p.works){
        checkEvidence(w.evidence);
        invariant(!w.roleCode||dictionary.roles.includes(w.roleCode),'DOCUMENT_DICTIONARY_INVALID','作品职责未收录',422);
        invariant(new Set(w.imageKeys).size===w.imageKeys.length&&w.imageKeys.every(k=>imageKeys.has(k)),
            'DOCUMENT_WORK_IMAGES_INVALID','作品引用了不存在或重复的图片',422);
    }
    for(const u of p.unknowns)invariant(u.targetKey===null||keys.has(u.targetKey),'DOCUMENT_UNKNOWN_TARGET','缺项提示引用了不存在的候选',422);
    return p;
}
