import {MEDIA_PLAYBACK_DEFAULTS, type MediaPlaybackLimits} from '../../../../packages/core/src/media-playback.ts';
import {invariant} from '../../../../packages/core/src/errors.ts';
export function loadPlaybackLimits(env: NodeJS.ProcessEnv): MediaPlaybackLimits {
    const values: MediaPlaybackLimits = {...MEDIA_PLAYBACK_DEFAULTS};
    const names = {actorStreams: 'MEDIA_PLAY_ACTOR_STREAMS', workspaceStreams: 'MEDIA_PLAY_WORKSPACE_STREAMS', maxSeconds: 'MEDIA_PLAY_MAX_SECONDS', requestsPerMinute: 'MEDIA_PLAY_REQUESTS_PER_MINUTE', bytesPerMinute: 'MEDIA_PLAY_BYTES_PER_MINUTE'} as const;
    for (const k of Object.keys(names) as Array<keyof typeof names>) {
        const raw = env[names[k]];
        if (raw === undefined) continue;
        const n = Number(raw);
        invariant(/^\d+$/.test(raw) && Number.isSafeInteger(n) && n >= 1 && n <= MEDIA_PLAYBACK_DEFAULTS[k], 'MEDIA_PLAY_CONFIG_INVALID', names[k] + '必须为有效的收紧限额', 503);
        values[k] = n;
    }
    return values;
}
/** Current deployment has one API process. Counters hold only authenticated IDs; never tokens or media DTOs. */
export class PlaybackBudget {
    private active = new Map<string, number>();
    private windows = new Map<string, {until: number; requests: number; bytes: number}>();
    readonly limits: MediaPlaybackLimits;
    constructor(limits: MediaPlaybackLimits) { this.limits = limits; }
    enter(workspace: string, actor: string, bytes: number, now = Date.now()): () => void {
        for (const [key, value] of this.windows) if (value.until <= now) this.windows.delete(key);
        const wk = 'w:' + workspace, ak = wk + ':a:' + actor;
        invariant((this.active.get(wk) ?? 0) < this.limits.workspaceStreams && (this.active.get(ak) ?? 0) < this.limits.actorStreams, 'MEDIA_PLAY_BUSY', '同时播放数已达上限，请关闭其他视频后重试', 429);
        const bucket = this.windows.get(ak) ?? {until: now + 60000, requests: 0, bytes: 0};
        invariant(bucket.requests < this.limits.requestsPerMinute && bucket.bytes + bytes <= this.limits.bytesPerMinute, 'MEDIA_PLAY_RATE_LIMITED', '播放请求过于频繁，请稍后重试', 429);
        this.windows.set(ak, {...bucket, requests: bucket.requests + 1, bytes: bucket.bytes + bytes});
        for (const key of [wk, ak]) this.active.set(key, (this.active.get(key) ?? 0) + 1);
        let done = false;
        return () => { if (done) return; done = true; for (const key of [wk, ak]) { const count = this.active.get(key)! - 1; if (count) this.active.set(key, count); else this.active.delete(key); } };
    }
}
