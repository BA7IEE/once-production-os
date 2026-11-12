/** Bind the final anonymous checks to committed source. Never reads private materials or keys. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='artifacts/once-upgrade/final';
const base='ea5bceaf41a33be87e8bf0aee3f9dca006d20a43',p06='63b2038';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=file=>readFileSync(`${root}/${file}`,'utf8');
function tap(file){
 const log=read(file),count=key=>Number([...log.matchAll(new RegExp(`^# ${key} (\\d+)$`,'gm'))].at(-1)?.[1]??-1);
 const result={tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped'),evidence:`${root}/${file}`};
 assert.ok(result.tests>0,file);assert.equal(result.passed,result.tests,file);assert.equal(result.failed,0,file);assert.equal(result.skipped,0,file);return result;
}
function zero(file){
 const remaining=JSON.parse(read(file).trim().split('\n').at(-1));
 assert.ok(Object.keys(remaining).length>=4,file);assert.ok(Object.values(remaining).every(v=>v===0),file);return remaining;
}
const core=tap('core.tap');assert.ok(core.tests>843,'complete current core suite, beyond P01');
const documents=tap('documents.tap'),lifecycle=tap('lifecycle.tap');
assert.match(read('documents.tap'),/Document parser resources: ZERO_RESIDUE/);
const postgres=Object.fromEntries(['upgrade','migration','client','inbox','project'].map(name=>{
 const file=`postgres-${name}.tap`;return [name,{...tap(file),resources:zero(file)}];
}));
const browser=Object.fromEntries(['directory','supplier','inbox','migration','project','client'].map(name=>{
 const file=`browser-${name}/browser.json`,result=JSON.parse(read(file));
 assert.equal(result.status,'PASSED',file);assert.deepEqual(result.errors,[],file);assert.ok(result.checks.length>0,file);
 return [name,{status:result.status,checks:result.checks,evidence:`${root}/${file}`,resources:zero(`browser-${name}.txt`)}];
}));
for(const name of ['directory','supplier','client'])assert.ok(browser[name].checks.some(c=>c.includes('CSP')),'current UI CSP '+name);
for(const file of ['types.txt','transport.txt','contract.txt','static.txt'])assert.doesNotMatch(read(file),/error TS\d|ELIFECYCLE|ERR_PNPM/);
assert.match(read('contract.txt'),/Contract verified: 361 routes/);
assert.match(read('dependency-lock-check.txt'),/Done in .*using pnpm v10\.14\.0/);
assert.doesNotMatch(read('dependency-lock-check.txt'),/ERR_|ELIFECYCLE/);
const presentation=JSON.parse(read('presentation-preservation.json'));assert.equal(presentation.status,'PASSED');assert.equal(presentation.verifiedModules.length,32);
assert.match(read('build.txt'),/built in/);assert.doesNotMatch(read('build.txt'),/ELIFECYCLE|Heavy task refused|RESOURCE_LEAK/);
const statics=JSON.parse(read('static-review.json'));assert.equal(statics.pass,12);assert.equal(statics.fail,0);
assert.match(read('static.txt'),/"violations": \[\]/);
const sourceFiles=git('ls-files').split('\n').filter(f=>/^(apps\/|packages\/|prisma\/|scripts\/|tests\/|ops\/|patches\/|\.github\/)/.test(f)||/^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|\.nvmrc|tsconfig[^/]*\.json)$/.test(f)).sort();
const sourceFileHashes=Object.fromEntries(sourceFiles.map(file=>{
 const sha256=hash(readFileSync(file));assert.equal(sha256,hash(execFileSync('git',['show',`HEAD:${file}`])),'commit verified source first: '+file);return [file,sha256];
}));
const migrations=readdirSync('prisma/migrations').filter(f=>/^\d/.test(f)).sort().map((directory,index)=>{
 const file=`prisma/migrations/${directory}/migration.sql`,sha256=hash(readFileSync(file));
 assert.equal(sha256,hash(execFileSync('git',['show',`${p06}:${file}`])),file);
 if(index<78)assert.equal(sha256,hash(execFileSync('git',['show',`${base}:${file}`])),file);
 return {file,sha256};
});assert.equal(migrations.length,82);
assert.equal(git('diff','--name-only',p06,'HEAD','--','apps/api','packages/core','prisma'),'','foundation keeps validated backend and migrations');
const packageHeads={p01:'5595bb58faa94c1c9340bc0fdd1c2949098bcbc2',p02:'26da111',p03:'9b8b1cc',p04:'d90404d',p05:'a8d2e08',p06};
const packages=Object.fromEntries(Object.entries(packageHeads).map(([name,ref])=>{
 const codeHead=git('rev-parse',ref),file=`artifacts/once-upgrade/${name}/verification.json`,report=JSON.parse(readFileSync(file,'utf8'));
 const frozen=report.sourceFileHashes??report.sourceSha256;
 for(const [source,expected] of Object.entries(frozen))assert.equal(hash(execFileSync('git',['show',`${codeHead}:${source}`])),expected,name+': '+source);
 return [name,{codeHead,evidence:file,evidenceSha256:hash(readFileSync(file)),verifiedSourceFiles:Object.keys(frozen).length}];
}));
const phaseStart=new Date(read('resource-phase-start.txt').trim()).valueOf();assert.ok(Number.isFinite(phaseStart));
const resources=readdirSync('data/local-resource-runs',{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>{
 const file=`data/local-resource-runs/${e.name}/run.json`;try{return JSON.parse(readFileSync(file,'utf8'));}catch{return null;}
}).filter(r=>r&&!r.simulation&&new Date(r.started).valueOf()>=phaseStart).map(r=>{
 assert.equal(r.status,'ZERO_RESIDUE','owned resource '+r.id);assert.ok(Object.values(r.remaining).every(v=>v===0),'owned resource '+r.id);
 return {id:r.id,status:r.status,outcome:r.outcome,started:r.started,finished:r.finished,remaining:r.remaining};
});assert.ok(resources.length>=10,'include current PG, browser, build and parser owners');
const report={
 generatedAt:new Date().toISOString(),status:'SIX_PACKAGES_AND_FOUNDATION_IMPLEMENTED_AND_ISOLATED_TESTED',
 base,codeHead:git('rev-parse','HEAD'),branch:git('branch','--show-current'),sourceCommittedAtVerification:true,
 sourceIdentity:'codeHead and sourceFileHashes bind the checked source. Later evidence/documentation-only commits may follow. Frozen per-package reports retain their original counts and code identities.',
 packages,foundationReference:'6176984a23ddc8dff72f82a3ab71d18ee5c2aac1',
 foundationDependencyPatch:'patches/@rc-component__util@1.14.1.patch; preserve strict CSP during table scrollbar measurement without runtime style injection',
 runtime:{node:process.version,packageManager:JSON.parse(readFileSync('package.json','utf8')).packageManager},
 checks:{core:{...core,adapter:'MemoryStore; distinct from real PostgreSQL'},documents,lifecycle,postgres,browser,
  contract:{status:'PASSED',routes:361},typecheck:'PASSED',transportTypecheck:'PASSED',foundation:'PASSED',presentationHandlers:{status:'PASSED',modules:32},staticReview:{passed:12,failed:0},build:'PASSED',dependencyLock:'PASSED'},
 migrations:{count:82,original78Unchanged:true,addedDuringUpgrade:4,all82FrozenAndUnchangedSinceP06:true,entries:migrations},
 backendUnchangedSinceP06:true,
 resources:{scope:'Only registered resources owned by this final phase. Does not claim the whole machine or persistent user services are empty.',runs:resources},
 builtComponentStyles:{generatedFromPinnedSource:true,sha256:hash(readFileSync('dist/web/once-components.css')),bytes:statSync('dist/web/once-components.css').size},
 retainedAttempts:'artifacts/once-upgrade/foundation/attempts and final/attempts; earlier package attempts stay in their frozen folders. Failure logs are not counted as passing checks.',
 pilot:{selectedRole:'photographer',realMaterialImported:false,realProjectExecuted:false,originals:'Remain on the authorized user device; no identifiable materials in repository or public evidence.'},
 notRun:['Current branch remote CI','External model quality and actual billing','Real authentication provider','COS','Physical phones and mobile networks','Real materials business pilot and measured human effort','Production migration and deployment','Push or merge of this upgrade'],
 sourceFileHashes,
};
writeFileSync(`${root}/verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({codeHead:report.codeHead,core:core.tests,documents:documents.tests,lifecycle:lifecycle.tests,postgresSuites:Object.keys(postgres).length,browserChecks:Object.values(browser).reduce((n,b)=>n+b.checks.length,0),ownedRuns:resources.length,sourceFiles:sourceFiles.length}));
