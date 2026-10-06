/** Bake the shared component theme into a same-origin stylesheet for style-src self.
 * No API/CSP relaxation, browser, services or domain data are involved. */
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url);
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(module,filename)=>module._compile(ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const {createCache,extractStyle,StyleProvider}=require('@ant-design/cssinjs');
const {App,Alert,Breadcrumb,Button,Empty,Menu,Modal,Pagination,Tag,Tooltip}=require('antd');
const {PageContainer}=require('@ant-design/pro-components');
const {AdminProvider}=require('../apps/admin-web/src/foundation/provider.tsx');
const {AdminTable,AdminForm,AdminDescriptions}=require('../apps/admin-web/src/foundation/patterns.tsx');
const h=React.createElement,cache=createCache();
const components=h(React.Fragment,null,
 h(App,null,h(Breadcrumb,{items:[{title:'ONCE'},{title:'工作台'}]})),
 h(Menu,{mode:'inline',items:[{key:'one',label:'工作台'},{key:'management',label:'管理',children:[{key:'child',label:'子项'}]}]}),
 h(Menu,{mode:'inline',inlineCollapsed:true,items:[{key:'one',label:'工作台'}]}),
 ...['default','primary','text','link','dashed'].map(type=>h(Button,{key:type,type},'操作')),
 ...['error','success','warning','info'].map(type=>h(Alert,{key:type,type,showIcon:true,title:'状态',description:'说明'})),
 ...['default','error','success','warning'].map(color=>h(Tag,{key:color,color},'状态')),
 h(Empty,{image:Empty.PRESENTED_IMAGE_SIMPLE}),h(Pagination,{total:100,current:1,pageSize:10,showSizeChanger:false}),
 h(Tooltip,{title:'说明'},h(Button,null,'帮助')),h(Modal,{open:false,title:'详情',footer:null},'详情'),
 h(PageContainer,{pageHeaderRender:false},h('h1',null,'工作台')),
 h(AdminForm,null,h('input',{name:'synthetic'})),
 h(AdminTable,null,h('thead',null,h('tr',null,h('th',null,'字段'))),h('tbody',null,h('tr',{key:'synthetic'},h('td',null,'合成')))),
 h(AdminDescriptions,null,h('div',null,h('dt',null,'字段'),h('dd',null,'值'))));
renderToStaticMarkup(h(StyleProvider,{cache},h(AdminProvider,null,components)));
const css=extractStyle(cache,{plain:true});
for(const selector of ['ant-menu','ant-modal','ant-table','ant-descriptions','ant-form','ant-pagination','once-theme'])
 if(!css.includes(selector))throw new Error('Foundation stylesheet missing '+selector);
const dir=resolve('apps/admin-web/public');mkdirSync(dir,{recursive:true});writeFileSync(resolve(dir,'once-components.css'),css);
console.log('Baked ONCE AntD/Pro component stylesheet: '+Buffer.byteLength(css)+' bytes');
