import type {CatalogItem} from './dto.ts';
export type ParsedTable={headers:string[];rows:string[][]};
/** Quoted commas, escaped quotes and quoted newlines; no execution or formula evaluation. */
export function parseTable(input:string):ParsedTable{
 if(input.length>262144)throw new Error('表格文字最多256KB，请拆成最多100行的小批次。');
 const text=input.replace(/^\uFEFF/,'');let headerQuoted=false,delimiter=',';for(let i=0;i<text.length;i++){const c=text[i];if(c==='\"'){if(headerQuoted&&text[i+1]==='\"')i++;else headerQuoted=!headerQuoted;}else if(!headerQuoted&&c==='\t'){delimiter='\t';break;}else if(!headerQuoted&&(c==='\n'||c==='\r'))break;}
 const rows:string[][]=[],row:string[]=[];let value='',quoted=false,closed=false;
 const finish=()=>{row.push(value);value='';closed=false;if(row.some(v=>v.trim()))rows.push([...row]);row.length=0;if(rows.length>101)throw new Error('每批最多100行资料（另加一行表头）。');};
 for(let i=0;i<text.length;i++){const c=text[i]!;
  if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
  if(c==='"'){if(value||closed)throw new Error('引号格式不正确，请检查第 '+(rows.length+1)+' 行。');quoted=true;}
  else if(c===delimiter){row.push(value);value='';closed=false;if(row.length>30)throw new Error('表格最多30列，请移除不相关的列。');}
  else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;finish();}
  else if(closed){if(c!==' '&&c!=='\t')throw new Error('结束引号后存在额外文字，请检查第 '+(rows.length+1)+' 行。');}
  else value+=c;
 }
 if(quoted)throw new Error('有单元格引号尚未闭合。');if(value||row.length||closed)finish();
 if(rows.length<2)throw new Error('请提供表头和至少一行资料。');const headers=rows.shift()!.map(h=>h.trim());
 if(headers.length>30||headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('表头须有名称且不能重复，最多30列。');
 if(rows.some(r=>r.length!==headers.length))throw new Error('部分行的列数与表头不同，请检查分隔符或单元格引号。');
 return {headers,rows};
}
export type ColumnMapping={displayName:string;roles:string;cityCode:string;kind:string};
export function initialMapping(headers:string[]):ColumnMapping{
 const find=(names:string[])=>String(headers.findIndex(h=>names.includes(h)));
 return {displayName:find(['姓名','姓名/艺名','姓名 / 艺名','displayName']),roles:find(['职业','角色','roles']),cityCode:find(['城市','常驻城市','cityCode']),kind:find(['类型','建档类型','kind'])};
}
export function mapTable(table:ParsedTable,mapping:ColumnMapping,catalog:CatalogItem[]){
 for(const index of Object.values(mapping))if(index!=='-1'&&(!/^\d+$/.test(index)||Number(index)>=table.headers.length))throw new Error('字段对应的列已失效，请重新选择。');
 const selected=Object.values(mapping).filter(v=>v!=='-1');if(new Set(selected).size!==selected.length)throw new Error('同一列不能同时对应多个字段。');
 if(mapping.displayName==='-1')throw new Error('请对应姓名列。');
 const code=(namespace:string,value:string)=>{const exact=catalog.filter(c=>c.namespace===namespace&&c.status==='ACTIVE'&&(c.code===value||c.labelZh===value));return exact.length===1?exact[0]!.code:value;};
 return table.rows.map((row,index)=>{
  const get=(key:keyof ColumnMapping)=>row[Number(mapping[key])]?.trim()??'',name=get('displayName'),roleText=get('roles'),roles=roleText?roleText.split(/[、;；/]/).map(v=>code('role',v.trim())).filter(Boolean):[],cityText=get('cityCode'),cityCode=cityText?code('city',cityText):null,type=get('kind');
  const kind=type==='普通联系人'||type==='联系人'||type==='CONTACT'?'CONTACT':type==='人才'||type==='TALENT'||!type?'TALENT':type;
  const issues:string[]=[];if(!name)issues.push('姓名未填写');if(name.length>120)issues.push('姓名过长');if(!['TALENT','CONTACT'].includes(kind))issues.push('类型无法对应，请使用人才或普通联系人');
  if(kind==='TALENT'&&!roles.length)issues.push('人才必须填写职业');if(kind==='CONTACT'&&(roles.length||cityCode))issues.push('普通联系人本批只导入姓名');
  for(const role of roles)if(!catalog.some(c=>c.namespace==='role'&&c.code===role&&c.status==='ACTIVE'))issues.push('职业无法对应：'+role);
  if(cityCode&&!catalog.some(c=>c.namespace==='city'&&c.code===cityCode&&c.status==='ACTIVE'))issues.push('城市无法对应：'+cityText);
  if(new Set(roles).size!==roles.length)issues.push('职业重复');if(table.rows.some((other,i)=>i!==index&&other[Number(mapping.displayName)]?.trim()===name))issues.push('本批同名，请独立确认；不会自动合并');
  return {displayName:name,kind,roles,...(cityCode?{cityCode}:{}),issues,line:index+2};
 });
}
