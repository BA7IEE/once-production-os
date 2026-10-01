import {MEDIA_ADMISSION_DEFAULTS,type MediaAdmission} from '../../../../packages/core/src/media-model.ts';
import {invariant} from '../../../../packages/core/src/errors.ts';
export function loadMediaAdmission(env:NodeJS.ProcessEnv):MediaAdmission{
 const result:MediaAdmission={...MEDIA_ADMISSION_DEFAULTS};
 const names={talentBytes:'MEDIA_TALENT_BYTES',enrollBytes:'MEDIA_ENROLL_BYTES',workspaceBytes:'MEDIA_WORKSPACE_BYTES',workspaceActiveBytes:'MEDIA_ACTIVE_BYTES',actorActive:'MEDIA_ACTOR_ACTIVE',workspaceActive:'MEDIA_WORKSPACE_ACTIVE',actorHourly:'MEDIA_ACTOR_HOURLY'} as const;
 for(const key of Object.keys(names) as Array<keyof typeof names>){const raw=env[names[key]];if(raw===undefined)continue;const n=Number(raw);invariant(/^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=1&&n<=MEDIA_ADMISSION_DEFAULTS[key],'MEDIA_ADMISSION_CONFIG_INVALID',names[key]+'须为有效的收紧限额',503);result[key]=n;}
 return result;
}
