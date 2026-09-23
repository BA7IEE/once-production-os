export class AppError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code;
    }
}
export function fail(status: number, code: string, message: string): never {
    throw new AppError(status, code, message);
}
export function invariant(ok: unknown, code: string, message: string, status = 422): asserts ok {
    if (!ok)
        fail(status, code, message);
}
export function missing(): never { return fail(404, 'NOT_FOUND', '记录不存在或你没有访问权限'); }
