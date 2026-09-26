import type { Application } from '../../../../packages/core/src/api.ts';
import { AppError } from '../../../../packages/core/src/errors.ts';
import { digest } from '../../../../packages/core/src/json.ts';
import type { SafetyIntentSink } from '../../../../packages/core/src/safety-intent.ts';
import type { LocalMediaProvider } from '../media/local-provider.ts';

export class DeletionFinalizer {
    readonly core: Application;
    readonly provider: LocalMediaProvider | null;
    readonly safetyIntent: SafetyIntentSink | null;
    constructor(core: Application, provider: LocalMediaProvider | null, safetyIntent: SafetyIntentSink | null = null) {
        this.core = core; this.provider = provider; this.safetyIntent = safetyIntent;
    }

    async cycle(signal: AbortSignal): Promise<boolean> {
        const claim = await this.core.deletionFinalization.claim();
        if (!claim) return false;
        const intent = this.safetyIntent ? {
            intentId: 'intent:' + digest({ workspaceId: claim.workspaceId,
                operation: 'worker.deletion.finalize', resourceId: claim.id }),
            workspaceId: claim.workspaceId, operation: 'worker.deletion.finalize',
            requestId: claim.id, resourceId: claim.id
        } : null;
        try {
            if (intent) await this.safetyIntent!.writeAhead(intent);
            const tasks = await this.core.deletionFinalization.mediaTasks(claim);
            if (tasks.length && !this.provider) {
                await this.core.deletionFinalization.fail(claim, 'MEDIA_PROVIDER_UNAVAILABLE');
                if (intent) await this.safetyIntent!.committed(intent, claim.id).catch(() => {});
                return true;
            }
            for (const task of tasks) {
                if (signal.aborted) return true;
                await this.provider!.purge(task.mediaId);
                await this.core.deletionFinalization.completeMediaPurge(claim, task.mediaId);
            }
            if (!signal.aborted) {
                await this.core.deletionFinalization.finish(claim);
                if (intent) await this.safetyIntent!.committed(intent, claim.id).catch(() => {});
            }
        }
        catch (error) {
            if (signal.aborted) return true;
            const failed = await this.core.deletionFinalization.fail(claim,
                error instanceof AppError ? error.code : 'FINALIZATION_IO_FAILED')
                .then(() => true).catch(() => false);
            if (intent) {
                if (failed) await this.safetyIntent!.committed(intent, claim.id).catch(() => {});
                else await this.safetyIntent!.aborted(intent).catch(() => {});
            }
        }
        return true;
    }
}
