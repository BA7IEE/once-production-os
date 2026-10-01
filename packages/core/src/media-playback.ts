import {invariant} from './errors.ts';
export const MEDIA_PLAYBACK_DEFAULTS = Object.freeze({actorStreams: 2, workspaceStreams: 10, maxSeconds: 900, requestsPerMinute: 120, bytesPerMinute: 600000000});
export type MediaPlaybackLimits = {-readonly [K in keyof typeof MEDIA_PLAYBACK_DEFAULTS]: number};
export interface PlaybackRange {status: 200 | 206 | 416; start: number; endInclusive: number}
/** Unknown units / multiple ranges are ignored as permitted by HTTP. Malformed single ranges are unsatisfiable. */
export function playbackRange(header: string | undefined, size: number): PlaybackRange {
    invariant(Number.isSafeInteger(size) && size > 0, 'MEDIA_FILE_INVALID', '媒体长度无效', 503);
    const full: PlaybackRange = {status: 200, start: 0, endInclusive: size - 1};
    if (!header || !header.startsWith('bytes=') || header.includes(',')) return full;
    const invalid: PlaybackRange = {status: 416, start: 0, endInclusive: size - 1};
    if (header.length > 160) return invalid;
    const match = /^bytes=(\d*)-(\d*)$/.exec(header);
    if (!match || (!match[1] && !match[2])) return invalid;
    const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
    if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return invalid;
    if (first === null) return last && last > 0 ? {status: 206, start: Math.max(0, size - last), endInclusive: size - 1} : invalid;
    if (first >= size || (last !== null && last < first)) return invalid;
    return {status: 206, start: first, endInclusive: Math.min(last ?? size - 1, size - 1)};
}
