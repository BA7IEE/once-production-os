import {useState} from 'react';
import {inspectPending,pendingKey} from './api.ts';
import type {Inputs} from './generated/requests.ts';
import {ErrorBox,useAction} from './ui.tsx';

/** Read inspection is separate from the user's explicit replay action. */
export function CommandRecovery({operation,params={},onRetry,busy=false}:{operation:keyof Inputs;params?:Record<string,string>;onRetry:()=>void;busy?:boolean}){
 const a=useAction(),[message,setMessage]=useState(''),[confirmed,setConfirmed]=useState(false);
 return <div className="notice command-recovery" role="status"><p>本次提交结果未知，保留原内容和请求编号。</p><ErrorBox error={a.error}/>{message&&<p>{message}</p>}<button disabled={a.busy||busy} onClick={()=>void a.run(async()=>{const key=pendingKey(operation,params);if(!key)throw new Error('当前没有可核对的原请求，请使用原账号登录。');const result=await inspectPending(key);setConfirmed(!!result);setMessage(result?'已找到原提交回执。继续处理只会读取已确认结果。':'还没有可确认的回执；这不表示原提交没有执行。');})}>只读核对原提交</button>{confirmed?<button disabled={a.busy||busy} onClick={onRetry}>继续处理核对结果</button>:<details><summary>原样重试提交</summary><p>使用原内容和原请求编号再次提交，由服务器防止重复执行。</p><button disabled={a.busy||busy} onClick={onRetry}>明确原样重试</button></details>}</div>;
}
