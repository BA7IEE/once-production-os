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
const unresolved = new Map<string, {
    key: string;
    body: string;
}>();
let blockedSecret = false;
export function resetTransport() { csrf = ''; unresolved.clear(); blockedSecret = false; }
export function unresolvedCommands() { return [...unresolved.values()].map(x => x.key); }
export function setCsrf(value: string) { csrf = value; }
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
    const signature = operation + ':' + path;
    let key: string | undefined;
    if (route.mode === 'COMMAND') {
        const previous = unresolved.get(signature);
        if (previous && previous.body !== body)
            throw new ApiError('上次提交结果尚不明确。请先原样重试或核对记录，不能直接改成另一份提交。', 'UNRESOLVED_COMMAND');
        key = previous?.key ?? crypto.randomUUID();
    }
    if (route.mode === 'SECRET' && blockedSecret)
        throw new ApiError('上一份凭证签发结果不明确。请先刷新成员列表，核对账号状态后执行明确的重置。', 'SECRET_OUTCOME_UNKNOWN');
    const headers: Record<string, string> = {};
    if (body !== undefined)
        headers['Content-Type'] = 'application/json';
    if (route.method !== 'GET')
        headers['X-CSRF-Token'] = csrf;
    if (key)
        headers['Idempotency-Key'] = key;
    if (key)
        unresolved.set(signature, { key, body: body ?? '{}' });
    let response: Response;
    try {
        response = await fetch('/api/v1' + path + (qs ? '?' + qs : ''), { method: route.method, body, headers, credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    }
    catch {
        if (route.mode === 'SECRET')
            blockedSecret = true;
        throw new ApiError(key ? '网络中断，提交结果未知。保留当前表单，原样再次提交会复用同一个请求编号。' : '网络中断，请核对服务状态后重试。', 'NETWORK_ERROR', 0, key ?? '', route.method !== 'GET');
    }
    let decoded: unknown;
    try {
        decoded = await response.json();
    }
    catch {
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
        }).error;
        // HTTP 5xx may occur after a remote commit. Retain idempotency key for exact replay.
        if (key && response.status < 500)
            unresolved.delete(signature);
        if (route.mode === 'SECRET' && response.status >= 500)
            blockedSecret = true;
        if (response.status === 401)
            window.dispatchEvent(new Event('once-session-expired'));
        throw new ApiError(e?.message ?? '请求未完成', e?.code ?? 'HTTP_ERROR', response.status, e?.requestId ?? '', response.status >= 500 && route.method !== 'GET');
    }
    if (key)
        unresolved.delete(signature);
    if (operation === 'auth.csrf' || operation === 'auth.login')
        csrf = (decoded as {
            csrfToken: string;
        }).csrfToken;
    if (operation === 'identity.me')
        csrf = (decoded as Me).csrfToken;
    if (operation === 'auth.logout' || operation === 'auth.changePassword')
        resetTransport();
    return decoded as T;
}
export function acknowledgeSecretInspection() { blockedSecret = false; }
export function read<T>(op: keyof Inputs, params: Record<string, string> = {}, query: Record<string, string> = {}): Promise<T> { return call(op, undefined as Inputs[typeof op], params, query); }
