import {useState} from 'react';
import type {Page} from '../dto.ts';
import {useLoad} from '../ui.tsx';
/** Explicitly expand legacy selectors. Each expansion rereads every visible page under current authorization. */
export function useOptionPages<T>(load:(page:number)=>Promise<Page<T>>,key:string|number){
 const [pages,setPages]=useState(1);
 const state=useLoad(async()=>{
  const first=await load(1);const items=[...first.items];let total=first.total;
  for(let p=2;p<=pages&&items.length<total;p++){const next=await load(p);items.push(...next.items);total=next.total;}
  return {...first,items,total};
 },String(key)+':'+pages);
 return {...state,more:()=>setPages(p=>p+1)};
}
export function OptionPages({entries}:{entries:Array<{label:string;state:{data:{items:unknown[];total:number}|null;busy:boolean;more:()=>void}}>}){
 return <div className="detail-actions">{entries.map(({label,state})=>state.data&&state.data.items.length<state.data.total&&<button type="button" key={label} disabled={state.busy} onClick={state.more}>加载更多{label}（已显示 {state.data.items.length} / {state.data.total}）</button>)}</div>;
}
