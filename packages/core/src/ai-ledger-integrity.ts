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
 const tasks=await tx.find('aiTasks',{workspaceId}),grants=await tx.find('aiGrants',{workspaceId}),deps=await tx.find('aiDependencies',{workspaceId});
 for(const task of tasks){if(!runs.some(r=>r.id===task.runId&&r.actorId===task.actorId))relationFailures++;if(task.proposalState==='ERASED'&&[task.inputSpec,task.oldValues,task.output].some(v=>JSON.stringify(v)!=='{}'))relationFailures++;}
 for(const dep of deps)if(!tasks.some(t=>t.id===dep.taskId)||(await tx.get('sources',dep.sourceId))?.workspaceId!==workspaceId||(dep.grantId&&!grants.some(g=>g.id===dep.grantId&&g.sourceId===dep.sourceId)))relationFailures++;
 const reconciliations=await tx.find('aiReconciliations',{workspaceId});
 const releases=await tx.find('aiBudgetReleases',{workspaceId});
 const approvals=await tx.find('aiApprovals',{workspaceId});
 for(const a of approvals)if((await tx.get('memberships',a.reviewerId))?.workspaceId!==workspaceId)relationFailures++;
 for(const r of releases)if(!budgets.some(b=>b.id===r.budgetId)||!approvals.some(a=>a.id===r.approvalId)||(await tx.get('memberships',r.reviewerId))?.workspaceId!==workspaceId)relationFailures++;
 for(const r of reconciliations)if(!attempts.some(a=>a.id===r.attemptId&&a.state===r.outcome)||(await tx.get('sources',r.evidenceSourceId))?.workspaceId!==workspaceId||(await tx.get('memberships',r.reviewerId))?.workspaceId!==workspaceId)relationFailures++;
 const responses=await tx.find('aiResponseMetadata',{workspaceId}),connections=await tx.find('aiConnections',{workspaceId});
 for(const r of responses)if(!runs.some(x=>x.id===r.runId))relationFailures++;
 const sorted=<T extends {id:string}>(rows:T[])=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
 return {runCount:runs.length,attemptCount:attempts.length,unresolvedCount:attempts.filter(a=>['UNKNOWN','MAY_HAVE_EXECUTED'].includes(a.state)).length,relationFailures,graphDigest:digest({responses:sorted(responses),connections:sorted(connections),reconciliations:sorted(reconciliations),releases:sorted(releases),approvals:sorted(approvals),budgets:sorted(budgets),runs:sorted(runs),attempts:sorted(attempts),tasks:sorted(tasks),grants:sorted(grants),dependencies:sorted(deps)}),blockers:relationFailures?['AI_LEDGER_INVALID']:[]};
}
