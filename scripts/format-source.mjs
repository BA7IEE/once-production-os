// Syntax-preserving TypeScript printer; generated contracts are owned by generate-contract.ts.
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const ts=createRequire(import.meta.url)('typescript');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='generated'?[]:walk(path.join(p,e.name))):[path.join(p,e.name)]);
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});let count=0;
for(const file of ['packages/core/src','apps/api/src','apps/admin-web/src','tests'].flatMap(walk).filter(f=>/\.tsx?$/.test(f))){
 const original=fs.readFileSync(file,'utf8');const tree=ts.createSourceFile(file,original,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 if(tree.parseDiagnostics.length)throw new Error('Parse error; not formatting '+file);
 fs.writeFileSync(file,printer.printFile(tree));count++;
}
console.log(`Formatted ${count} handwritten TypeScript files (no transpilation or type erasure).`);
