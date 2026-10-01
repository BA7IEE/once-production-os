import {invariant} from './errors.ts';
export const MEDIA_RETENTION_DEFAULTS=Object.freeze({draft:90,submitted:180,decided:30,withdrawn:7});
export type MediaRetention={-readonly[K in keyof typeof MEDIA_RETENTION_DEFAULTS]:number};
export function loadMediaRetention(env:Record<string,string|undefined>):MediaRetention {
 const out:MediaRetention={...MEDIA_RETENTION_DEFAULTS};for(const key of Object.keys(out) as Array<keyof MediaRetention>){const raw=env['MEDIA_RETENTION_'+key.toUpperCase()+'_DAYS'];if(raw===undefined)continue;const n=Number(raw);invariant(/^\d+$/.test(raw)&&Number.isSafeInteger(n)&&n>=1&&n<=out[key],'MEDIA_RETENTION_CONFIG_INVALID','媒体保留期只能收紧，不能超过默认值',503);out[key]=n;}return out;
}
