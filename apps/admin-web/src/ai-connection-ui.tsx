import {useEffect,useState} from 'react';
import {call,read} from './api.ts';
import {ErrorBox,Field,useAction,useLoad} from './ui.tsx';
import {outcomeUnknown} from './talent-edit.tsx';
interface Connection {id:string;revision:number;connection:{name:string;baseURL:string;protocol:'openai-chat'|'openai-responses'|'anthropic-messages';model:string;timeoutMs:number;maxOutputTokens:number};hasKey:boolean;currency:string;perTaskLimitUnits:number;dailyLimitUnits:number;test:null|{configRevision:number;state:string;outputStatus:string|null};}
export function AiConnectionPanel({changed,setLocked}:{changed:()=>void;setLocked:(value:boolean)=>void}){
 const [tick,setTick]=useState(0),load=useLoad(()=>read<Connection|null>('ai.connection'),tick);
 return <section><h3>模型连接</h3><ErrorBox error={load.error}/>{!load.busy&&!load.error&&<ConnectionForm setLocked={setLocked} key={load.data?.revision??0} row={load.data??null} refresh={()=>{setTick(t=>t+1);changed();}}/>}</section>;
}
function ConnectionForm({row,refresh,setLocked}:{row:Connection|null;refresh:()=>void;setLocked:(value:boolean)=>void}){
 const [connection,setConnection]=useState(row?.connection??{name:'默认模型',baseURL:'',protocol:'openai-chat' as Connection['connection']['protocol'],model:'',timeoutMs:60000,maxOutputTokens:2048});
 const [apiKey,setKey]=useState(''),[currency,setCurrency]=useState(row?.currency??'USD'),[perTask,setPerTask]=useState(row?.perTaskLimitUnits??50),[daily,setDaily]=useState(row?.dailyLimitUnits??1000),[pending,setPending]=useState<(()=>Promise<void>)|null>(null);
 const action=useAction(),unknown=outcomeUnknown(action.error),busy=action.busy||unknown;
 useEffect(()=>{setLocked(busy);return()=>setLocked(false);},[busy,setLocked]);
 const run=(fn:()=>Promise<void>)=>{setPending(()=>fn);void action.run(async()=>{await fn();setPending(null);setKey('');refresh();});};
 return <><ErrorBox error={action.error}/>{unknown&&pending&&<button disabled={action.busy} onClick={()=>run(pending)}>原样重试本次操作</button>}<fieldset disabled={busy}>
 <Field label="连接名称"><input value={connection.name} onChange={e=>setConnection({...connection,name:e.target.value})}/></Field>
 <Field label="API 地址"><input type="url" placeholder="https://api.example.com/v1" value={connection.baseURL} onChange={e=>setConnection({...connection,baseURL:e.target.value})}/></Field>
 <Field label="接口协议"><select value={connection.protocol} onChange={e=>setConnection({...connection,protocol:e.target.value as Connection['connection']['protocol']})}><option value="openai-chat">OpenAI Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic-messages">Anthropic Messages</option></select></Field>
 <Field label="模型名称"><input value={connection.model} onChange={e=>setConnection({...connection,model:e.target.value})}/></Field>
 <Field label={row?.hasKey?'密钥（留空保留现有密钥）':'密钥'}><input type="password" autoComplete="new-password" value={apiKey} onChange={e=>setKey(e.target.value)}/></Field>
 <details><summary>调用限制</summary><Field label="超时（毫秒）"><input type="number" min="1000" max="120000" value={connection.timeoutMs} onChange={e=>setConnection({...connection,timeoutMs:Number(e.target.value)})}/></Field><Field label="最大输出 Token"><input type="number" min="128" max="16384" value={connection.maxOutputTokens} onChange={e=>setConnection({...connection,maxOutputTokens:Number(e.target.value)})}/></Field><Field label="预留币种"><input maxLength={3} value={currency} onChange={e=>setCurrency(e.target.value.toUpperCase())}/></Field><Field label="单次预留（最小货币单位，如美分）"><input type="number" min="1" value={perTask} onChange={e=>setPerTask(Number(e.target.value))}/></Field><Field label="每日预留上限"><input type="number" min="1" value={daily} onChange={e=>setDaily(Number(e.target.value))}/></Field><p>预留用于限制调用，不是实际账单。未取得费用证明时不会记为免费；测试也占用预留。</p></details>
 <button onClick={()=>{const data={expectedRevision:row?.revision??0,connection,apiKey,currency,perTaskLimitUnits:perTask,dailyLimitUnits:daily};run(async()=>{await call('ai.connection.save',data);});}}>保存模型连接</button>
 {row&&<><button onClick={()=>{const data={expectedRevision:row.revision,confirmTest:true};run(async()=>{await call('ai.connection.test',data);});}}>测试已保存的连接</button><button onClick={refresh}>刷新测试结果</button>{row.test&&<p>最近测试（配置版本 {row.test.configRevision}）：{row.test.outputStatus==='VALID_JSON'?'接口已返回有效测试结果':row.test.outputStatus?'接口已返回，但结果不符合要求':row.test.state==='QUEUED'?'等待后台执行':row.test.state==='RUNNING'?'正在调用':row.test.state==='CANCELLED'?'已取消':'结果未知，请核对后再测试'}。</p>}</>}
 <p>保存后需在下方批准当前配置。测试仅发送固定短句，不携带业务资料。</p>
 </fieldset></>;
}
