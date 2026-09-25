import type { Application } from '../../../../packages/core/src/api.ts';
import { AppError } from '../../../../packages/core/src/errors.ts';
import type { LocalMediaProvider } from '../media/local-provider.ts';

export class DeletionFinalizer {
    readonly core: Application;
    readonly provider: LocalMediaProvider | null;
    constructor(core: Application, provider: LocalMediaProvider | null) { this.core = core; this.provider = provider; }

    async cycle(signal: AbortSignal): Promise<boolean> {
        const claim = await this.core.deletionFinalization.claim();
        if (!claim) return false;
        try {
            const tasks = await this.core.deletionFinalization.mediaTasks(claim);
            if (tasks.length && !this.provider) {
                await this.core.deletionFinalization.fail(claim, 'MEDIA_PROVIDER_UNAVAILABLE');
                return true;
            }
            for (const task of tasks) {
                if (signal.aborted) return true;
                await this.provider!.purge(task.mediaId);
                await this.core.deletionFinalization.completeMediaPurge(claim, task.mediaId);
            }
            if (!signal.aborted)
                await this.core.deletionFinalization.finish(claim);
        }
        catch (error) {
            if (signal.aborted) return true;
            await this.core.deletionFinalization.fail(claim,
                error instanceof AppError ? error.code : 'FINALIZATION_IO_FAILED').catch(() => {});
        }
        return true;
    }
}
