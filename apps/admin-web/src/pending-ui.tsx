import {useEffect,useState} from 'react';
import {read,pendingCommands,needsPendingInspection,acknowledgePendingInspection,replayPending} from './api.ts';
import {ErrorBox,useAction} from './ui.tsx';
import type {Receipt} from './dto.ts';
export function PendingCommands(){
 const [,update]=useState(0),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState<Receipt|null>(null),action=useAction();
 useEffect(()=>{const f=()=>update(n=>n+1);window.addEventListener('once-pending-changed',f);return()=>window.removeEventListener('once-pending-changed',f)},[]);
 const rows=pendingCommands(),lost=needsPendingInspection();
 if(!rows.length&&!lost&&!result)return null;
 return <section className="notice"><strong>提交结果核对</strong>
 {lost&&<><p>页面关闭前有提交尚未确认。表单没有保存到浏览器，请先查看已有记录或请管理员核对，避免重复新建。</p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对原操作结果</label><button disabled={!confirmed} onClick={()=>{acknowledgePendingInspection();setConfirmed(false)}}>完成核对，解除提交限制</button></>}
 {rows.length>0&&<button disabled={action.busy} onClick={()=>void action.run(async()=>{await read('identity.me')})}>刷新登录状态</button>}
 {rows.map(row=><div key={row.key}><span>待确认请求：{row.key}</span><button disabled={action.busy} onClick={()=>void action.run(async()=>setResult(await replayPending(row.key) as Receipt))}>原样核对上次提交</button></div>)}
 {result&&<p>已收到有效回执，记录编号：{result.resourceId}。请打开对应列表查看；不要再次新建。</p>}<ErrorBox error={action.error}/></section>;
}
