import type {ServicePrincipal} from './talent-v2-model.ts';
import {digest} from './json.ts';
export function authorizationEpoch(row:ServicePrincipal){return row.authorizationEpoch??1;}
export function authorizationChanged(a:ServicePrincipal,b:ServicePrincipal){return digest([a.permissionCodes,a.scopeId,a.defaultMaintainerMembershipId,a.status,a.expiresAt,a.recoveryEpoch])!==digest([b.permissionCodes,b.scopeId,b.defaultMaintainerMembershipId,b.status,b.expiresAt,b.recoveryEpoch]);}
export function normalizedMachineAuthorization(row:ServicePrincipal,old?:ServicePrincipal):ServicePrincipal{return {...row,authorizationEpoch:old?authorizationEpoch(old)+(authorizationChanged(old,row)?1:0):row.authorizationEpoch??1};}
