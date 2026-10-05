export type PortalIdentityFields={name:string;aliases:string;intro:string};
type DraftSnapshot={id:string;revision:number;items:Array<{field:string;value:unknown}>};
type ReadTicket={owner:string;view:number;sequence:number};
const empty=():PortalIdentityFields=>({name:'',aliases:'',intro:''});
function identity(s:DraftSnapshot):PortalIdentityFields{return {name:String(s.items.find(i=>i.field==='displayName')?.value??''),aliases:((s.items.find(i=>i.field==='aliases')?.value??[]) as string[]).join('\n'),intro:String(s.items.find(i=>i.field==='intro')?.value??'')};}
/** Server/media snapshots and unsaved identity text have separate lifetimes. */
export class PortalDraftState<T extends DraftSnapshot>{
 readonly owner:string;id:string|null;target='';snapshot:T|null=null;fields=empty();dirty=false;conflict=false;
 private baseline=empty();
 private view=0;private sequence=0;private active=true;
 constructor(owner:string,id:string|null){this.owner=owner;this.id=id;}
 activate(){this.active=true;}
 deactivate(){this.active=false;this.view++;}
 get current(){return this.active;}
 beginRead():ReadTicket{return {owner:this.owner,view:this.view,sequence:++this.sequence};}
 accepts(ticket:ReadTicket){return this.active&&ticket.owner===this.owner&&ticket.view===this.view&&ticket.sequence===this.sequence;}
 receive(ticket:ReadTicket,rows:T[],savedIdentity=false){
  if(!this.accepts(ticket))return false;
  const next=rows.find(s=>s.id===this.id);
  if(this.id&&!next){this.snapshot=null;return false;}
  if(next){if(this.snapshot&&next.revision<this.snapshot.revision)return false;this.snapshot=next;const fields=identity(next);if(!this.dirty||savedIdentity){this.fields=fields;this.baseline={...fields};this.conflict=false;}else this.conflict=JSON.stringify(fields)!==JSON.stringify(this.baseline);if(savedIdentity)this.dirty=false;}
  return true;
 }
 open(snapshot:T){this.view++;this.id=snapshot.id;this.target='';this.snapshot=snapshot;this.fields=identity(snapshot);this.baseline={...this.fields};this.dirty=false;this.conflict=false;}
 create(target:string,fields:PortalIdentityFields=empty()){this.view++;this.id=null;this.target=target;this.snapshot=null;this.fields={...fields};this.baseline={...fields};this.dirty=false;this.conflict=false;}
 attach(id:string){this.id=id;this.target='';}
 change(field:keyof PortalIdentityFields,value:string){this.fields={...this.fields,[field]:value};this.dirty=true;}
 discard(){if(this.snapshot){this.fields=identity(this.snapshot);this.baseline={...this.fields};this.dirty=false;this.conflict=false;}}
 clear(){this.view++;this.id=null;this.target='';this.snapshot=null;this.fields=empty();this.baseline=empty();this.dirty=false;this.conflict=false;}
}
