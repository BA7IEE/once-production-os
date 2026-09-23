/** Content/links/fingerprints only. This is not a build, dependency audit or secrets scanner. */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=process.cwd();const relative=p=>path.relative(root,p).split(path.sep).join('/');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(p,e.name)):[path.join(p,e.name)]);
const files=walk(root);const issues=[];let checkedLinks=0;
for(const f of files){const rel=relative(f);if(/(^|\/)(node_modules|\.git|\.secrets|secrets|data|dist)(\/|$)/.test(rel)||/(^|\/)\.env($|\.)/.test(rel)&&!rel.endsWith('/.env.example')&&rel!=='.env.example')issues.push({type:'excluded-file',file:rel});}
for(const file of files.filter(f=>f.endsWith('.md'))){
 const text=fs.readFileSync(file,'utf8').replace(/```[\s\S]*?```/g,'');
 for(const m of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)){
   let target=m[1].trim().replace(/^<|>$/g,'');
   if(/^[a-z]+:/i.test(target)||target.startsWith('#')||target.startsWith('/'))continue;
   target=target.split('#')[0];if(!target)continue;
   try{target=decodeURIComponent(target);}catch{issues.push({type:'bad-link-encoding',file:relative(file),target});continue;}
   checkedLinks++;if(!fs.existsSync(path.resolve(path.dirname(file),target)))issues.push({type:'broken-link',file:relative(file),target});
 }
}
const reportPath=path.join(root,'artifacts/verification.json');let checkedFingerprints=0;
if(fs.existsSync(reportPath)){const v=JSON.parse(fs.readFileSync(reportPath,'utf8'));for(const [name,expected] of Object.entries(v.sourceSha256??{})){checkedFingerprints++;const p=path.join(root,name);if(!fs.existsSync(p)||crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!==expected)issues.push({type:'source-drift-after-verification',file:name});}}
const report={scope:'package file presence, Markdown local links, recorded source digests',checkedAt:new Date().toISOString(),files:files.length,markdownFiles:files.filter(f=>f.endsWith('.md')).length,checkedLinks,checkedFingerprints,issues,passed:issues.length===0};
fs.mkdirSync('artifacts',{recursive:true});fs.writeFileSync('artifacts/package-check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));if(issues.length)process.exitCode=1;
