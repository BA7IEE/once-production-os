/** Summarize only this package's anonymous evidence; never read real materials or credentials. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const root='artifacts/once-upgrade/p01',base='ea5bceaf41a33be87e8bf0aee3f9dca006d20a43';
const read=file=>readFileSync(`${root}/${file}`,'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
function tap(file){
 const log=read(file),value=key=>Number(new RegExp(`^# ${key} (\\d+)$`,'m').exec(log)?.[1]??-1);
 const result={tests:value('tests'),passed:value('pass'),failed:value('fail'),skipped:value('skipped'),evidence:`${root}/${file}`};
 assert.ok(result.tests>0,file);return result;
}
function passed(file,expected){const result=tap(file);assert.equal(result.tests,expected,file);assert.equal(result.passed,expected,file);assert.equal(result.failed,0,file);assert.equal(result.skipped,0,file);return result;}
const reproduction=tap('core-before.tap');assert.equal(reproduction.failed,3);assert.match(read('core-before.tap'),/actual: 200/);
const core=passed('core-final.tap',843),targeted=passed('core-targeted.tap',16),postgres=passed('postgres-final.tap',1);
const browser=JSON.parse(read('browser/browser.json'));assert.equal(browser.status,'PASSED');assert.equal(browser.checks.length,10);assert.deepEqual(browser.errors,[]);
const remaining=JSON.parse(read('browser-final.txt').trim().split('\n').at(-1));assert.ok(Object.values(remaining).every(value=>value===0));
const postgresRemaining=JSON.parse(read('postgres-final.tap').trim().split('\n').at(-1));assert.ok(Object.values(postgresRemaining).every(value=>value===0));
for(const file of ['checks.txt','build.txt'])assert.doesNotMatch(read(file),/error TS\d|ELIFECYCLE|FAIL|Error:/);
assert.match(read('checks.txt'),/Contract verified: 329 routes/);assert.match(read('build.txt'),/built in/);
const statics=JSON.parse(read('static-review.json'));assert.equal(statics.pass,12);assert.equal(statics.fail,0);
const migrations=readdirSync('prisma/migrations').filter(file=>/^\d/.test(file)).sort().map(directory=>{
 const file=`prisma/migrations/${directory}/migration.sql`,sha256=hash(readFileSync(file));assert.equal(sha256,hash(execFileSync('git',['show',`${base}:${file}`])));return {file,sha256};
});assert.equal(migrations.length,78);
const files=[...new Set([...git('diff','--name-only',base).split('\n'),...git('ls-files','--others','--exclude-standard').split('\n')])]
 .filter(file=>file&&!file.startsWith('artifacts/')&&file!=='MANIFEST.sha256').sort();
const sourceSha256=Object.fromEntries(files.map(file=>[file,hash(readFileSync(file))]));
const sourceCommittedAtVerification=files.every(file=>hash(execFileSync('git',['show',`HEAD:${file}`]))===sourceSha256[file]);
assert.ok(sourceCommittedAtVerification,'Commit the verified source before summarizing this package');
const report={generatedAt:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date())+' +08:00',
 package:'P01',status:'IMPLEMENTED_AND_ISOLATED_TESTED',base,headAtVerification:git('rev-parse','HEAD'),branch:git('branch','--show-current'),
 sourceCommittedAtVerification,sourceIdentity:'sourceSha256 identifies the verified source; headAtVerification is the source commit. A later evidence-only commit may add the report and manifest.',
 checks:{reproduction,targeted:{...targeted,phase:'Initial functional fixes; final core suite covers these same cases on the final source'},core,postgres,browser:{status:'PASSED',checks:browser.checks,evidence:`${root}/browser/browser.json`},
 contract:{routes:329,status:'PASSED'},typecheck:'PASSED',transportTypecheck:'PASSED',staticReview:{passed:statics.pass,failed:statics.fail},build:'PASSED',
 resources:{scope:'Registered disposable resources owned by the PostgreSQL/browser runs; excludes persistent services and dependency toolchains',postgres:postgresRemaining,browser:remaining}},
 migrations:{count:migrations.length,changed:0,added:0,entries:migrations},
 retainedAttempts:[{evidence:`${root}/postgres-attempt1.tap`,result:'FAILED',reason:'New fixture tried to hash Date objects and bootstrap twice; test harness repaired without weakening business assertions'},
 {evidence:`${root}/browser-attempt1.txt`,result:'FAILED',reason:'Node 22.16 needs explicit type stripping for existing TypeScript imports; rerun enabled the runtime flag'}],
 realMaterialAccess:{inventoryConfirmed:true,pdfFiles:27,pptxFiles:1,imported:false,originals:'Remain on the authorized user device; no identifiable materials in these fixtures'},
 remainingPackages:['P02','P03','P04','P05','P06'],
 notRun:['PR39 interface integration','External model accuracy and billing','Real authentication provider','COS','Physical phones and mobile networks','Business pilot and real project selection','Production migration and deployment'],
 sourceSha256};
writeFileSync(`${root}/verification.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({package:report.package,core:core.passed,targeted:targeted.passed,postgres:postgres.passed,browser:browser.checks.length,migrations:migrations.length,sourceFiles:files.length}));
