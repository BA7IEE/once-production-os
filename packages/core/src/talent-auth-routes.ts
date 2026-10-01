import {v,uuid} from './validation.ts';
import type {RouteDefinition} from './routes.ts';
const purpose=v.enum(['LOGIN','RECOVER'] as const);
export const TalentAuthSchemas={context:v.object({purpose}),challenge:v.object({contextId:uuid,purpose,kind:v.enum(['EMAIL','PHONE'] as const),identity:v.string(320,3)}),verify:v.object({contextId:uuid,challengeId:uuid,purpose,code:v.string(6,6,/^[0-9]{6}$/)}),empty:v.object({}),revision:v.object({expectedRevision:v.number(1)})};
export const TALENT_AUTH_ROUTES:RouteDefinition[]=[
 {method:'POST',path:'/portal/auth/context',operation:'portal.auth.context',mode:'AUTH',schema:TalentAuthSchemas.context},
 {method:'GET',path:'/portal/auth/contexts/{id}',operation:'portal.auth.contextStatus',mode:'AUTH'},
 {method:'POST',path:'/portal/auth/challenges',operation:'portal.auth.challenge',mode:'AUTH',schema:TalentAuthSchemas.challenge},
 {method:'POST',path:'/portal/auth/verify',operation:'portal.auth.verify',mode:'AUTH',schema:TalentAuthSchemas.verify},
 {method:'GET',path:'/portal/me',operation:'portal.me',mode:'READ'},
 {method:'POST',path:'/portal/auth/logout',operation:'portal.auth.logout',mode:'AUTH',schema:TalentAuthSchemas.empty},
 {method:'POST',path:'/portal/auth/revoke-other-sessions',operation:'portal.sessions.revoke',mode:'COMMAND',schema:TalentAuthSchemas.empty},
 {method:'POST',path:'/talent-accounts/{id}/disable',operation:'talent.account.disable',mode:'COMMAND',permission:'members.manage',schema:TalentAuthSchemas.revision},
 {method:'POST',path:'/talent-accounts/{id}/erase',operation:'talent.account.erase',mode:'COMMAND',permission:'members.manage',schema:TalentAuthSchemas.revision}
];
