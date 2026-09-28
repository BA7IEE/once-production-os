import type { Actor, Clock, CommandReceipt } from './model.ts';
import type { Tx } from './store.ts';
import { invariant, missing } from './errors.ts';
import { requirePermission, requireScope, sourceFor } from './policy.ts';
import { workspaceRow } from './helpers.ts';
import { TD2_TABLES, OWNER_KEYS, type FactTable } from './talent-v2-schema.ts';
import { asRow, loadTalentGraph, td2PersonFor } from './talent-v2-graph.ts';
const MACHINE_READS=new Set(['td2.schema','td2.person.list','td2.person.get','td2.resolve','td2.organization.list']);
const MACHINE_WRITES=new Set(['td2.person.create','td2.person.patch','td2.person.enroll']);
export function authorizeTd2Operation(actor:Actor,operation:string,mode:string){
    if(actor.actorKind==='MACHINE'){
        const fact=/^td2\.fact\.[A-Za-z]+\.(create|patch)$/.test(operation);
        invariant(MACHINE_READS.has(operation)||MACHINE_WRITES.has(operation)||fact||operation==='td2.proposal.create','MACHINE_OPERATION_FORBIDDEN','此操作不对机器账号开放',403);
        requirePermission(actor,operation==='td2.proposal.create'?'talent.propose':mode==='READ'?'records.read':'talent.fact.write');
        return;
    }
    if(!operation.startsWith('td2.'))return;
    if(operation.startsWith('td2.fact.')||MACHINE_WRITES.has(operation)||operation.startsWith('td2.collection.'))requirePermission(actor,'records.write');
    if(operation==='td2.proposal.create')invariant(actor.permissions.includes('records.write')||actor.permissions.includes('sources.review'),'FORBIDDEN','当前账号不能提交修改建议',403);
}
export async function authorizeTd2Resource(tx:Tx,actor:Actor,kind:string,id:string,clock:Clock){
    if(kind==='talentMigrationReview'){
        invariant(actor.actorKind!=='MACHINE','HUMAN_REVIEW_REQUIRED','旧资料复核需要内部成员',403);requirePermission(actor,'sources.review');requirePermission(actor,'records.write');
        const row=await workspaceRow(tx,'talentMigrationReviews',id,actor.workspaceId);if(!row||row.reason!=='HEIGHT_SEMANTICS_REQUIRED')missing();const person=await td2PersonFor(tx,actor,row.personId);await sourceFor(tx,actor,person.sourceId,clock);return;
    }
    if(kind==='talentFact'){
        const g=await loadTalentGraph(tx,actor,clock);
        for(const table of TD2_TABLES){const row=g.fact(table,id);if(row&&g.readable(table,row))return;}
        missing();
    }
    if(kind==='fieldProposal'){
        const row=await workspaceRow(tx,'fieldProposals',id,actor.workspaceId);if(!row)missing();await sourceFor(tx,actor,row.sourceId,clock);
        const pair=Object.entries(OWNER_KEYS).find(([,key])=>asRow(row)[key]);if(!pair)missing();
        if(pair[0]==='person'){await td2PersonFor(tx,actor,String(asRow(row)[pair[1]]));return;}
        return authorizeTd2Resource(tx,actor,'talentFact',String(asRow(row)[pair[1]]),clock);
    }
    if(kind==='servicePrincipal'){
        requirePermission(actor,'members.manage');invariant(actor.actorKind!=='MACHINE','MACHINE_OPERATION_FORBIDDEN','机器账号不能管理凭证',403);
        const row=await workspaceRow(tx,'servicePrincipals',id,actor.workspaceId);if(!row)missing();await requireScope(tx,actor,row.scopeId);return;
    }
    if(kind==='organization'){
        const row=await workspaceRow(tx,'organizations',id,actor.workspaceId);if(!row)missing();await requireScope(tx,actor,row.scopeId);await sourceFor(tx,actor,row.sourceId,clock);return;
    }
    if(kind==='capabilityDefinition'){
        requirePermission(actor,'catalog.manage');if(!(await workspaceRow(tx,'capabilityDefinitions',id,actor.workspaceId)))missing();return;
    }
    missing();
}
export const TD2_RESOURCE_KINDS=['talentMigrationReview','talentFact','fieldProposal','servicePrincipal','organization','capabilityDefinition'] as const;
