/** Server rendering checks; no browser/API/DB outcome is inferred from these. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
require.extensions['.tsx']=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const {AdminTable,AdminForm,AdminDescriptions}=require('../../apps/admin-web/src/foundation/patterns.tsx');
const h=React.createElement;
test('ProTable preserves conditional columns, domain cell text, input names and empty state',()=>{
 const table=h(AdminTable,null,h('thead',null,h('tr',null,false,h('th',null,'姓名'),h('th',null,'核验'))),h('tbody',null,[h('tr',{key:'record-uuid',className:'domain-row'},h('td',null,'合成姓名'),h('td',null,h('input',{type:'checkbox',name:'selected',defaultChecked:true}))) ]));
 const html=renderToStaticMarkup(table);assert.match(html,/合成姓名/);assert.match(html,/name="selected"/);assert.match(html,/domain-row/);assert.equal((html.match(/<tbody/g)||[]).length,1);
 const empty=renderToStaticMarkup(h(AdminTable,null,h('thead',null,h('tr',null,h('th',null,'姓名'))),h('tbody')));assert.match(empty,/暂无记录/);
});
test('ProForm keeps one native form and original validation constraints',()=>{
 const html=renderToStaticMarkup(h(AdminForm,{id:'editor'},h('input',{name:'title',required:true,maxLength:120}),h('button',{type:'submit'},'保存')));
 assert.equal((html.match(/<form/g)||[]).length,1);assert.match(html,/id="editor"/);assert.match(html,/required=""/);assert.match(html,/maxLength="120"/);assert.match(html,/type="submit"/);
});
test('ProDescriptions retains visible labels and values',()=>{
 const html=renderToStaticMarkup(h(AdminDescriptions,null,h('div',null,h('dt',null,'来源说明'),h('dd',null,'只显示当前可见内容'))));
 assert.match(html,/来源说明/);assert.match(html,/只显示当前可见内容/);
});

test('ProDescriptions supports flat dt/dd pairs and retains a zero metric',()=>{
 const html=renderToStaticMarkup(h(AdminDescriptions,null,h('dt',null,'清理中'),h('dd',null,0),h('dt',null,'待核对'),h('dd',null,7)));
 assert.match(html,/清理中/);assert.match(html,/>0</);assert.match(html,/待核对/);assert.match(html,/>7</);
});
