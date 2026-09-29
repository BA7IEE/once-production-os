// Ephemeral interface state only; cleared on every identity loss or account exit.
const memory=new Map<string,unknown>();
export function recallList<T>(key:string,fallback:T):T{return (memory.get(key) as T|undefined)??fallback;}
export function rememberList<T>(key:string,value:T){memory.set(key,value);}
export function clearListMemory(){memory.clear();}
