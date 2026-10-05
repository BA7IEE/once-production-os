import { useEffect, useState } from 'react';
import { read } from './api.ts';
import type { Page } from './dto.ts';
import { ErrorBox, Pager, useLoad } from './ui.tsx';

/** Selection belongs to the form, not the currently visible page. */
export function PagedPicker<T extends {id:string}>({label,selected,onChange,load,loadKey,name,searchMax,disabled=false,required=false,eligible}: {
    label:string;selected:T|null;onChange:(row:T|null)=>void;load:(query:Record<string,string>)=>Promise<Page<T>>;
    loadKey:string;name:(row:T)=>string;searchMax?:number;disabled?:boolean;required?:boolean;eligible?:(row:T)=>boolean;
}) {
    const [page,setPage]=useState(1),[search,setSearch]=useState(''),[q,setQ]=useState('');
    const key=loadKey+':'+page+':'+q;
    const result=useLoad(async()=>({key,result:await load({page:String(page),pageSize:'20',...(q?{q}:{})})}),key);
    const data=result.data?.key===key?result.data.result:null;
    const rows=(data?.items??[]).filter(row=>!eligible||eligible(row));
    useEffect(()=>{
        const current=data?.items.find(row=>row.id===selected?.id);
        if(!disabled&&current&&JSON.stringify(current)!==JSON.stringify(selected))onChange(current);
    },[data,selected,disabled,onChange]);
    const selectedOnPage=rows.some(row=>row.id===selected?.id);
    return <div className="paged-picker" role="group" aria-label={label+'选择器'}>
        <ErrorBox error={result.error}/>
        {searchMax&&<div className="button-row"><input aria-label={'搜索'+label} value={search} maxLength={searchMax} disabled={disabled} onChange={e=>setSearch(e.target.value)}/><button type="button" disabled={disabled} onClick={()=>{setQ(search.trim());setPage(1);}}>搜索</button></div>}
        <select aria-label={label} required={required} value={selected?.id??''} disabled={disabled||result.busy} onChange={e=>onChange(rows.find(row=>row.id===e.target.value)??null)}>
            <option value="">请选择</option>
            {selected&&!selectedOnPage&&<option value={selected.id}>{result.error?'已选对象（当前无法核对）':name(selected)} · 已选</option>}
            {rows.map(row=><option key={row.id} value={row.id}>{name(row)}</option>)}
        </select>
        {result.busy&&<small>正在读取…</small>}
        <fieldset disabled={disabled||result.busy}>{data&&<Pager page={page} pageSize={20} total={data.total} setPage={setPage}/>}</fieldset>
    </div>;
}
export type ResourceKind='PERSON'|'WORK'|'PROJECT'|'SOURCE'|'ASSET';
export interface ResourceOption {id:string;revision:number;sourceId?:string;displayName?:string;title?:string;fileName?:string;basisMode?:string;}
const resourceRoutes={PERSON:'person.list',WORK:'work.list',PROJECT:'project.list',SOURCE:'source.list',ASSET:'asset.list'} as const;
export const resourceName=(row:ResourceOption)=>row.displayName??row.title??row.fileName??row.id;
export function ResourcePicker({kind,label,selected,onChange,refresh=0,disabled=false,required=false,eligible}: {kind:ResourceKind;label:string;selected:ResourceOption|null;onChange:(row:ResourceOption|null)=>void;refresh?:number;disabled?:boolean;required?:boolean;eligible?:(row:ResourceOption)=>boolean}) {
    return <PagedPicker key={kind} label={label} selected={selected} onChange={onChange} load={q=>read<Page<ResourceOption>>(resourceRoutes[kind],{},q)} loadKey={kind+':'+refresh} name={resourceName} searchMax={kind==='PERSON'?120:kind==='WORK'||kind==='PROJECT'?160:undefined} disabled={disabled} required={required} eligible={eligible}/>;
}
