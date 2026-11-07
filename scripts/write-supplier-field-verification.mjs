/** Reproducible evidence summary. Never reads uploaded documents, credentials or .env. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {DEFAULT_SUPPLIER_FIELD_CATALOG as catalog} from '../packages/core/src/supplier-field-defaults.ts';
const root=process.cwd(),out='artifacts/supplier-field-templates',read=file=>fs.readFileSync(path.join(out,file),'utf8');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function tap(file,expected){const text=read(file),number=label=>Number(new RegExp(`^# ${label} (\\d+)$`,'m').exec(text)?.[1]??-1);const result={tests:number('tests'),passed:number('pass'),failed:number('fail'),evidence:`${out}/${file}`};assert.equal(result.tests,expected,file);assert.equal(result.passed,expected,file);assert.equal(result.failed,0,file);return result;}
const checks={core:tap('core-final.tap',839),documents:tap('documents-final.tap',21),lifecycle:tap('lifecycle.tap',34),surfacePolicy:tap('surface-policy.tap',5),postgres:tap('postgres.log',1),upgrade:tap('upgrade.log',1),historicalAgentMediaUpgrade:tap('agent-media-upgrade-local.log',1)};
checks.historicalImportedReviewLocal={status:'PARTIAL',sqlChecks:'Passed through all SQL constraint checks before physical restore',physicalRestore:'NOT_RUN: pg_dump and pg_restore are not installed in the local execution environment',evidence:`${out}/imported-review-upgrade-local.log`};
const browser=JSON.parse(read('browser/browser.json'));assert.equal(browser.status,'PASSED');assert.equal(browser.checks.length,9);assert.deepEqual(browser.errors,[]);
checks.browser={status:browser.status,checks:browser.checks,widths:[360,390,430],evidence:`${out}/browser/browser.json`,externalProvider:'NOT_RUN'};
const statics=JSON.parse(fs.readFileSync('artifacts/static-review.json','utf8'));assert.equal(statics.pass,12);assert.equal(statics.fail,0);checks.static={passed:statics.pass,failed:statics.fail,evidence:'artifacts/static-review.json'};
assert.match(read('contract-check.log'),/Contract verified: 329 routes/);checks.contract={routes:329,status:'PASSED',evidence:`${out}/contract-check.log`};
assert.match(read('typecheck-final.log'),/tsc -p tsconfig.server.json/);assert.doesNotMatch(read('typecheck-final.log'),/error TS|ELIFECYCLE/);checks.typecheck={status:'PASSED',evidence:`${out}/typecheck-final.log`};
assert.match(read('build-final.log'),/built in/);assert.doesNotMatch(read('build-final.log'),/error TS|ELIFECYCLE/);checks.build={status:'PASSED',bundleWarning:read('build-final.log').includes('larger than 500 kB'),evidence:`${out}/build-final.log`};
const directories=fs.readdirSync('prisma/migrations').filter(n=>/^\d/.test(n)).sort(),previous=JSON.parse(fs.readFileSync('artifacts/supplier-work-grouping/verification.json','utf8')).sourceSha256;
assert.equal(directories.length,78);const migrations=[];
for(let i=0;i<directories.length;i++){const file=`prisma/migrations/${directories[i]}/migration.sql`,actual=hash(fs.readFileSync(file));let expected;
 if(i<75)expected=hash(execFileSync('git',['show',`HEAD:${file}`]));else if(i<77)expected=previous[file];else expected='2e962dee30d165569688815ca354ed03491fedc4b415d7d3bc7f1f28810a4dff';
 assert.equal(actual,expected,file);migrations.push({number:i+1,file,sha256:actual,frozen:true});}
const phaseStart=fs.statSync('packages/core/src/supplier-field-contract.ts').birthtimeMs;
const realRuns=fs.readdirSync('data/local-resource-runs').flatMap(id=>{const file=`data/local-resource-runs/${id}/run.json`;if(!fs.existsSync(file))return [];const row=JSON.parse(fs.readFileSync(file,'utf8'));return !row.simulation&&Date.parse(row.started)>=phaseStart?[row]:[];});
assert.ok(realRuns.length>0);for(const run of realRuns){assert.equal(run.status,'ZERO_RESIDUE',run.id);assert.ok(Object.values(run.remaining??{}).every(n=>n===0),run.id);}
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{maxBuffer:16*1024*1024}).toString().split('\0').filter(Boolean);
const files=[...new Set(tracked)].filter(file=>!/(^|\/)(?:node_modules|dist|data|artifacts|\.git|\.secrets|__pycache__)(\/|$)/.test(file)&&!/(^|\/)\.env(?:\.|$)/.test(file)&&file!=='MANIFEST.sha256'&&fs.existsSync(file)&&fs.statSync(file).isFile()).sort();
const sourceSha256=Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(file))]));
const report={generatedAt:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date())+' +08:00',
 scope:'supplier-field-catalog-and-professional-profiles',branch:execFileSync('git',['branch','--show-current']).toString().trim(),baseHead:execFileSync('git',['rev-parse','HEAD']).toString().trim(),
 state:'CORE_IMPLEMENTED_AND_ISOLATED_TESTED',committedAtVerification:false,verificationScope:'Pre-commit working-tree snapshot; delivery commit is identified by Git history. Source hashes identify the verified files.',deployed:false,productionMigration:false,
 realMaterialReview:{pdfFiles:27,pdfPages:912,pptxFiles:1,pptxSlides:24,method:'Native-text inventory plus representative visual review; not an all-page quality benchmark',originals:'Remain on the user device; no identifiable source material in public fixtures',externalModelAccuracy:'NOT_RUN'},
 catalog:{extensionFields:catalog.fields.length,templates:catalog.templates.length,careerTemplates:catalog.templates.filter(t=>t.roleCode!==null).length,nativeAdapters:['capabilities','credentials','translation','measurements'],carrier:'Backwards-compatible supplier v1 with a separately versioned professional payload'},checks,
 migrations:{previous77Unchanged:true,forward78Frozen:true,entries:migrations},
 resourceRuns:{scope:'Only registered temporary verification resources in this implementation phase',phaseStart:new Date(phaseStart).toISOString(),realRuns:realRuns.length,zeroResidue:realRuns.length,failedAttemptsRetained:realRuns.filter(r=>r.outcome==='FAIL').length,ids:realRuns.map(r=>r.id),remaining:{containers:0,processes:0,networks:0,temporaryVolumes:0,temporaryDirectories:0,unresolvedBrowserLaunches:0}},
 retainedFailedAttempts:['postgres-initial.log','postgres-diagnostic.log','core.tap','core-source-fields.tap','browser.log','static.log','agent-media-upgrade-first.log','imported-review-upgrade-local.log','github-first-postgres-failure.json','github-second-postgres-failure.json','github-third-postgres-failure.json'].map(file=>`${out}/${file}`),
 notRun:['Real external model accuracy and billing','Real authentication provider','Physical phones','10k people with full media/work volume and concurrent traffic','Production migration/deployment'],
 limitations:['PPTX intake is not implemented','Business migration export and person merge involving extension facts are explicitly blocked pending complete transfer/resolution support','Plain text and repeated records are not exposed as structured search filters','New complex business rules and native entity types require code; not arbitrary no-code workflows','The existing large front-end bundle warning remains'],sourceSha256};
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({core:checks.core.passed,documents:checks.documents.passed,lifecycle:checks.lifecycle.passed,browser:browser.checks.length,migrations:migrations.length,registeredRuns:realRuns.length,zeroResidue:realRuns.length,sourceFiles:files.length}));
