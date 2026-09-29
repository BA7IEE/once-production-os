/** Only a boolean survives reload. Never persist requests, identities or credentials. */
export function readPendingMarker(): boolean {
    try { return sessionStorage.getItem('once-pending-command') === '1'; } catch { return false; }
}
export function writePendingMarker(pending: boolean): void {
    try {
        if (pending) sessionStorage.setItem('once-pending-command', '1');
        else sessionStorage.removeItem('once-pending-command');
    } catch { /* beforeunload still warns when storage is unavailable */ }
}
