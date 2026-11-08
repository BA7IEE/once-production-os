import {useRef} from 'react';
import {ApiError,call} from './api.ts';
import type {Inputs} from './generated/requests.ts';
import type {Receipt} from './dto.ts';
import {useAction,ErrorBox} from './ui.tsx';
import {CommandRecovery} from './command-recovery.tsx';
/** Keeps exactly the original form body for the existing inspection/replay protocol. */
export function useDomainCommand(done:(r:Receipt)=>void){const a=useAction(),pending=useRef<{op:keyof Inputs;input:Inputs[keyof Inputs];params:Record<string,string>}|null>(null);const unknown=a.error instanceof ApiError&&a.error.unknownOutcome;
 const execute=async()=>{const p=pending.current;if(!p)return;try{const r=await call<typeof p.op,Receipt>(p.op,p.input,p.params);pending.current=null;done(r);}catch(e){if(!(e instanceof ApiError&&e.unknownOutcome))pending.current=null;throw e;}};
 return {...a,unknown,pending:pending.current,submit:<K extends keyof Inputs>(op:K,input:Inputs[K],params:Record<string,string>={})=>a.run(async()=>{pending.current??={op,input:structuredClone(input),params};await execute();}),retry:()=>a.run(execute)};
}
export function DomainCommandState({command:c}:{command:ReturnType<typeof useDomainCommand>}){return <><ErrorBox error={c.error}/>{c.unknown&&c.pending&&<CommandRecovery operation={c.pending.op} params={c.pending.params} onRetry={()=>void c.retry()} busy={c.busy}/>}</>;}
