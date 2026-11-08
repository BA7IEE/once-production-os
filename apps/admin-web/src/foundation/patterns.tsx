import {Children,Fragment,isValidElement,type ReactNode,type ReactElement,type FormHTMLAttributes,type HTMLAttributes,type Ref} from 'react';
import {ProTable,ProForm,ProDescriptions} from '@ant-design/pro-components';
import type {ProColumns} from '@ant-design/pro-components';

interface NodeProps {children?:ReactNode;colSpan?:number;rowSpan?:number;className?:string;onClick?:HTMLAttributes<HTMLElement>['onClick'];}
function elements(children:ReactNode):ReactElement<NodeProps>[] {
 return Children.toArray(children).flatMap(child=>!isValidElement<NodeProps>(child)?[]:
 child.type===Fragment?elements(child.props.children):[child]);
}
interface Row {key:string;cells:ReactElement<NodeProps>[];props:NodeProps;}
/** Migration boundary: domain cells and event handlers stay owned by the caller.
 * No request, implicit pagination, sorting or permission inference is introduced. */
export function AdminTable({children,...props}:HTMLAttributes<HTMLTableElement>) {
 const sections=elements(children),head=sections.find(c=>c.type==='thead'),body=sections.find(c=>c.type==='tbody');
 const headers=elements(elements(head?.props.children)[0]?.props.children);
 const rows:Row[]=elements(body?.props.children).map((row,i)=>({key:String(row.key??i),cells:elements(row.props.children),props:row.props}));
 // Native span tables carry domain-specific grouped rows. Preserve their semantics.
 if(Object.keys(props).some(k=>!['id','aria-label','className'].includes(k))||
  sections.some(s=>!['thead','tbody'].includes(String(s.type))||Object.keys(s.props).some(k=>k!=='children'))||
  elements(head?.props.children).length!==1||Object.keys(elements(head?.props.children)[0]?.props??{}).some(k=>k!=='children')||
  headers.some(h=>h.type!=='th'||h.props.colSpan||h.props.rowSpan)||
  elements(body?.props.children).some(r=>r.type!=='tr')||
  rows.some(r=>r.cells.length!==headers.length||r.cells.some(c=>c.type!=='td'||c.props.colSpan||c.props.rowSpan))||!head||!body)
  return <table {...props} data-foundation-exception="grouped-table">{children}</table>;
 const columns:ProColumns<Row>[]=headers.map((h,i)=>({title:h.props.children,key:String(i),
 render:(_text,row)=>row.cells[i]?.props.children,
 onHeaderCell:()=>{const {children,...cell}=h.props;return cell;},
 onCell:row=>{const {children,...cell}=row.cells[i]?.props??{};return cell;},}));
 return <div id={props.id} aria-label={props['aria-label']} className={'once-table '+(props.className??'')}><ProTable<Row> rowKey="key" columns={columns} dataSource={rows}
 search={false} options={false} pagination={false} size="middle" cardBordered={false}
 tableAlertRender={false} toolBarRender={false} onRow={row=>{const {children,...rest}=row.props;return rest;}}
 scroll={{x:'max-content'}} locale={{emptyText:'暂无记录'}} /></div>;
}
/** Keep native submit/constraint validation and current immutable mutation snapshots. */
export function AdminForm({children,...props}:(FormHTMLAttributes<HTMLFormElement> & {ref?:Ref<HTMLFormElement>})) {
 return <ProForm component={false} submitter={false} layout="vertical"><form {...props} className={'once-form '+(props.className??'')}>{children}</form></ProForm>;
}
/** Existing dl pairs become the common responsive details pattern. */
export function AdminDescriptions({children,className,...props}:HTMLAttributes<HTMLElement>) {
 const nodes=elements(children),pairs:Array<{key:string;title:ReactNode;value:ReactNode}>=[];
 if(Children.toArray(children).some(n=>!isValidElement(n)))return <dl {...props} className={className} data-foundation-exception="description-text">{children}</dl>;
 for(let i=0;i<nodes.length;i++){
  const row=nodes[i]!;if(Object.keys(row.props).some(k=>k!=='children'))return <dl {...props} className={className} data-foundation-exception="description-attributes">{children}</dl>;
  if(row.type==='dt'&&nodes[i+1]?.type==='dd'){
   if(Object.keys(nodes[i+1]!.props).some(k=>k!=='children'))return <dl {...props} className={className} data-foundation-exception="description-attributes">{children}</dl>;
   pairs.push({key:String(row.key??i),title:row.props.children,value:nodes[++i]!.props.children});
  }else{
   const content=elements(row.props.children),title=content.find(c=>c.type==='dt'),value=content.find(c=>c.type==='dd');
   if(content.some(c=>Object.keys(c.props).some(k=>k!=='children')))return <dl {...props} className={className} data-foundation-exception="description-attributes">{children}</dl>;
   if(title&&value&&content.length===2)pairs.push({key:String(row.key??i),title:title.props.children,value:value.props.children});else return <dl {...props} className={className} data-foundation-exception="complex-description">{children}</dl>;
  }
 }
 return <div {...props} className={'once-descriptions '+(className??'')}><ProDescriptions column={{xs:1,sm:2,md:3}}
 columns={pairs.map(p=>({key:p.key,title:p.title,render:()=>p.value}))} /></div>;
}
