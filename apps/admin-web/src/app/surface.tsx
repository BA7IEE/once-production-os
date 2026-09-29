import {createContext,useContext,useEffect,useRef,type ReactNode} from 'react';
import {useBlocker} from 'react-router';
// Only dirty flags live here. No forms, query text, or record data is persisted.
const dirtyForms=new Set<symbol>();
export const PageSurfaceContext=createContext(false);
export const PageSurface=({children}:{children:ReactNode})=><PageSurfaceContext.Provider value={true}>{children}</PageSurfaceContext.Provider>;
export function clearNavigationDirty(){dirtyForms.clear();}
export function useSurfaceDirty(){
 const key=useRef(Symbol());
 useEffect(()=>()=>{dirtyForms.delete(key.current);},[]);
 return ()=>dirtyForms.add(key.current);
}
export function NavigationGuard(){
 const blocker=useBlocker(()=>dirtyForms.size>0);
 useEffect(()=>{if(blocker.state==='blocked'){if(window.confirm('当前修改尚未保存，确认离开？')){clearNavigationDirty();blocker.proceed();}else blocker.reset();}},[blocker]);
 useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirtyForms.size){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before);},[]);
 return null;
}
