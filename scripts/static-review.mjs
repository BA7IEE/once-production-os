import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import { createRequire } from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const root=process.cwd();const checks=[];function record(name,passed,detail){checks.push({name,passed,detail});}
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)]);}
const sources=['packages/core/src','apps/api/src','apps/admin-web/src'].flatMap(files).filter(p=>/\.tsx?$/.test(p));sources.push('apps/admin-web/vite.config.ts');let diagnostics=[];
for(const file of sources){const r=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,experimentalDecorators:true,emitDecoratorMetadata:true,rewriteRelativeImportExtensions:true}});for(const d of r.diagnostics??[])if(d.category===ts.DiagnosticCategory.Error)diagnostics.push({file,message:ts.flattenDiagnosticMessageText(d.messageText,'\n')});}
record('typescript-syntax-transpile',diagnostics.length===0,{files:sources.length,diagnostics,note:'Syntax emit only. Not dependency resolution, full typecheck, Nest/Vite build, or browser execution.'});
const prod=sources.map(f=>[f,fs.readFileSync(f,'utf8')]);
record('test-double-not-in-production',prod.every(([,s])=>!s.includes('MemoryStore')&&!s.includes('/tests/support')),null);
const web=prod.filter(([f])=>f.includes('admin-web'));
const forbidden=[];for(const[file,text]of web){const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);const visit=node=>{if(ts.isIdentifier(node)&&['localStorage','sessionStorage','dangerouslySetInnerHTML','eval'].includes(node.text))forbidden.push({file,name:node.text});ts.forEachChild(node,visit);};visit(tree);}
record('no-business-localStorage-or-unsafe-html',forbidden.length===0,{forbidden,note:'AST identifier check; not a complete XSS or data-loss audit.'});
const artifacts=JSON.parse(fs.readFileSync('artifacts/openapi.json','utf8'));const routes=Object.values(artifacts.paths).flatMap(p=>Object.values(p));
record('unique-route-operation-identities',new Set(routes.map(r=>r.operationId)).size===routes.length,{routes:routes.length});
record('strict-request-object-schemas',routes.filter(r=>r.requestBody).every(r=>r.requestBody.content['application/json'].schema.additionalProperties===false),null);
record('command-key-header-required',routes.filter(r=>r['x-mode']==='COMMAND').every(r=>r.parameters.some(p=>p.name==='Idempotency-Key'&&p.required)),null);
record('no-deferred-http-surfaces',Object.keys(artifacts.paths).every(p=>!/(publish|anqicms|share|quote|invoice|ai\/)/.test(p)),null);
const migration=fs.readFileSync('prisma/migrations/202609220001_initial/migration.sql','utf8');
record('candidate-migration-typed-tables',(migration.match(/CREATE TABLE/g)||[]).length===17,{tables:17,note:'Text inspection only, not PostgreSQL execution.'});
record('candidate-composite-FKs',migration.includes('FOREIGN KEY ("workspaceId", "sourceId")')&&migration.includes('FOREIGN KEY ("workspaceId", "membershipId")'),null);
record('candidate-job-lease-constraint',migration.includes('"state" = \'RUNNING\' AND "leaseToken" IS NOT NULL'),null);
record('no-fake-lockfile',!fs.existsSync('pnpm-lock.yaml')||fs.readFileSync('pnpm-lock.yaml','utf8').includes('snapshots:'),{note:'Lockfile shape only; dependency resolution and audit are separate checks.'});
const report={generatedAt:new Date().toISOString(),node:process.version,typescript:ts.version,scope:'static-source-and-contract',pass:checks.filter(c=>c.passed).length,fail:checks.filter(c=>!c.passed).length,checks};fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/static-review.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(report.fail)process.exitCode=1;
