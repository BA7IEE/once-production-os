import { randomUUID } from 'node:crypto';
import type { Actor, Clock, CommandReceipt, ReceiptResult, RequestMeta } from './model.ts';
import type { Tx } from './store.ts';
import { digest } from './json.ts';
import { audit, base } from './helpers.ts';
import { invariant } from './errors.ts';
export class Commands {
    clock: Clock;
    constructor(clock: Clock) { this.clock = clock; }
    async execute(tx: Tx, actor: Actor, operation: string, commandKey: string, targetId: string | null, input: unknown, kind: CommandReceipt['resourceKind'], meta: RequestMeta, apply: () => Promise<{
        id: string;
        revision: number;
    }>, authorizeReplay: (receipt: CommandReceipt) => Promise<void>, successState: ReceiptResult['state'] = 'SUCCEEDED'): Promise<ReceiptResult> {
        invariant(/^[A-Za-z0-9_-]{8,128}$/.test(commandKey), 'IDEMPOTENCY_REQUIRED', '写入需要 8–128 位 Idempotency-Key', 400);
        const requestDigest = digest({ operation, targetId, input });
        const previous = (await tx.find('receipts', { workspaceId: actor.workspaceId, actorId: actor.membershipId, operation, commandKey }))[0];
        if (previous) {
            invariant(previous.requestDigest === requestDigest, 'IDEMPOTENCY_KEY_CONFLICT', '同一请求键不能提交不同内容，请检查后创建新操作', 409);
            await authorizeReplay(previous);
            return { ...previous.result, replayed: true };
        }
        // CAS belongs inside apply, after receipt lookup. The Store supplies the database lock.
        const row = await apply();
        const result: ReceiptResult = { operationId: randomUUID(), resourceId: row.id, revision: row.revision, state: successState };
        await audit(tx, actor, actor.workspaceId, operation, kind, row.id, typeof input === 'object' && input !== null ? Object.keys(input).filter(k => k !== 'expectedRevision') : [], meta, this.clock);
        await tx.insert('receipts', { ...base(actor.workspaceId, this.clock), actorId: actor.membershipId, operation, commandKey, requestDigest,
            resourceKind: kind, resourceId: row.id, result });
        return { ...result, replayed: false };
    }
}
