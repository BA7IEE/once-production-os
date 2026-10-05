export type DependencyItem={clientItemKey:string;dependencyGroup:string;dependsOn:string[]};
/** Selecting a group includes prerequisites; removing it also removes dependent groups. */
export function toggleReviewGroup(items:DependencyItem[],selected:string[],key:string,checked:boolean){
 const chosen=new Set(selected),item=items.find(i=>i.clientItemKey===key);if(!item)return selected;
 for(const i of items.filter(i=>i.dependencyGroup===item.dependencyGroup))checked?chosen.add(i.clientItemKey):chosen.delete(i.clientItemKey);
 let changed=true;while(changed){changed=false;for(const i of items){
  if(checked&&chosen.has(i.clientItemKey)){for(const other of items.filter(o=>o.dependencyGroup===i.dependencyGroup||i.dependsOn.includes(o.clientItemKey)))if(!chosen.has(other.clientItemKey)){chosen.add(other.clientItemKey);changed=true;}}
  if(!checked&&chosen.has(i.clientItemKey)&&i.dependsOn.some(d=>!chosen.has(d))){for(const other of items.filter(o=>o.dependencyGroup===i.dependencyGroup))if(chosen.delete(other.clientItemKey))changed=true;}
 }}return items.filter(i=>chosen.has(i.clientItemKey)).map(i=>i.clientItemKey);
}
