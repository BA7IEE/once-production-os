import {useEffect,useRef} from 'react';
const editors=new Map<symbol,string>();
let restorePath='',restoreState:unknown=null;
export function allowLeave(){return !editors.size||window.confirm('有未保存的修改（'+[...new Set(editors.values())].join('、')+'）。放弃修改并离开？');}
const close=(event:BeforeUnloadEvent)=>{if(editors.size){event.preventDefault();event.returnValue='';}};
const back=(event:PopStateEvent)=>{if(editors.size&&!allowLeave()){event.stopImmediatePropagation();history.pushState(restoreState,'',restorePath);}};
function detach(){if(editors.size)return;window.removeEventListener('beforeunload',close);window.removeEventListener('popstate',back,{capture:true});}
/** In-memory guard only. One shared listener prevents duplicate prompts from nested editors. */
export function useUnsaved(dirty:boolean,label:string){
 const id=useRef(Symbol(label));
 useEffect(()=>{
  if(!dirty)return;
  if(!editors.size){restorePath=location.pathname+location.search;restoreState=history.state;window.addEventListener('beforeunload',close);window.addEventListener('popstate',back,{capture:true});}
  editors.set(id.current,label);
  return()=>{editors.delete(id.current);detach();};
 },[dirty,label]);
 return ()=>{editors.delete(id.current);detach();};
}
