import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';import { resolve,dirname } from 'node:path';
import { ROUTES } from '../packages/core/src/routes.ts';
function tsType(schema:Record<string,unknown>):string {
  if(Array.isArray(schema.anyOf))return schema.anyOf.map(s=>tsType(s as Record<string,unknown>)).join(' | ');
  if(Array.isArray(schema.enum))return schema.enum.map(v=>JSON.stringify(v)).join(' | ');
  if(schema.type==='string')return'string';if(schema.type==='number'||schema.type==='integer')return'number';if(schema.type==='boolean')return'boolean';if(schema.type==='null')return'null';
  if(schema.type==='array')return'Array<'+tsType(schema.items as Record<string,unknown>)+'>';
  if(schema.type==='object'){const props=schema.properties as Record<string,Record<string,unknown>>;const req=schema.required as string[];return'{ '+Object.entries(props).map(([k,s])=>JSON.stringify(k)+(req.includes(k)?'':'?')+': '+tsType(s)).join('; ')+' }';}
  return'unknown';
}
const paths:Record<string,Record<string,unknown>>={};
const queryFields:Record<string,string[]>={'handoff.list':['page','pageSize','direction'],'handoff.recipients':['page','pageSize','q','purpose'],'person.list':['page','pageSize','q','role','cityCode','languageCode','status'],'source.list':['page','pageSize'],'source.history':['page','pageSize'],'member.list':['page','pageSize'],'job.list':['page','pageSize'],'audit.list':['page','pageSize']};
for(const route of ROUTES){
 const path='/api/v1'+route.path;paths[path]??={};const params:unknown[]=[];
 for(const match of route.path.matchAll(/\{(\w+)\}/g))params.push({name:match[1],in:'path',required:true,schema:{type:'string',...(match[1]==='id'?{format:'uuid'}:{enum:['person','source']})}});
 for(const name of queryFields[route.operation]??[])params.push({name,in:'query',required:false,schema:{type:'string'}});
 if(route.method!=='GET')params.push({name:'Origin',in:'header',required:true,schema:{type:'string'}},{name:'X-CSRF-Token',in:'header',required:true,schema:{type:'string'}});
 if(route.mode==='COMMAND')params.push({name:'Idempotency-Key',in:'header',required:true,schema:{type:'string',minLength:8,maxLength:128}});
 const code=['import.commit','job.resume'].includes(route.operation)?'202':['person.create','source.create','scope.create','catalog.create','import.preview','member.create','handoff.create'].includes(route.operation)?'201':'200';
 paths[path][route.method.toLowerCase()]={operationId:route.operation,parameters:params,security:route.mode==='AUTH'?[]:[{sessionCookie:[]}],
   ...(route.schema?{requestBody:{required:true,content:{'application/json':{schema:route.schema.json}}}}:{}),
   responses:{[code]:{description:route.mode==='COMMAND'?'Minimal command receipt; import commit/resume acknowledge enqueue only':'Allowlisted response DTO; see src/dto.ts'},default:{description:'Sanitized error with code, message, requestId'}},
   'x-permission':route.permission??null,'x-mode':route.mode};
}
const spec={openapi:'3.1.0',info:{title:'ONCE Internal OS — development increment 1',version:'0.1.0-dev.1',description:'Paths and strict request schemas are generated from runtime routes. Response shapes are currently TypeScript DTOs; this is not a complete response-schema validator.'},paths,components:{securitySchemes:{sessionCookie:{type:'apiKey',in:'cookie',name:'once_session'}}}};
const inputs='// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.\nexport interface Inputs {\n'+ROUTES.map(r=>'  '+JSON.stringify(r.operation)+': '+(r.schema?tsType(r.schema.json):'undefined')+';').join('\n')+'\n}\nexport const ENDPOINTS = '+JSON.stringify(Object.fromEntries(ROUTES.map(r=>[r.operation,{method:r.method,path:r.path,mode:r.mode}])),null,2)+' as const;\n';
const files:[string,string][]=[['artifacts/openapi.json',JSON.stringify(spec,null,2)+'\n'],['apps/admin-web/src/generated/requests.ts',inputs]];
const check=process.argv.includes('--check');for(const[file,content]of files){const path=resolve(file);if(check){if(readFileSync(path,'utf8')!==content)throw new Error('Generated contract drift: '+file);}else{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);}}
console.log(`Contract ${check?'verified':'generated'}: ${ROUTES.length} routes; request schemas only`);
