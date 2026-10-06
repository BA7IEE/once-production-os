/** Fictional read projections for the isolated preview only. Production transport is unchanged. */
import {ENDPOINTS} from './generated/requests.ts';
import type {Me,CatalogItem} from './dto.ts';
import type {DirectoryMatch} from './talent-directory.tsx';
const id=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const stamp='2026-10-06T01:00:00.000Z';
export const previewMe:Me={membershipId:id(1),displayName:'预览成员',workspaceName:'虚构制作工作空间',role:'ADMIN',permissions:['talent.review','sources.read','sources.review','assets.read','records.write','data.export','ai.use','records.read','members.manage','data.merge','data.delete','catalog.manage','audit.read'],csrfToken:'fictional-preview-only',version:'preview',directoryStateScope:'fictional-preview-v2'};
export const previewCatalog:CatalogItem[]=[['role','model','模特'],['role','actor','演员'],['role','photographer','摄影师'],['city','shanghai','上海'],['city','beijing','北京'],['city','shenzhen','深圳'],['language','zh','中文'],['industry','fashion','时尚'],['workType','brand-film','品牌片']].map(([namespace,code,labelZh],i)=>({id:id(800+i),namespace:namespace as CatalogItem['namespace'],code:code!,labelZh:labelZh!,labelEn:code!,status:'ACTIVE',revision:1}));
const names=['林禾','陈序','江岚','周野','沈清','许南'];
export const previewPeople:DirectoryMatch[]=Array.from({length:24},(_,i)=>({id:id(100+i),isTalent:true,displayName:'示例 · '+names[i%6]+(i>=6?' '+(i+1):''),status:i%4===0?'DRAFT':'ACTIVE',revision:1,genderCode:i%2?'MALE':'FEMALE',nationalityCodes:[],ageRange:{min:24+i%7,max:24+i%7,precision:'YEAR_ONLY'},coverAssetId:null,heightCm:168+i,matchingRoleIds:[id(200+i)],roles:[{id:id(200+i),roleCode:i%3===2?'actor':'model',castingMarketCode:'DOMESTIC',experienceCode:'PROFESSIONAL'}],locations:[{locationCode:['shanghai','beijing','shenzhen'][i%3]!,relationCode:'BASE'}],languages:[{languageCode:'zh'}]}));
const works=Array.from({length:6},(_,i)=>({id:id(400+i),title:['秋日品牌形象片','城市光影肖像','轻运动产品摄影'][i%3]+' · 示例 '+(i+1),industryCode:'fashion',workTypeCodes:['brand-film'],origin:i%2?'EXTERNAL':'ONCE',status:'ACTIVE',revision:1,updatedAt:stamp,datePrecision:'UNKNOWN',coverAssetId:null}));
const projects=Array.from({length:4},(_,i)=>({id:id(500+i),title:['品牌形象制作','产品发布拍摄'][i%2]+' · 示例 '+(i+1),status:i%2?'DRAFT':'ACTIVE',revision:1,updatedAt:stamp}));
const lists=[{id:id(550),title:'秋日品牌片 · 候选',brief:'虚构需求：自然气质，生活方式与品牌形象。',scopeId:id(2),maintainerId:id(1),revision:1,createdAt:stamp,updatedAt:stamp}];
const tasks=[{id:id(600),kind:'CLAIM',title:'示例 · 林禾的归属申请',state:'PENDING',updatedAt:stamp,description:'核对申请人与档案的关系，资料字段另行审核。'},{id:id(601),kind:'SUBMISSION',title:'示例 · 陈序的简介更新',state:'SUBMITTED',updatedAt:stamp,description:'本次提交修改简介；逐项核对原值与新值。'}];
let mode:'normal'|'empty'|'error'='normal';
export function previewScenario(value:typeof mode){mode=value;}
const paginate=(items:unknown[],page=1,pageSize=20)=>({items:items.slice((page-1)*pageSize,page*pageSize),total:items.length,page,pageSize});
const detail=(key:string)=>{
 const p=previewPeople.find(p=>p.id===key)??previewPeople[0]!;
 const base={personId:p.id,sourceId:id(700),revision:1,createdAt:stamp,updatedAt:stamp,unavailableFields:[],usable:true};
 const empty=Object.fromEntries(['talentProfiles','personRoles','personCapabilities','personLanguages','talentLocations','castingProfiles','measurementSets','adultEligibilities','representations','personExternalRefs','personCredentials','translatorLanguagePairs','translatorServiceModes','mediaCollections','mediaCollectionTags'].map(k=>[k,[]]));
 return {id:p.id,displayName:p.displayName,intro:'虚构制作资料，用于评审真实人才档案页面。擅长自然风格、生活方式与品牌形象拍摄。',aliases:[],revision:1,originSourceId:id(700),originAvailable:true,scopeId:id(2),status:p.status,ageRange:p.ageRange,isTalent:true,canEdit:true,adultState:'UNKNOWN',facts:{...empty,talentProfiles:[{...base,id:id(900),status:'ACTIVE',genderCode:p.genderCode,nationalityCodes:[],coverAssetId:null}],personRoles:p.roles.map(r=>({...base,...r})),talentLocations:p.locations.map((r,i)=>({...base,id:id(920+i),...r})),personLanguages:[{...base,id:id(930),languageCode:'zh'}]}};
};
export function installPreviewReads(){
 const original=window.fetch.bind(window);
 window.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
  if(!url.pathname.startsWith('/api/v1/'))return original(input,init);
  const path=url.pathname.slice('/api/v1'.length),method=init?.method??'GET';
  const route=Object.entries(ENDPOINTS).find(([,r])=>r.method===method&&new RegExp('^'+r.path.replace(/\{[^}]+\}/g,'[^/]+')+'$').test(path));
  const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
  const fail=(message:string,status=422)=>response({error:{code:'FICTIONAL_PREVIEW_ONLY',message}},status);
  if(!route||route[1].mode!=='READ')return fail('此虚构预览不执行提交、核验或凭证操作。真实保存需连接已授权后端。');
  const op=route[0],body=typeof init?.body==='string'?JSON.parse(init.body):{},page=Number(body.page??url.searchParams.get('page')??1),pageSize=Number(body.pageSize??url.searchParams.get('pageSize')??20);
  if(op==='identity.me')return response(previewMe);
  if(mode==='error')return fail('虚构读取失败场景：当前输入保留，未发送真实请求。',503);
  if(op==='dashboard.get')return response({recentPeople:mode==='empty'?[]:previewPeople.slice(0,4).map(p=>({...p,createdAt:stamp})),pendingJobs:2,failedJobs:0});
  if(op==='catalog.list')return response({items:previewCatalog});
  if(op==='scope.list')return response({items:[{id:id(2),name:'虚构制作资料 · 仅供评审'}]});
  if(op==='review.search')return response({...paginate(mode==='empty'?[]:tasks.filter(t=>body.kind==='ALL'||!body.kind||t.kind===body.kind),page,pageSize),counts:{TODO:2,SENT:0,DONE:0}});
  if(op==='review.get')return response({id:id(600),revision:1,state:'PENDING',canApprove:false,canReject:false,admissionUntil:'2027-01-01',kind:'CLAIM',relation:'SELF',adultDeclared:true,targetName:'示例 · 林禾'});
  if(op==='talent.submission.get')return response({id:id(601),personId:id(101),revision:1,state:'SUBMITTED',items:[{clientItemKey:'intro',kind:'IDENTITY_TEXT',field:'intro',currentValue:'擅长生活方式拍摄。',value:'擅长生活方式与品牌形象拍摄。',dependsOn:[]}],media:[]});
  if(op==='directory.talent.search'){
   const list=mode==='empty'?[]:previewPeople.filter(p=>(!body.q||p.displayName.includes(body.q))&&(!body.role?.length||p.roles.some(r=>body.role.includes(r.roleCode)))&&(!body.location?.length||p.locations.some(r=>body.location.includes(r.locationCode))));
   return response({...paginate(list,page,pageSize),facets:{}});
  }
  if(op==='directory.talent.get')return response(detail(path.split('/').pop()!));
  if(op==='source.get')return response({id:id(700),revision:1,title:'虚构资料来源',status:'ACTIVE',current:true,basisMode:'INTERNAL_REVIEW',providerName:'虚构预览提供者',validUntil:'2027-01-01'});
  if(op==='shortlist.list')return response(paginate(mode==='empty'?[]:lists,page,pageSize));
  if(op==='shortlist.get')return response({...lists[0],canEdit:true,items:[],scope:{id:id(2),name:'虚构制作资料'}});
  if(op==='work.list'||op==='project.list'){const q=url.searchParams.get('q')??'';return response(paginate(mode==='empty'?[]:(op==='work.list'?works:projects).filter(w=>w.title.includes(q)),page,pageSize));}
  if(op==='work.get'){const w=works.find(w=>path.endsWith(w.id))??works[0]!;return response({...w,sourceId:id(700),scopeId:id(2),maintainerId:id(1),description:'虚构品牌形象拍摄案例，展示实际作品详情结构。',originNote:'人工示例制作记录',canEdit:true,items:[],credits:[],projects:[]});}
  if(op==='project.get'){const p=projects.find(p=>path.endsWith(p.id))??projects[0]!;return response({...p,sourceId:id(700),scopeId:id(2),maintainerId:id(1),brief:'虚构项目需求：品牌形象制作与产品发布拍摄。',locationNote:'上海 · 虚构影棚',dateNote:'时间待确认',reviewNote:'',parties:{client:null,brand:null,hasUnavailable:false},canEdit:true,participants:[],works:[]});}
  if(op==='shortlist.selection')return response({items:previewPeople.filter(p=>body.personIds?.includes(p.id)).map(p=>({id:p.id,displayName:p.displayName,unavailable:false}))});
  return fail('此虚构预览尚未提供该读取场景。该功能在正式应用中使用真实权限与数据。');
 };
}
