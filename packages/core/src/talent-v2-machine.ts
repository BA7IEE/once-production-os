import {authorizationEpoch} from './machine-authorization.ts';
import type { Actor, Clock, Config, Permission, RequestMeta } from './model.ts';
import type { ServicePrincipal } from './talent-v2-model.ts';
import type { Tx } from './store.ts';
import { TD2Schemas as S } from './talent-v2-schema.ts';
import { audit, base, cas, page, touch, workspaceRow } from './helpers.ts';
import { invariant, missing } from './errors.ts';
import { equalSecret, hashSecret, randomSecret } from './crypto.ts';
import { permissionsFor, requirePermission, requireScope, scopeVisible } from './policy.ts';

export const INGESTION_PERMISSIONS:readonly Permission[]=['ingestion.schema.read','ingestion.submit','ingestion.read.own','ingestion.withdraw.own'];
export const MACHINE_PERMISSIONS:readonly Permission[]=['records.read','sources.read','talent.propose','talent.fact.write',...INGESTION_PERMISSIONS];
export function machineOwnerPermissions(permissions:Permission[]):Permission[]{
    const allowed=[...permissions];
    if(permissions.includes('records.write'))allowed.push('talent.fact.write','talent.propose',...INGESTION_PERMISSIONS);
    if(permissions.includes('sources.review'))allowed.push('talent.propose');
    return [...new Set(allowed)];
}
export function principalDto(row:ServicePrincipal){
    const {credentialHash:_,recoveryEpoch:__,...safe}=row;return safe;
}
export class MachineIdentity {
    clock:Clock; config:Config;
    constructor(clock:Clock,config:Config){this.clock=clock;this.config=config;}
    async management(tx:Tx,actor:Actor,id?:string){
        invariant(actor.actorKind!=='MACHINE','HUMAN_OPERATION_REQUIRED','机器账号不能管理访问凭证',403);requirePermission(actor,'members.manage');
        if(id){const row=await workspaceRow(tx,'servicePrincipals',id,actor.workspaceId);if(!row)missing();await requireScope(tx,actor,row.scopeId);return row;}
        return null;
    }
    async validateMaintainer(tx:Tx,workspaceId:string,id:string,scopeId:string,codes:Permission[]){
        const member=await workspaceRow(tx,'memberships',id,workspaceId),user=member?await workspaceRow(tx,'users',member.userId,workspaceId):null;
        invariant(!!member&&!!user&&member.status==='ACTIVE'&&user.status==='ACTIVE','MACHINE_MAINTAINER_UNAVAILABLE','机器账号的责任成员不可用',403);
        invariant(!codes.some(c=>INGESTION_PERMISSIONS.includes(c))||codes.every(c=>INGESTION_PERMISSIONS.includes(c)),'MACHINE_PERMISSION_ESCALATION','摄取凭证不能混用正式写入或其他旧机器权限',403);
        const permissions=machineOwnerPermissions(permissionsFor(member));
        invariant(codes.every(c=>MACHINE_PERMISSIONS.includes(c)&&permissions.includes(c)),'MACHINE_PERMISSION_ESCALATION','机器权限不能超过责任成员当前拥有的权限',403);
        const human:Actor={userId:user.id,membershipId:member.id,workspaceId,role:member.role,permissions,displayName:user.displayName,userEpoch:user.sessionEpoch,sessionId:''};
        invariant(await scopeVisible(tx,human,scopeId),'MACHINE_SCOPE_FORBIDDEN','责任成员无权访问所选范围',403);return human;
    }
    token(id:string,version:number){return `once_machine.${id}.${version}.${randomSecret()}`;}
    async create(tx:Tx,actor:Actor,input:unknown,meta:RequestMeta){
        await this.management(tx,actor);const d=S.principalCreate.parse(input);await requireScope(tx,actor,d.scopeId);
        invariant(Date.parse(d.expiresAt)>this.clock.now().getTime()&&Date.parse(d.expiresAt)<=this.clock.now().getTime()+90*86400000,'MACHINE_EXPIRY_INVALID','机器凭证有效期必须在未来90天以内',422);
        invariant(new Set(d.permissionCodes).size===d.permissionCodes.length,'MACHINE_PERMISSIONS_DUPLICATE','权限不能重复',422);
        await this.validateMaintainer(tx,actor.workspaceId,d.defaultMaintainerMembershipId,d.scopeId,d.permissionCodes);
        const initial=base(actor.workspaceId,this.clock),token=this.token(initial.id,1);
        const row:ServicePrincipal={...initial,authorizationEpoch:1,displayName:d.displayName,scopeId:d.scopeId,defaultMaintainerMembershipId:d.defaultMaintainerMembershipId,permissionCodes:d.permissionCodes,credentialHash:hashSecret(token),keyVersion:1,expiresAt:d.expiresAt,recoveryEpoch:this.config.recoveryEpoch,status:'ACTIVE'};
        await tx.insert('servicePrincipals',row);await audit(tx,actor,actor.workspaceId,'td2.principal.create','servicePrincipal',row.id,['created'],meta,this.clock);
        return {...principalDto(row),resourceId:row.id,token};
    }
    async rotate(tx:Tx,actor:Actor,id:string,input:unknown,meta:RequestMeta){
        const row=(await this.management(tx,actor,id))!,d=S.principalChange.parse(input);cas(row,d.expectedRevision);
        invariant(row.status==='ACTIVE','MACHINE_REVOKED','已撤销的机器账号不能恢复旧凭证',409);
        await this.validateMaintainer(tx,actor.workspaceId,row.defaultMaintainerMembershipId,row.scopeId,row.permissionCodes as Permission[]);
        const token=this.token(id,row.keyVersion+1),next={...touch(row,this.clock),keyVersion:row.keyVersion+1,credentialHash:hashSecret(token)};
        await tx.replace('servicePrincipals',next);await audit(tx,actor,actor.workspaceId,'td2.principal.rotate','servicePrincipal',id,['keyVersion'],meta,this.clock);
        return {...principalDto(next),resourceId:id,token};
    }
    async revoke(tx:Tx,actor:Actor,id:string,input:unknown){
        const row=(await this.management(tx,actor,id))!,d=S.principalChange.parse(input);cas(row,d.expectedRevision);
        const next={...touch(row,this.clock),credentialHash:null,keyVersion:row.keyVersion+1,status:'REVOKED' as const,authorizationEpoch:authorizationEpoch(row)+1};await tx.replace('servicePrincipals',next);return next;
    }
    async authorization(tx:Tx,actor:Actor,id:string,input:unknown){
        const row=(await this.management(tx,actor,id))!,d=S.principalAuthorization.parse(input);cas(row,d.expectedRevision);invariant(row.status==='ACTIVE','MACHINE_REVOKED','机器账号不可用',409);
        await requireScope(tx,actor,d.scopeId);await this.validateMaintainer(tx,actor.workspaceId,d.defaultMaintainerMembershipId,d.scopeId,d.permissionCodes);
        invariant(new Set(d.permissionCodes).size===d.permissionCodes.length,'MACHINE_PERMISSIONS_DUPLICATE','权限不能重复',422);
        const next={...touch(row,this.clock),scopeId:d.scopeId,defaultMaintainerMembershipId:d.defaultMaintainerMembershipId,permissionCodes:d.permissionCodes};
        next.authorizationEpoch=authorizationEpoch(row)+(JSON.stringify([row.scopeId,row.defaultMaintainerMembershipId,row.permissionCodes])!==JSON.stringify([next.scopeId,next.defaultMaintainerMembershipId,next.permissionCodes])?1:0);
        await tx.replace('servicePrincipals',next);return next;
    }
    async list(tx:Tx,actor:Actor,query:Record<string,string>){
        await this.management(tx,actor);const result=[];for(const row of await tx.find('servicePrincipals',{workspaceId:actor.workspaceId}))if(await scopeVisible(tx,actor,row.scopeId))result.push(principalDto(row));return page(result,query);
    }
    async authenticate(tx:Tx,token:string):Promise<Actor>{
        invariant(/^once_machine\.[a-f0-9-]{36}\.[1-9][0-9]*\.[A-Za-z0-9_-]{43}$/.test(token),'MACHINE_UNAUTHENTICATED','机器凭证无效',401);
        const [,id,version]=token.split('.'),row=await tx.get('servicePrincipals',id!);
        const valid=!!row&&row.status==='ACTIVE'&&row.keyVersion===Number(version)&&!!row.credentialHash&&equalSecret(hashSecret(token),row.credentialHash)&&!!row.expiresAt&&Date.parse(row.expiresAt)>this.clock.now().getTime();
        invariant(valid&&!!row,'MACHINE_UNAUTHENTICATED','机器凭证已过期、被撤销或无效',401);
        const workspace=await tx.get('workspaces',row.workspaceId);
        invariant(this.config.accessMode==='INTERNAL'&&workspace?.recoveryEpoch===this.config.recoveryEpoch&&row.recoveryEpoch===this.config.recoveryEpoch,'MAINTENANCE','系统处于恢复隔离或维护状态',503);
        const maintainer=await this.validateMaintainer(tx,row.workspaceId,row.defaultMaintainerMembershipId,row.scopeId,row.permissionCodes as Permission[]);
        return {...maintainer,actorKind:'MACHINE',servicePrincipalId:row.id,machineScopeId:row.scopeId,permissions:row.permissionCodes as Permission[],displayName:row.displayName,sessionId:''};
    }
}
