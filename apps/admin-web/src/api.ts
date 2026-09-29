import {readPendingMarker,writePendingMarker} from './pending-marker.ts';
import { ENDPOINTS, type Inputs } from './generated/requests.ts';
import type { Me } from './dto.ts';
export class ApiError extends Error {
    code: string;
    status: number;
    requestId: string;
    unknownOutcome: boolean;
    constructor(message: string, code: string, status = 0, requestId = '', unknownOutcome = false) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; this.requestId = requestId; this.unknownOutcome = unknownOutcome; }
}
let csrf = '';
let identity: string | null = null;
let lostPending = readPendingMarker();
const unresolved = new Map<string, {
    key: string; body: string; owner: string; uncertain: boolean;
    operation: keyof Inputs; params: Record<string,string>; query: Record<string,string>;
}>();
let blockedSecret = false;
function notifyPending() {
    writePendingMarker(unresolved.size > 0 || lostPending);
    window.dispatchEvent(new Event('once-pending-changed'));
}
export function suspendTransport() { csrf = ''; identity = null; }
/** Test/reset boundary only. Session loss must use suspendTransport. */
export function resetTransport() { suspendTransport(); unresolved.clear(); blockedSecret = false; lostPending = false; notifyPending(); }
export function unresolvedCommands() { return [...unresolved.values()].map(x => x.key); }
export function pendingCommands() { return [...unresolved.values()].filter(x=>x.owner===identity&&x.uncertain).map(x=>({key:x.key,operation:x.operation})); }
export function needsPendingInspection() { return lostPending; }
export function acknowledgePendingInspection() { lostPending=false; notifyPending(); }
export async function replayPending(key:string) {
    const row=[...unresolved.values()].find(x=>x.key===key&&x.owner===identity);
    if(!row) throw new ApiError('请使用原账号登录后核对提交。','PENDING_IDENTITY_REQUIRED');
    return call(row.operation,JSON.parse(row.body),row.params,row.query);
}
export function setCsrf(value: string) { csrf = value; }
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{
    if(unresolved.size || blockedSecret){event.preventDefault();(event as BeforeUnloadEvent).returnValue='';}
});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validReceipt(value:unknown,operation:keyof Inputs):boolean {
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const r=value as Record<string,unknown>;
    const state=['ai.create','import.commit','job.resume','upload.complete','export.create'].includes(operation)?'ACCEPTED':'SUCCEEDED';
    return typeof r.operationId==='string'&&uuid.test(r.operationId)&&typeof r.resourceId==='string'&&uuid.test(r.resourceId)
      &&typeof r.revision==='number'&&Number.isSafeInteger(r.revision)&&r.revision>=1&&r.state===state
      &&(r.replayed===undefined||typeof r.replayed==='boolean');
}
/** Unknown outcomes retain the exact command key in memory. No automatic retries and no secrets
 * or business records in localStorage. Non-idempotent activation issuance requires explicit
 * inspection/reset after an uncertain response instead of silently issuing another secret. */
export async function call<K extends keyof Inputs, T = unknown>(operation: K, input: Inputs[K], params: Record<string, string> = {}, query: Record<string, string> = {}): Promise<T> {
    const route = ENDPOINTS[operation];
    let path: string = route.path;
    for (const [k, v] of Object.entries(params))
        path = path.replace('{' + k + '}', encodeURIComponent(v));
    if (path.includes('{'))
        throw new Error('Missing route parameter');
    const qs = new URLSearchParams(query).toString();
    const body = input === undefined ? undefined : JSON.stringify(input);
    const signature = identity + ':' + operation + ':' + path + '?' + qs;
    const previous = unresolved.get(signature);
    const uncertain = () => { const row=unresolved.get(signature); if(row)row.uncertain=true; notifyPending(); };
    let key: string | undefined;
    if (route.mode === 'COMMAND') {
        if(!identity)throw new ApiError('请先重新登录并确认当前身份。','SESSION_REQUIRED',401);
        if(lostPending)throw new ApiError('页面关闭前有未决提交，请先核对已有记录后解除提示。','PENDING_INSPECTION_REQUIRED');
        if (previous && previous.body !== body)
            throw new ApiError('上次提交结果尚不明确。请先原样重试或核对记录，不能直接改成另一份提交。', 'UNRESOLVED_COMMAND',0,previous.key,true);
        key = previous?.key ?? crypto.randomUUID();
    }
    if (route.mode === 'SECRET' && blockedSecret)
        throw new ApiError('上一份凭证签发结果不明确。请先刷新成员列表，核对账号状态后执行明确的重置。', 'SECRET_OUTCOME_UNKNOWN');
    const headers: Record<string, string> = {};
    if (body !== undefined)
        headers['Content-Type'] = 'application/json';
    if (route.method !== 'GET')
        headers['X-CSRF-Token'] = csrf;
    if (key) {
        headers['Idempotency-Key'] = key;
        headers['X-ONCE-Membership'] = identity!;
    }
    if (key)
        unresolved.set(signature, { key, body: body ?? '{}', owner:identity!, uncertain:previous?.uncertain??false, operation, params:{...params}, query:{...query} });
    if(key)notifyPending();
    let response: Response;
    try {
        response = await fetch('/api/v1' + path + (qs ? '?' + qs : ''), { method: route.method, body, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    }
    catch {
        if(key)uncertain();
        if (route.mode === 'SECRET')
            blockedSecret = true;
        throw new ApiError(key ? '网络中断，提交结果未知。保留当前表单，原样再次提交会复用同一个请求编号。' : '网络中断，请核对服务状态后重试。', 'NETWORK_ERROR', 0, key ?? '', route.method !== 'GET');
    }
    let decoded: unknown;
    try {
        decoded = await response.json();
    }
    catch {
        if(key)uncertain();
        if (route.mode === 'SECRET')
            blockedSecret = true;
        throw new ApiError('服务响应无法解析；写入结果可能不明确。', 'RESPONSE_INVALID', response.status, key ?? '', route.method !== 'GET');
    }
    if (!response.ok) {
        const e = (decoded as {
            error?: {
                message?: string;
                code?: string;
                requestId?: string;
            };
        } | null)?.error;
        // HTTP 5xx may occur after a remote commit. Retain idempotency key for exact replay.
        if (key && response.status < 500 && !previous?.uncertain)
            unresolved.delete(signature);
        if(key && (previous?.uncertain || response.status>=500))uncertain();
        notifyPending();
        if (route.mode === 'SECRET' && response.status >= 500)
            blockedSecret = true;
        if (response.status === 401) {
            suspendTransport(); window.dispatchEvent(new Event('once-session-expired'));
        }
        throw new ApiError(e?.message ?? '请求未完成', e?.code ?? 'HTTP_ERROR', response.status, e?.requestId ?? '', (!!previous?.uncertain || response.status >= 500) && route.method !== 'GET');
    }
    if(key && !validReceipt(decoded,operation)){
        uncertain(); throw new ApiError('服务未返回有效写入回执，请保留原请求核对。','RECEIPT_INVALID',response.status,key,true);
    }
    if (key){ unresolved.delete(signature); notifyPending(); }
    if (operation === 'auth.csrf' || operation === 'auth.login')
        csrf = (decoded as {
            csrfToken: string;
        }).csrfToken;
    if (operation === 'identity.me') {
        const me=decoded as Me;
        if(!me||typeof me.membershipId!=='string'||!uuid.test(me.membershipId)||typeof me.csrfToken!=='string')throw new ApiError('身份响应无效','RESPONSE_INVALID');
        identity=me.membershipId; csrf=me.csrfToken; notifyPending();
    }
    if (operation === 'auth.logout' || operation === 'auth.changePassword')
        suspendTransport();
    return decoded as T;
}
export function acknowledgeSecretInspection() { blockedSecret = false; }
export function read<T>(op: keyof Inputs, params: Record<string, string> = {}, query: Record<string, string> = {}): Promise<T> { return call(op, undefined as Inputs[typeof op], params, query); }
