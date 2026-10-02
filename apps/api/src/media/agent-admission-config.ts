import {AGENT_MEDIA_CEILINGS,type AgentMediaAdmission} from '../../../../packages/core/src/agent-media.ts';
import {invariant} from '../../../../packages/core/src/errors.ts';
export const AGENT_MEDIA_ENV={workspaceActiveUploads:'AGENT_MEDIA_WORKSPACE_ACTIVE_UPLOADS',principalActiveUploads:'AGENT_MEDIA_PRINCIPAL_ACTIVE_UPLOADS',hourlyUploads:'AGENT_MEDIA_HOURLY_UPLOADS',submissionFiles:'AGENT_MEDIA_SUBMISSION_FILES',submissionBytes:'AGENT_MEDIA_SUBMISSION_BYTES',principalRetainedBytes:'AGENT_MEDIA_PRINCIPAL_RETAINED_BYTES',workspaceRetainedBytes:'AGENT_MEDIA_WORKSPACE_RETAINED_BYTES'} as const;
export function loadAgentMediaAdmission(env:NodeJS.ProcessEnv):AgentMediaAdmission|undefined{
 const keys=Object.keys(AGENT_MEDIA_ENV) as Array<keyof AgentMediaAdmission>;
 if(!keys.some(k=>env[AGENT_MEDIA_ENV[k]]!==undefined))return undefined;
 const result={} as AgentMediaAdmission;
 for(const key of keys){const raw=env[AGENT_MEDIA_ENV[key]]??'',n=Number(raw);invariant(/^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=1&&n<=AGENT_MEDIA_CEILINGS[key],'AGENT_MEDIA_QUOTA_INVALID','机器额度须完整配置并在受控上限内：'+AGENT_MEDIA_ENV[key],503);result[key]=n;}
 return result;
}
