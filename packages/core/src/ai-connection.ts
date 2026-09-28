import type {Actor,Base,Clock,Config,RequestMeta} from './model.ts';
import type {Tx} from './store.ts';
import type {AiLedgerConfig} from './ai-ledger-model.ts';
import {v} from './validation.ts';
import {base,touch} from './helpers.ts';
import {invariant} from './errors.ts';
import {encryptContact,decryptContact} from './crypto.ts';
import {digest} from './json.ts';
import {requirePermission} from './policy.ts';
import {AiLedger} from './ai-ledger.ts';

export const CONNECTION_TEST_INPUT={taskType:'parse_search',locale:null,chunks:[],queryText:'连接测试，没有检索条件。',dictionary:[],promptVersion:'once-ai-connection-test-1',outputSchemaVersion:'once-ai-proposal-1'};
export const ConnectionTestSchema=v.object({expectedRevision:v.number(1,2147483647),confirmTest:v.boolean()});
export async function testConnection(tx:Tx,actor:Actor,raw:unknown,clock:Clock,config:Config,key:string,meta:RequestMeta){
 connectionOperator(actor);const d=ConnectionTestSchema.parse(raw),row=await connectionRow(tx,actor.workspaceId),c=await currentAiConfig(tx,actor.workspaceId,config);
 invariant(d.confirmTest&&row&&row.revision===d.expectedRevision&&c,'AI_CONNECTION_CHANGED','请刷新并确认使用已保存的连接进行测试',409);
 invariant(config.accessMode==='INTERNAL'&&config.dataEgressMode==='INTERNAL_APPROVED','AI_EGRESS_DISABLED','当前不允许外部调用',409);
 return new AiLedger(clock).reserve(tx,actor.workspaceId,actor.membershipId,key,digest(CONNECTION_TEST_INPUT),c.perTaskLimitUnits,c,meta);
}

export const ModelConnectionSchema=v.object({name:v.string(80,1),baseURL:v.string(2048,1),protocol:v.enum(['openai-chat','openai-responses','anthropic-messages']),model:v.string(200,1),timeoutMs:v.number(1000,120000),maxOutputTokens:v.number(128,16384)});
export type ModelConnection=ReturnType<typeof ModelConnectionSchema.parse>;
export const ConnectionSaveSchema=v.object({expectedRevision:v.number(0,2147483647),connection:ModelConnectionSchema,apiKey:v.string(1024),currency:v.string(3,3,/^[A-Z]{3}$/),perTaskLimitUnits:v.number(1,2000000000),dailyLimitUnits:v.number(1,2000000000)});
export interface AiConnection extends Base {settings:ModelConnection;keyCipher:string;currency:string;perTaskLimitUnits:number;dailyLimitUnits:number;}
export function connectionOperator(actor:Actor){requirePermission(actor,'members.manage');invariant(actor.actorKind!=='MACHINE','HUMAN_AI_REQUIRED','模型配置需要管理员本人操作',403);}
export function normalizeConnection(raw:unknown):ModelConnection {
 const c=ModelConnectionSchema.parse(raw);let url:URL;try{url=new URL(c.baseURL);}catch{invariant(false,'AI_CONNECTION_INVALID','模型地址无效',400);}
 invariant(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&!!c.name.trim()&&!!c.model.trim(),'AI_CONNECTION_INVALID','请使用不含凭证、查询参数或片段的 HTTPS 地址',400);
 return {...c,baseURL:url.href.replace(/\/+$/,'')};
}
export async function connectionRow(tx:Tx,workspaceId:string){return (await tx.find('aiConnections',{workspaceId}))[0]??null;}
export async function currentAiConfig(tx:Tx,workspaceId:string,config:Config):Promise<AiLedgerConfig|undefined>{
 const row=await connectionRow(tx,workspaceId);
 if(!row)return config.ai;
 return {enabled:true,providerIdentityHash:digest({connection:row.settings,keyCipher:row.keyCipher}),configRevision:row.revision,recoveryEpoch:config.recoveryEpoch,currency:row.currency,perTaskLimitUnits:row.perTaskLimitUnits,dailyLimitUnits:row.dailyLimitUnits,maxAttempts:1};
}
export async function readConnection(tx:Tx,actor:Actor){connectionOperator(actor);const row=await connectionRow(tx,actor.workspaceId);
 const tests=(await tx.find('aiRuns',{workspaceId:actor.workspaceId,inputDigest:digest(CONNECTION_TEST_INPUT)})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const test=tests[0],response=test?(await tx.find('aiResponseMetadata',{workspaceId:actor.workspaceId,runId:test.id}))[0]:null;
 return row?{id:row.id,revision:row.revision,connection:row.settings,hasKey:!!row.keyCipher,currency:row.currency,perTaskLimitUnits:row.perTaskLimitUnits,dailyLimitUnits:row.dailyLimitUnits,test:test?{configRevision:test.configRevision,state:test.state,outputStatus:response?.outputStatus??null}:null}:null;}
export async function saveConnection(tx:Tx,actor:Actor,raw:unknown,clock:Clock,config:Config){
 connectionOperator(actor);const d=ConnectionSaveSchema.parse(raw),settings=normalizeConnection(d.connection),old=await connectionRow(tx,actor.workspaceId);
 invariant((old?.revision??0)===d.expectedRevision,'REVISION_CONFLICT','连接配置已变化，请刷新后重试',409);
 invariant(d.perTaskLimitUnits<=d.dailyLimitUnits,'AI_CONFIG_INVALID','单次预留不能超过每日上限',400);
 invariant((!!old||!!d.apiKey)&&!/[\r\n]/.test(d.apiKey),'AI_KEY_REQUIRED','首次保存需要有效密钥',400);
 const stamp=old?touch(old,clock):base(actor.workspaceId,clock);
 if(!old)stamp.revision=Math.max(0,...(await tx.find('aiApprovals',{workspaceId:actor.workspaceId})).map(a=>a.configRevision),config.ai?.configRevision??0)+1;
 const keyCipher=d.apiKey?encryptContact(d.apiKey,config.contactKey,'ai-connection:'+actor.workspaceId+':'+stamp.id):old!.keyCipher;
 const row:AiConnection={...stamp,settings,keyCipher,currency:d.currency,perTaskLimitUnits:d.perTaskLimitUnits,dailyLimitUnits:d.dailyLimitUnits};
 // Every change invalidates prior approval; existing sources remain bound to the old identity.
 for(const a of await tx.find('aiApprovals',{workspaceId:actor.workspaceId,enabled:true}))await tx.replace('aiApprovals',{...touch(a,clock),enabled:false});
 if(old)await tx.replace('aiConnections',row);else await tx.insert('aiConnections',row);
 return {id:row.id,revision:row.revision};
}
export function connectionKey(row:AiConnection,config:Config){return decryptContact(row.keyCipher,config.contactKey,'ai-connection:'+row.workspaceId+':'+row.id);}
