/** A portal session owns its pending request. Internal-member transport is never shared. */
export type PortalReceipt = {operationId:string;resourceId:string;revision:number;state:'SUCCEEDED'|'ACCEPTED'};
export class PortalRequestError extends Error {
    status:number;code:string;unknownOutcome:boolean;
    constructor(message:string,status:number,code:string,unknownOutcome:boolean) {super(message);this.status=status;this.code=code;this.unknownOutcome=unknownOutcome;}
}
export interface PortalPending {path:string;method:string;body:string;key:string;owner:string;uncertain:boolean;receipt?:PortalReceipt}
export type PortalMarker={owner:string;key:string;draft:boolean;receipt?:PortalReceipt};
export type PortalMarkerStorage={read:(owner:string)=>PortalMarker|null;write:(marker:PortalMarker)=>void;remove:(owner:string)=>void};
function receipt(result:unknown):PortalReceipt{
 const r=result as Partial<PortalReceipt>|null,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
 if(!r||!uuid.test(r.operationId??'')||!uuid.test(r.resourceId??'')||!Number.isSafeInteger(r.revision)||r.revision!<1||r.state!=='SUCCEEDED')throw new PortalRequestError('服务器回执无法确认，请保留原请求核对。',0,'RECEIPT_INVALID',true);
 return r as PortalReceipt;
}
export class PortalCommands {
    pending:PortalPending|null=null;
    orphan:PortalMarker|null=null;storage?:PortalMarkerStorage;
    restorationError:Error|null=null;
    request:(path:string,method:string,body:unknown,key:string)=>Promise<unknown>;changed:()=>void;
    constructor(request:PortalCommands['request'],changed:()=>void,storage?:PortalMarkerStorage){this.request=request;this.changed=changed;this.storage=storage;}
    get hasPending(){return !!(this.pending||this.orphan||this.restorationError);}
    get confirmed(){return this.pending?.receipt??this.orphan?.receipt;}
    get draftResourceId(){return this.confirmed&&(this.orphan?.draft||this.pending?.method==='POST'&&(this.pending.path==='/submissions'||this.pending.path.endsWith('/fork')))?this.confirmed.resourceId:null;}
    restore(owner:string){if(this.hasPending||!this.storage)return;try{const r=this.storage.read(owner);if(!r)return;this.orphan={owner:r.owner,key:r.key,draft:r.draft};this.changed();}catch(error){this.restorationError=error instanceof Error?error:new Error('无法读取待确认标记');this.changed();throw this.restorationError;}}
    async submit(owner:string,path:string,body:unknown,method='POST'):Promise<PortalReceipt>{
        if(this.hasPending)throw new Error('上次操作尚未核对，请先核对原请求或刷新已保存的资料。');
        const key=crypto.randomUUID();this.storage?.write({owner,key,draft:method==='POST'&&(path==='/submissions'||path.endsWith('/fork'))});
        this.pending={path,method,body:JSON.stringify(body),key,owner,uncertain:false};this.changed();
        return this.replay(owner);
    }
    async replay(owner:string):Promise<PortalReceipt>{
        if(this.restorationError)throw this.restorationError;
        if(this.orphan){if(this.orphan.owner!==owner)throw new Error('请使用原人才账号核对');if(!this.orphan.receipt)this.orphan.receipt=receipt(await this.request('/commands/'+this.orphan.key,'GET',undefined,''));this.changed();return this.orphan.receipt;}
        const p=this.pending;if(!p||p.owner!==owner)throw new Error('请使用原人才账号核对');
        // A successful write followed by a failed read only needs a fresh read.
        if(p.receipt)return p.receipt;
        try {
            const result=await this.request(p.path,p.method,JSON.parse(p.body),p.key);
            p.receipt=receipt(result);this.changed();return p.receipt;
        } catch(error) {
            if(error instanceof PortalRequestError&&!error.unknownOutcome&&!p.uncertain){this.storage?.remove(owner);this.pending=null;}
            else p.uncertain=true;
            this.changed();throw error;
        }
    }
    rendered(){const owner=this.pending?.owner??this.orphan?.owner;if(owner)this.storage?.remove(owner);this.pending=null;this.orphan=null;this.changed();}
}
