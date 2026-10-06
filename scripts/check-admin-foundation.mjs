import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import ts from 'typescript';
const root='apps/admin-web/src',violations=[],coverage=[];
function walk(dir){for(const item of readdirSync(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())walk(p);else if(/\.tsx$/.test(p)&&!p.includes('/foundation/')){
 const text=readFileSync(p,'utf8'),source=ts.createSourceFile(p,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),counts={};
 function visit(n){if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)){
 const tag=n.tagName.getText(source);if(['form','table','dl'].includes(tag))violations.push(`${p}:${source.getLineAndCharacterOfPosition(n.pos).line+1}: use shared Foundation patterns for ${tag}`);
 if(['AdminForm','AdminTable','AdminDescriptions','PageTitle','AppShell'].includes(tag))counts[tag]=(counts[tag]??0)+1;
 }ts.forEachChild(n,visit);}visit(source);if(Object.keys(counts).length)coverage.push({module:relative(root,p),...counts});
 }} }
walk(root);
const pkg=JSON.parse(readFileSync('package.json','utf8'));
if(pkg.dependencies.antd!=='6.6.5'||pkg.dependencies['@ant-design/pro-components']!=='3.1.15-5')violations.push('Review dependency compatibility before changing pinned Foundation versions.');
if(!readFileSync(join(root,'main.tsx'),'utf8').includes('<AdminProvider>'))violations.push('Admin entry must use AdminProvider.');
if(!pkg.scripts['build:web'].includes('generate-admin-styles.mjs')||!readFileSync('apps/admin-web/index.html','utf8').includes('/once-components.css'))violations.push('Build and load baked component styles under the existing strict CSP.');
console.log(JSON.stringify({status:violations.length?'FAIL':'PASS',coverage,violations},null,2));
if(violations.length)process.exitCode=1;
