/** Isolated fictional preview of actual domain pages. Never imported by production main. */
import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AppShell} from './app-shell.tsx';
import {AdminProvider} from './foundation/provider.tsx';
import {WorkspaceHome} from './workspace-home.tsx';
import {TalentDirectory} from './talent-directory.tsx';
import {TalentDirectoryDetail} from './talent-directory-detail.tsx';
import {ProductionPanel} from './production-ui.tsx';
import {TalentIntake} from './talent-intake.tsx';
import {ShortlistWorkbench} from './shortlist-ui.tsx';
import {ReviewWorkspace} from './review-workspace.tsx';
import {PageTitle,Empty} from './ui.tsx';
import {read} from './api.ts';
import {allowLeave} from './unsaved.ts';
import {bindDirectoryIdentity} from './directory-state.ts';
import {previewMe,previewCatalog,installPreviewReads,previewScenario} from './design-review-data.ts';
import './style.css';import './admin-ux.css';import './foundation/foundation.css';
installPreviewReads();
const activeFor=()=>location.pathname.startsWith('/talents')?'people':location.pathname.startsWith('/workspace/')?location.pathname.split('/')[2]??'dashboard':'dashboard';
function Preview(){
 const [ready,setReady]=useState(false),[active,setActive]=useState(activeFor),[path,setPath]=useState(location.pathname),[scenario,setScenario]=useState<'normal'|'empty'|'error'>('normal'),[version,setVersion]=useState(0);
 useEffect(()=>{void read('identity.me').then(()=>{bindDirectoryIdentity(previewMe);setReady(true);});const pop=()=>{setActive(activeFor());setPath(location.pathname);};window.addEventListener('popstate',pop);return()=>window.removeEventListener('popstate',pop);},[]);
 const navigate=(key:string)=>{if(!allowLeave())return;history.pushState({},'',key==='people'?'/talents':key==='dashboard'?'/design-review/':'/workspace/'+key);setActive(key);setPath(location.pathname);};
 const openPerson=(id:string)=>{history.pushState({},'','/talents/'+id);setPath(location.pathname);setActive('people');};
 const personId=path.startsWith('/talents/')?path.split('/')[2]:null;
 return <AdminProvider><AppShell me={previewMe} active={active} onNavigate={navigate}>
 <div className="preview-context" role="note"><span><strong>虚构资料预览</strong> · 实际页面组件 · 不连接后端，不执行写入</span><label>读取场景 <select aria-label="读取场景" value={scenario} onChange={e=>{const next=e.target.value as typeof scenario;previewScenario(next);setScenario(next);setVersion(v=>v+1);}}><option value="normal">正常</option><option value="empty">空资料</option><option value="error">读取失败</option></select></label></div>
 {!ready?<p role="status">准备虚构预览…</p>:<div key={active+':'+version} data-preview-page={active}>{active==='dashboard'?<WorkspaceHome me={previewMe} onNavigate={navigate}/>:active==='people'?(personId==='new'?<><TalentDirectory me={previewMe} catalog={previewCatalog} onOpen={openPerson}/><TalentIntake catalog={previewCatalog} canChooseSource={false} onClose={()=>navigate('people')} onSaved={openPerson}/></>:personId?<TalentDirectoryDetail id={personId} me={previewMe} catalog={previewCatalog} onClose={()=>navigate('people')} onAdvanced={()=>alert('此虚构预览未提供高级来源操作。')} onProduction={p=>navigate(p.kind==='work'?'works':'projects')}/>:<TalentDirectory me={previewMe} catalog={previewCatalog} onOpen={openPerson} onCreate={()=>openPerson('new')}/>):active==='shortlists'?<ShortlistWorkbench me={previewMe} catalog={previewCatalog}/>:active==='works'||active==='projects'?<ProductionPanel key={active} kind={active==='works'?'work':'project'} me={previewMe} catalog={previewCatalog}/>:active==='review'?<ReviewWorkspace me={previewMe} catalog={previewCatalog}/>:<><PageTitle overline="虚构预览范围" title="此模块尚未提供离线场景" description="正式应用已迁移共享Foundation；当前离线预览只提供工作台、人才、候选、作品、项目和审核的实际页面。"/><section className="panel padded"><Empty title="当前没有离线预览资料">返回主要模块查看。此处不使用通用人才表代替其它业务页面。</Empty></section></>}</div>}
 </AppShell></AdminProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
