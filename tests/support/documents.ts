import {createHash} from 'node:crypto';
import type {DocumentDictionary,DocumentManifest,DocumentProposal} from '../../packages/core/src/document-schema.ts';
export const pagePng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgGkAAAAASUVORK5CYII=','base64');
export function documentFixture(){
 const image={file:'page-0001.png',sha256:createHash('sha256').update(pagePng).digest('hex'),bytes:pagePng.length,width:1,height:1,mime:'image/png' as const};
 const manifest:DocumentManifest={schemaVersion:'once-document-pages-v1',parserVersion:'1.0.0',runtime:{pypdfium2:'5.13.0',pillow:'12.3.0'},
  input:{sha256:'a'.repeat(64),bytes:500,kind:'PDF'},status:'READY',totalPages:1,requestedPages:[1],failedPages:[],outputBytes:pagePng.length,
  pages:[{page:1,width:600,height:800,rotation:0,image,text:'Lin He, director. Shanghai. Work A, 2024.',textRegions:[],images:[],needsVisualText:false,warnings:[]}]};
 const evidence={page:1,bbox:null,kind:'TEXT' as const,quote:'Lin He'};
 const proposal:DocumentProposal={schemaVersion:'once-document-proposal-v1',
  fields:[{key:'name',field:'displayName',value:'Lin He',evidence:[evidence]}],
  images:[{key:'crop1',page:1,bbox:[0.1,0.2,0.8,0.6],purpose:'PORTFOLIO'}],
  works:[{key:'work1',title:'Work A',description:'',roleCode:'director',brandDisplayName:'',dateText:'2024',imageKeys:['crop1'],
   evidence:[{...evidence,quote:'Work A, 2024.'}]}],unknowns:[]};
 const dictionary:DocumentDictionary={roles:['director','photographer','model'],locations:['shanghai'],languages:['zh','en'],skills:['editing']};
 return {manifest,proposal,dictionary};
}
