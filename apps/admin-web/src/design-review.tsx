/** Explicitly fictional design review. No API, credentials, persistence or acceptance claim. */
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Alert,Button} from 'antd';
import {AppShell} from './app-shell.tsx';
import {AdminProvider} from './foundation/provider.tsx';
import {AdminTable,AdminForm,AdminDescriptions} from './foundation/patterns.tsx';
import {PageTitle,Pager,Tag,Modal,Empty,ErrorBox,Submit,Field} from './ui.tsx';
import type {Me} from './dto.ts';
import './style.css';
import './admin-ux.css';
import './foundation/foundation.css';
const me:Me={membershipId:'fictional',displayName:'预览成员',workspaceName:'虚构制作工作空间',role:'ADMIN',permissions:['talent.review','sources.read','sources.review','assets.read','records.write','data.export','ai.use','records.read','members.manage','data.merge','data.delete','catalog.manage','audit.read'],csrfToken:'',version:'preview'};
const records=Array.from({length:18},(_,i)=>({id:i+1,name:`示例人才 ${String(i+1).padStart(2,'0')}`,city:['上海','北京','深圳'][i%3]!,role:['演员','模特','摄影师'][i%3]!,status:i%4===0?'DRAFT':'ACTIVE'}));
const titles:Record<string,string>={dashboard:'工作台',people:'人才库',shortlists:'候选清单',works:'作品库',projects:'项目',review:'审核',sources:'资料来源',media:'全局素材',imports:'导入资料',exports:'内部导出',ai:'AI 辅助整理',handoffs:'资料交接',members:'成员与范围',merges:'人才合并',deletions:'删除任务',catalog:'分类字典',audit:'操作记录',account:'账号设置'};
function Preview(){
 const [active,setActive]=useState('people'),[page,setPage]=useState(1),[query,setQuery]=useState(''),[filter,setFilter]=useState(''),[detail,setDetail]=useState<typeof records[number]|null>(null),[edit,setEdit]=useState(false),[notice,setNotice]=useState(''),[state,setState]=useState('normal');
 const rows=records.filter(r=>r.name.includes(filter)||r.city.includes(filter));
 const navigate=(key:string)=>{setActive(key);setPage(1);setFilter('');setQuery('');setDetail(null);setState('normal');setNotice('');};
 const label=titles[active]??'工作台';
 return <AdminProvider><AppShell me={me} active={active} onNavigate={navigate}>
 <Alert type="info" showIcon title="虚构界面预览 · 不连接后端" description={<>复用本次真实 Shell、主题与共享组件；以下记录均为虚构。筛选、分页和保存仅在内存演示，不代表业务或权限验收。 <a href="/">查看正式应用入口（需要后端及登录）</a></>}/>
 <PageTitle overline="ONCE / DESIGN REVIEW" title={detail?detail.name:label} description="克制、清晰的制作资源管理工作空间" action={<Button type="primary" onClick={()=>setEdit(true)}>新增示例</Button>}/>
 {notice&&<Alert type="success" title={notice} closable afterClose={()=>setNotice('')}/>}
 {detail?<section className="card"><Button onClick={()=>setDetail(null)}>返回列表</Button><h2>资料概览</h2><AdminDescriptions><div><dt>显示名</dt><dd>{detail.name}</dd></div><div><dt>城市</dt><dd>{detail.city}</dd></div><div><dt>职业</dt><dd>{detail.role}</dd></div><div><dt>状态</dt><dd><Tag value={detail.status}/></dd></div><div><dt>备注</dt><dd>仅供界面评审的虚构资料，无真实个人信息。</dd></div></AdminDescriptions><Button onClick={()=>setEdit(true)}>编辑示例</Button></section>:<section className="card">
 <AdminForm className="filters" onSubmit={e=>{e.preventDefault();setFilter(query);setPage(1);}}><Field label="搜索示例"><input aria-label="搜索示例" value={query} onChange={e=>setQuery(e.target.value)} placeholder="显示名或城市"/></Field><Submit busy={false}>应用筛选</Submit><Button onClick={()=>{setQuery('');setFilter('');setPage(1);}}>重置</Button><Field label="显示状态"><select aria-label="显示状态" value={state} onChange={e=>setState(e.target.value)}><option value="normal">正常</option><option value="loading">加载</option><option value="empty">空状态</option><option value="error">错误</option></select></Field></AdminForm>
 {state==='loading'?<Alert type="info" title="正在加载示例资料…"/>:state==='empty'?<Empty title="暂无示例记录">调整筛选后重试</Empty>:state==='error'?<ErrorBox error={new Error('预览错误状态：请求未完成，当前输入已保留。')}/>:<><AdminTable><thead><tr><th>{active==='people'?'人才':active==='works'?'作品':active==='projects'?'项目':'条目'}</th><th>城市 / 类型</th><th>职业 / 负责人</th><th>状态</th><th>备注</th><th>操作</th></tr></thead><tbody>{rows.slice((page-1)*6,page*6).map(r=><tr key={r.id}><td><Button type="link" onClick={()=>setDetail(r)}>{active==='people'?r.name:`${label} · 示例 ${r.id}`}</Button></td><td>{r.city}</td><td>{r.role}</td><td><Tag value={r.status}/></td><td><small>虚构资料 · 仅用于界面评审</small></td><td><Button onClick={()=>setDetail(r)}>查看详情</Button></td></tr>)}</tbody></AdminTable><Pager page={page} pageSize={6} total={rows.length} setPage={setPage}/></>}
 </section>}
 {edit&&<Modal title="编辑虚构示例" onClose={()=>setEdit(false)}><AdminForm onSubmit={e=>{e.preventDefault();setEdit(false);setNotice('示例已保存到当前界面；未发送请求，刷新即清除。');}}><Field label="显示名"><input name="displayName" aria-label="显示名" required defaultValue={detail?.name??''}/></Field><Field label="备注"><textarea name="note" aria-label="备注" defaultValue="虚构界面演示"/></Field><div className="actions"><Submit busy={false}>保存示例</Submit><Button onClick={()=>setEdit(false)}>取消</Button></div></AdminForm></Modal>}
 </AppShell></AdminProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
