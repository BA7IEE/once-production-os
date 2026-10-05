import {useEffect,useState} from 'react';
import {read,pendingCommands,needsPendingInspection,acknowledgePendingInspection,replayPending,inspectPending} from './api.ts';
import {ErrorBox,useAction,date,Pager} from './ui.tsx';
import type {Receipt,Page} from './dto.ts';
import {operationName} from './ux-copy.ts';
type Recent={operation:string;resourceKind:string;createdAt:string;result:Receipt};
export function PendingCommands(){
 const [,update]=useState(0),[confirmed,setConfirmed]=useState(false),[result,setResult]=useState<Receipt|null>(null),[message,setMessage]=useState(''),[recent,setRecent]=useState<Page<Recent>|null>(null),[page,setPage]=useState(1),action=useAction();
 useEffect(()=>{const f=()=>update(n=>n+1);window.addEventListener('once-pending-changed',f);return()=>window.removeEventListener('once-pending-changed',f)},[]);
 const rows=pendingCommands(),lost=needsPendingInspection();
 if(!rows.length&&!lost&&!result&&!message)return null;
 const loadRecent=(next:number)=>void action.run(async()=>{setRecent(await read<Page<Recent>>('command.list',{}, {page:String(next),pageSize:'10'}));setPage(next);});
 return <section className="notice pending-inspection" aria-label="提交结果核对"><strong>有提交需要核对</strong>
 {lost&&<><p>关闭页面前有提交尚未确认。先查看自己的处理记录和对应资料；找不到记录仍可能是结果未知。</p><button disabled={action.busy} onClick={()=>loadRecent(1)}>查看我的处理记录</button>{recent&&<><ul>{recent.items.map(r=><li key={r.result.operationId}>{operationName(r.operation)} · {date(r.createdAt)} · 已记录</li>)}</ul><Pager page={page} pageSize={10} total={recent.total} setPage={loadRecent}/><p>这里展示当前仍有权读取的记录；不能仅凭时间或相似操作判断就是原提交。</p></>}<label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已确认原操作结果，不会重复创建</label><button disabled={!confirmed||action.busy} onClick={()=>{acknowledgePendingInspection();setConfirmed(false);setRecent(null);}}>完成核对</button></>}
 {rows.map(row=><div className="pending-row" key={row.key}><span>{operationName(row.operation)}：结果待确认</span><div className="button-row"><button disabled={action.busy} onClick={()=>void action.run(async()=>{const value=await inspectPending(row.key) as Receipt|null;setResult(value);setMessage(value?'已确认原提交成功。回到原表单继续即可读取这个结果。':'暂未找到可确认的回执，请保留原请求；这不代表提交失败。');})}>只读核对结果</button><details><summary>仍需重试</summary><p>此动作会按原账号、原内容、原请求再次提交。</p><button disabled={action.busy} onClick={()=>void action.run(async()=>{setResult(await replayPending(row.key) as Receipt);setMessage('原提交已确认，请查看对应资料。');})}>原样重试提交</button></details></div></div>)}
 {message&&<p role="status">{message}</p>}<ErrorBox error={action.error}/>{!rows.length&&!lost&&<button onClick={()=>{setResult(null);setMessage('');}}>收起结果</button>}</section>;
}
