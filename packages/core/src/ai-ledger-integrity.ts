import type {Tx} from './store.ts';
import {digest} from './json.ts';
export async function inspectAiLedger(tx:Tx,workspaceId:string){
 const budgets=await tx.find('aiBudgets',{workspaceId}),runs=await tx.find('aiRuns',{workspaceId}),attempts=await tx.find('aiAttempts',{workspaceId});let relationFailures=0;
 for(const b of budgets){const selected=runs.filter(r=>r.budgetId===b.id);if(b.reservedUnits!==selected.filter(r=>r.settledUnits===null).reduce((n,r)=>n+r.reservedUnits,0)||b.settledUnits!==selected.reduce((n,r)=>n+(r.settledUnits??0),0))relationFailures++;}
 for(const r of runs){
  if(!budgets.some(b=>b.id===r.budgetId)||(await tx.get('memberships',r.actorId))?.workspaceId!==workspaceId)relationFailures++;
  const owned=attempts.filter(a=>a.runId===r.id),unresolved=owned.filter(a=>['MAY_HAVE_EXECUTED','UNKNOWN'].includes(a.state));
  if(unresolved.length>1||r.state==='RUNNING'&&(unresolved.length!==1||unresolved[0]!.state!=='MAY_HAVE_EXECUTED')||r.state==='UNKNOWN'&&(unresolved.length!==1||unresolved[0]!.state!=='UNKNOWN')||!['RUNNING','UNKNOWN'].includes(r.state)&&unresolved.length>0||r.state==='QUEUED'&&owned.some(a=>a.state!=='NOT_EXECUTED'))relationFailures++;
  if((r.settledUnits===null)!==['QUEUED','RUNNING','UNKNOWN'].includes(r.state))relationFailures++;
 }
 for(const a of attempts)if(!runs.some(r=>r.id===a.runId&&r.requestDigest===a.requestDigest)||(a.settlementDigest===null)!==['MAY_HAVE_EXECUTED','UNKNOWN'].includes(a.state))relationFailures++;
 const sorted=<T extends {id:string}>(rows:T[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 return {runCount:runs.length,attemptCount:attempts.length,unresolvedCount:attempts.filter(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)).length,relationFailures,graphDigest:digest({budgets:sorted(budgets),runs:sorted(runs),attempts:sorted(attempts)}),blockers:relationFailures?['AI_LEDGER_INVALID']:[]};
}
