/** A portal session owns its pending request. Internal-member transport is never shared. */
export type PortalReceipt = {operationId:string;resourceId:string;revision:number;state:'SUCCEEDED'|'ACCEPTED'};
export class PortalRequestError extends Error {
    status:number;code:string;unknownOutcome:boolean;
    constructor(message:string,status:number,code:string,unknownOutcome:boolean) {super(message);this.status=status;this.code=code;this.unknownOutcome=unknownOutcome;}
}
/** A stop receipt confirms only the fence, not the original business action. */
export class PortalStopConfirmed extends Error {
    constructor(){super('原请求已阻止后续执行，请刷新当前资料。');}
}
export type PortalCancelMarker={uploadId:string;expectedRevision:number};
export interface PortalPending {path:string;method:string;body:string;key:string;owner:string;uncertain:boolean;receipt?:PortalReceipt;cancel?:PortalCancelMarker;cancelBinding?:string;nonCancel?:true}
export type PortalMarker={owner:string;key:string;draft:boolean;receipt?:PortalReceipt;cancelBinding?:string;nonCancel?:true};
export type PortalMarkerStorage={read:(owner:string)=>PortalMarker|null;write:(marker:PortalMarker)=>void;remove:(owner:string,key:string,binding?:string,nonCancel?:true)=>void};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function receipt(result:unknown):PortalReceipt{
 const r=result as Partial<PortalReceipt>|null;
 if(!r||!uuid.test(r.operationId??'')||!uuid.test(r.resourceId??'')||!Number.isSafeInteger(r.revision)||r.revision!<1||r.state!=='SUCCEEDED')throw new PortalRequestError('服务器回执无法确认，请保留原请求核对。',0,'RECEIPT_INVALID',true);
 return r as PortalReceipt;
}
function cancelMarker(path:string,method:string,body:unknown):PortalCancelMarker|undefined{
 const match=method==='POST'?/^\/uploads\/([0-9a-f-]{36})\/cancel$/i.exec(path):null;
 const input=body as {expectedRevision?:unknown}|null;
 if(!match||!uuid.test(match[1]!)||!input||typeof input!=='object'||Object.keys(input).length!==1||!Number.isSafeInteger(input.expectedRevision)||Number(input.expectedRevision)<1||!Number.isSafeInteger(Number(input.expectedRevision)+1))return;
 return {uploadId:match[1]!,expectedRevision:Number(input.expectedRevision)};
}
async function sha256(text:string){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');}
async function cancelBinding(key:string,cancel:PortalCancelMarker){
 // Keys are deliberately ordered exactly like the server's canonical JSON encoder.
 const requestDigest=await sha256(JSON.stringify({input:{expectedRevision:cancel.expectedRevision},operation:'portal.upload.cancel',targetId:cancel.uploadId}));
 return 'v1:'+await sha256(JSON.stringify({commandKey:key,purpose:'portal.upload.cancel.binding.v1',requestDigest}));
}
export class PortalCommands {
    pending:PortalPending|null=null;
    orphan:PortalMarker|null=null;storage?:PortalMarkerStorage;
    restorationError:Error|null=null;
    private missingKey:string|null=null;private stoppableKey:string|null=null;private stoppedKey:string|null=null;private stopEnabled:boolean;private allowLegacyReceipt:boolean;private generation=0;private preparing=false;private sendingKey:string|null=null;
    request:(path:string,method:string,body:unknown,key:string)=>Promise<unknown>;changed:()=>void;
    constructor(request:PortalCommands['request'],changed:()=>void,storage?:PortalMarkerStorage,options:{stopEnabled?:boolean;allowLegacyReceipt?:boolean}={}){this.request=request;this.changed=changed;this.storage=storage;this.stopEnabled=options.stopEnabled===true;this.allowLegacyReceipt=options.allowLegacyReceipt===true;}
    get hasPending(){return !!(this.pending||this.orphan||this.restorationError||this.preparing);}
    get inFlight(){return this.preparing||!!this.sendingKey;}
    get confirmed(){return this.pending?.receipt??this.orphan?.receipt;}
    get draftResourceId(){return this.confirmed&&(this.orphan?.draft||this.pending?.method==='POST'&&(this.pending.path==='/submissions'||this.pending.path==='/profile-drafts'||this.pending.path.endsWith('/fork')))?this.confirmed.resourceId:null;}
    private get current(){return this.pending??this.orphan;}
    private assertCurrent(p:PortalPending|PortalMarker,generation:number){if(this.current!==p||this.generation!==generation)throw new PortalRequestError('已有更新的核对，请重新查看当前状态。',0,'STALE_CHECK',true);}
    get missing(){return !!this.current&&this.current.key===this.missingKey;}
    get canStop(){return this.stopEnabled&&this.missing&&this.current?.key===this.stoppableKey;}
    get stopped(){return !!this.current&&this.current.key===this.stoppedKey;}
    restore(owner:string){if(this.hasPending||!this.storage)return;try{const r=this.storage.read(owner);if(!r)return;this.orphan={owner:r.owner,key:r.key,draft:r.draft,...(r.cancelBinding?{cancelBinding:r.cancelBinding}:{}),...(r.nonCancel?{nonCancel:true}:{})};this.changed();}catch(error){this.restorationError=error instanceof Error?error:new Error('无法读取待确认标记');this.changed();throw this.restorationError;}}
    async submit(owner:string,path:string,body:unknown,method='POST'):Promise<PortalReceipt>{
        if(this.hasPending)throw new Error('上次操作尚未核对，请先核对原请求或刷新已保存的资料。');
        const key=crypto.randomUUID();
        this.preparing=true;this.changed();
        try {
            const serialized=JSON.stringify(body);if(typeof serialized!=='string')throw new Error('请求内容无效');
            const requestMethod=method.toUpperCase();
            const cancel=cancelMarker(path,requestMethod,JSON.parse(serialized));
            if(requestMethod==='POST'&&/^\/uploads\/[^/?#]+\/cancel$/i.test(path)&&!cancel)throw new Error('取消请求内容无效，未发送。');
            const binding=cancel?await cancelBinding(key,cancel):undefined;
            this.storage?.write({owner,key,draft:requestMethod==='POST'&&(path==='/submissions'||path==='/profile-drafts'||path.endsWith('/fork')),...(binding?{cancelBinding:binding}:{nonCancel:true})});
            this.pending={path,method:requestMethod,body:serialized,key,owner,uncertain:false,...(cancel?{cancel}:{}),...(binding?{cancelBinding:binding}:{nonCancel:true})};
        } finally {this.preparing=false;this.changed();}
        return this.replay(owner);
    }
    private async readOriginal(p:PortalPending|PortalMarker):Promise<PortalReceipt>{
        const cancel='cancel' in p?p.cancel:undefined;
        const generation=++this.generation;
        this.missingKey=null;this.stoppableKey=null;this.changed();
        try {
            const raw=await this.request('/commands/'+p.key+(p.cancelBinding?'/cancel':''),'GET',undefined,'');
            this.assertCurrent(p,generation);
            if(!p.cancelBinding){
                if(!p.nonCancel&&!this.allowLegacyReceipt)throw new PortalRequestError('旧请求标记无法确认回执属于原操作，请联系 ONCE。',0,'LEGACY_RECEIPT_UNVERIFIED',true);
                const value=receipt(raw);p.receipt=value;this.stoppedKey=null;this.changed();return value;
            }
            const candidate=raw as Record<string,unknown>|null;
            if(!candidate||candidate.requestBinding!==p.cancelBinding)throw new PortalRequestError('原请求回执无法确认，请联系 ONCE。',0,'RECEIPT_BINDING_MISMATCH',true);
            const {requestBinding:discarded,...result}=candidate;void discarded;
            const value=receipt(result);
            if(value.revision<2)throw new PortalRequestError('原取消回执与上传不匹配，请联系 ONCE。',0,'RECEIPT_INVALID',true);
            const resultBinding=await cancelBinding(p.key,{uploadId:value.resourceId,expectedRevision:value.revision-1});
            this.assertCurrent(p,generation);
            if(resultBinding!==p.cancelBinding)throw new PortalRequestError('原取消回执与上传不匹配，请联系 ONCE。',0,'RECEIPT_INVALID',true);
            if(cancel&&(value.resourceId!==cancel.uploadId||value.revision!==cancel.expectedRevision+1))throw new PortalRequestError('原取消回执与上传不匹配，请联系 ONCE。',0,'RECEIPT_INVALID',true);
            p.receipt=value;this.stoppedKey=null;this.changed();return value;
        } catch(error) {
            this.assertCurrent(p,generation);
            if(error instanceof PortalRequestError&&error.status===404&&error.code==='NOT_FOUND'){
                this.missingKey=p.key;this.changed();
                if(this.stopEnabled){
                    try {
                        const status=await this.request('/commands/'+p.key+'/stop','GET',undefined,'') as {state?:unknown}|null;
                        this.assertCurrent(p,generation);
                        if(!status||status.state!=='STOPPED'||Object.keys(status).length!==1)throw new PortalRequestError('停止状态无法确认，请联系 ONCE。',0,'STOP_STATUS_INVALID',true);
                        this.missingKey=null;this.stoppedKey=p.key;this.changed();throw new PortalStopConfirmed();
                    } catch(stopError){
                        this.assertCurrent(p,generation);
                        if(stopError instanceof PortalStopConfirmed)throw stopError;
                        if(stopError instanceof PortalRequestError&&stopError.status===404&&stopError.code==='STOP_NOT_FOUND'){this.stoppableKey=p.key;this.changed();throw error;}
                        this.missingKey=null;this.changed();throw stopError;
                    }
                }
            }
            throw error;
        }
    }
    async replay(owner:string):Promise<PortalReceipt>{
        if(this.restorationError)throw this.restorationError;
        if(this.orphan){if(this.orphan.owner!==owner)throw new Error('请使用原人才账号核对');if(this.orphan.receipt)return this.orphan.receipt;return this.readOriginal(this.orphan);}
        const p=this.pending;if(!p||p.owner!==owner)throw new Error('请使用原人才账号核对');
        if(this.sendingKey===p.key)throw new PortalRequestError('原请求正在提交，请稍候。',0,'REQUEST_IN_FLIGHT',true);
        // A successful write followed by a failed read only needs a fresh read.
        if(p.receipt)return p.receipt;
        // An uncertain cancel is checked by its original receipt, never blindly resent.
        if(p.uncertain&&p.cancel)return this.readOriginal(p);
        const generation=++this.generation;
        this.sendingKey=p.key;this.changed();
        try {
            const result=await this.request(p.path,p.method,JSON.parse(p.body),p.key);
            this.assertCurrent(p,generation);
            const written=receipt(result);
            if(p.cancel&&(written.resourceId!==p.cancel.uploadId||written.revision!==p.cancel.expectedRevision+1))throw new PortalRequestError('原取消回执与上传不匹配，请联系 ONCE。',0,'RECEIPT_INVALID',true);
            p.receipt=written;this.changed();return written;
        } catch(error) {
            this.assertCurrent(p,generation);
            if(error instanceof PortalRequestError&&!error.unknownOutcome&&!p.uncertain){this.storage?.remove(owner,p.key,p.cancelBinding,p.nonCancel);this.pending=null;}
            else p.uncertain=true;
            this.changed();throw error;
        } finally {if(this.sendingKey===p.key){this.sendingKey=null;this.changed();}}
    }
    async stop(owner:string):Promise<void>{
        const p=this.current;if(this.restorationError||!p||p.owner!==owner)throw new Error('请使用原人才账号核对');
        if(!this.stopEnabled)throw new Error('当前环境不能安全停止原请求，请联系 ONCE。');
        if(this.stopped)return;
        if(!this.canStop)throw new Error('请先核对原请求，再选择是否停止。');
        if(this.storage){const marker=this.storage.read(owner);if(!marker||marker.owner!==owner||marker.key!==p.key||marker.cancelBinding!==p.cancelBinding||marker.nonCancel!==p.nonCancel)throw new Error('请求标记已变化，请重新打开页面核对。');}
        const generation=++this.generation;
        this.missingKey=null;this.stoppableKey=null;this.changed();
        const stopped=receipt(await this.request('/commands/'+p.key+'/stop','POST',{},p.key));
        this.assertCurrent(p,generation);
        if(stopped.resourceId!==owner)throw new PortalRequestError('停止回执无法确认，请联系 ONCE。',0,'STOP_RECEIPT_INVALID',true);
        const status=await this.request('/commands/'+p.key+'/stop','GET',undefined,'') as {state?:unknown}|null;
        this.assertCurrent(p,generation);
        if(!status||status.state!=='STOPPED'||Object.keys(status).length!==1)throw new PortalRequestError('停止状态无法确认，请联系 ONCE。',0,'STOP_STATUS_INVALID',true);
        this.stoppedKey=p.key;this.changed();
    }
    rendered(){const p=this.current;if(p&&!p.receipt&&this.stoppedKey!==p.key)throw new Error('原请求尚未确认，请保留核对标记。');if(p&&this.storage)this.storage.remove(p.owner,p.key,p.cancelBinding,p.nonCancel);++this.generation;this.pending=null;this.orphan=null;this.missingKey=null;this.stoppableKey=null;this.stoppedKey=null;this.changed();}
}
