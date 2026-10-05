import type {Me} from './dto.ts';
const recent=new Map<string,string[]>();
const key=(me:Me)=>me.membershipId+':'+me.directoryStateScope;
export function rememberTalent(me:Me,id:string){const old=recent.get(key(me))??[];recent.set(key(me),[id,...old.filter(v=>v!==id)].slice(0,6));}
export const recentTalents=(me:Me)=>recent.get(key(me))??[];
window.addEventListener('once-session-expired',()=>recent.clear());
