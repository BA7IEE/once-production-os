import type { RecoveryDeltaItem, RecoveryDeltaResolutionReport } from '../../../../packages/core/src/recovery-model.ts';
import { RECOVERY_PREPARE_CONTAINED_OPERATIONS } from '../../../../packages/core/src/recovery-model.ts';
import { invariant } from '../../../../packages/core/src/errors.ts';
import type { SafetyJournalEntry, SafetyJournalState } from './safety-journal.ts';

const CONTAINED = new Set<string>(RECOVERY_PREPARE_CONTAINED_OPERATIONS);

function suffix(id: string, prefix: string): string | null {
    return id.startsWith(prefix) ? id.slice(prefix.length) : null;
}
function op(entry: SafetyJournalEntry, prefix: string): string {
    invariant(entry.action.startsWith(prefix) && entry.action.length > prefix.length,
        'SAFETY_DELTA_INVALID', '安全日志 completion marker operation 无效', 503);
    return entry.action.slice(prefix.length);
}
function item(key: string, operation: string, resourceId: string,
    state: RecoveryDeltaItem['state'], resolution: RecoveryDeltaItem['resolution'],
    reasonCode: string, evidenceSeqs: number[]): RecoveryDeltaItem {
    return { key, operation, resourceId, state, resolution, reasonCode,
        evidenceSeqs: [...evidenceSeqs].sort((a,b)=>a-b) };
}

export function analyzeSafetyDeltas(state: SafetyJournalState, backupSequence: number): RecoveryDeltaResolutionReport {
    invariant(Number.isSafeInteger(backupSequence) && backupSequence >= 0 && backupSequence <= state.entries.length,
        'SAFETY_DELTA_ANCHOR_INVALID', '安全日志 backup sequence 无效', 503);
    const intents = new Map<string, SafetyJournalEntry>();
    const commits = new Map<string, SafetyJournalEntry>();
    const aborts = new Map<string, SafetyJournalEntry>();
    for (const entry of state.entries) {
        const i=suffix(entry.auditId,'intent:'),c=suffix(entry.auditId,'commit:'),a=suffix(entry.auditId,'abort:');
        if(i!==null){ invariant(entry.resourceKind==='intent','SAFETY_DELTA_INVALID','intent marker 类型无效',503); intents.set(i,entry); }
        else if(c!==null){ invariant(entry.resourceKind==='intent-commit','SAFETY_DELTA_INVALID','commit marker 类型无效',503); commits.set(c,entry); }
        else if(a!==null){ invariant(entry.resourceKind==='intent-abort','SAFETY_DELTA_INVALID','abort marker 类型无效',503); aborts.set(a,entry); }
    }

    const post = state.entries.filter(x=>x.seq>backupSequence);
    const used = new Set<number>();
    const items: RecoveryDeltaItem[] = [];
    const logicalKeys = new Set<string>();
    for (const entry of post) {
        const key=suffix(entry.auditId,'intent:')??suffix(entry.auditId,'commit:')??suffix(entry.auditId,'abort:');
        if(key!==null) logicalKeys.add(key);
    }

    const committedPairs = new Set<string>();
    for (const [key,commit] of commits) {
        const operation=op(commit,'commit.');
        committedPairs.add(operation+'|'+commit.resourceId);
        if(!logicalKeys.has(key) && commit.seq>backupSequence) logicalKeys.add(key);
    }

    for (const key of [...logicalKeys].sort()) {
        const intent=intents.get(key),commit=commits.get(key),abort=aborts.get(key);
        invariant(!(commit && abort), 'SAFETY_DELTA_INVALID',
            '同一安全意图不能同时出现 commit 与 abort marker', 503);
        const evidence=[intent,commit,abort].filter((x): x is SafetyJournalEntry=>!!x&&x.seq>backupSequence);
        if(!evidence.length) continue;
        for(const row of evidence) used.add(row.seq);

        const operation=intent ? op(intent,'intent.') : commit ? op(commit,'commit.') : abort ? op(abort,'abort.') : '';
        if(intent) invariant(intent.action==='intent.'+operation,'SAFETY_DELTA_INVALID','intent operation 不一致',503);
        if(commit) invariant(commit.action==='commit.'+operation,'SAFETY_DELTA_INVALID','commit operation 不一致',503);
        if(abort) invariant(abort.action==='abort.'+operation,'SAFETY_DELTA_INVALID','abort operation 不一致',503);
        const workspaceId=intent?.workspaceId??commit?.workspaceId??abort!.workspaceId;
        invariant([intent,commit,abort].filter(Boolean).every(x=>x!.workspaceId===workspaceId),
            'SAFETY_DELTA_INVALID','同一安全意图的 marker workspace 不一致',503);
        if(intent&&commit) invariant(intent.seq < commit.seq,
            'SAFETY_DELTA_INVALID','commit marker 不能早于对应 intent',503);
        if(intent&&abort) {
            invariant(intent.seq < abort.seq,
                'SAFETY_DELTA_INVALID','abort marker 不能早于对应 intent',503);
            invariant(intent.resourceId===abort.resourceId,
                'SAFETY_DELTA_INVALID','abort marker 资源标识与 intent 不一致',503);
        }
        const resourceId=commit?.resourceId??intent?.resourceId??abort!.resourceId;

        if(commit){
            if(!intent){
                items.push(item(key,operation,resourceId,'COMMITTED','BLOCKER','MISSING_INTENT',
                    evidence.map(x=>x.seq)));
            }else if(CONTAINED.has(operation)){
                items.push(item(key,operation,resourceId,'COMMITTED','CONTAINED_BY_PREPARE','PREPARE_IS_MORE_RESTRICTIVE',
                    evidence.map(x=>x.seq)));
            }else{
                items.push(item(key,operation,resourceId,'COMMITTED','BLOCKER','COMMITTED_REPLAY_REQUIRED',
                    evidence.map(x=>x.seq)));
            }
        }else if(abort){
            items.push(item(key,operation,resourceId,'ABORTED','NO_COMMIT','ABORT_MARKER',
                evidence.map(x=>x.seq)));
        }else{
            items.push(item(key,operation,resourceId,'UNRESOLVED','BLOCKER','MISSING_COMPLETION_MARKER',
                evidence.map(x=>x.seq)));
        }
    }

    // Post-commit AuditEvent rows are supplementary if a commit marker for the same operation/resource
    // exists anywhere in the verified journal chain. Otherwise they prove an unaccounted committed delta.
    for(const row of post){
        if(used.has(row.seq)) continue;
        if(row.action.startsWith('intent.')||row.action.startsWith('commit.')||row.action.startsWith('abort.'))
            invariant(false,'SAFETY_DELTA_INVALID','未归并的 marker entry',503);
        if(committedPairs.has(row.action+'|'+row.resourceId)){
            items.push(item('audit:'+row.auditId,row.action,row.resourceId,'AUDIT_ONLY','SUPPLEMENTAL_AUDIT',
                'MATCHED_COMMIT_MARKER',[row.seq]));
        }else{
            items.push(item('audit:'+row.auditId,row.action,row.resourceId,'AUDIT_ONLY','BLOCKER',
                'UNMATCHED_COMMITTED_AUDIT',[row.seq]));
        }
        used.add(row.seq);
    }

    const expected=post.map(x=>x.seq).sort((a,b)=>a-b);
    const accounted=[...used].sort((a,b)=>a-b);
    invariant(expected.length===accounted.length&&expected.every((x,i)=>x===accounted[i]),
        'SAFETY_DELTA_INVALID','安全日志增量没有被完整归并',503);

    items.sort((a,b)=>(a.evidenceSeqs[0]??0)-(b.evidenceSeqs[0]??0)||a.key.localeCompare(b.key));
    const unresolved=items.filter(x=>x.resolution==='BLOCKER').length;
    return {
        schemaVersion:'once-recovery-delta-v1',
        backupSequence,
        currentSequence:state.snapshot.sequence,
        postBackupEntries:state.snapshot.sequence-backupSequence,
        resolved:items.length-unresolved,
        unresolved,
        items
    };
}
