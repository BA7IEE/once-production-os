export interface SafetyIntent {
    intentId: string;
    workspaceId: string;
    operation: string;
    requestId: string;
    resourceId: string;
}
export interface SafetyIntentSink {
    writeAhead(intent: SafetyIntent): Promise<void>;
    committed(intent: SafetyIntent, resourceId: string): Promise<void>;
    /** Only valid before any database transaction or external side effect is attempted.
     * A rejected transaction promise is NOT proof of rollback. */
    aborted(intent: SafetyIntent, proof: 'NOT_STARTED'): Promise<void>;
}

/**
 * Recovery delta accounting is conservative by design: every authenticated mutation must
 * be represented outside the database before the mutation starts. This avoids a brittle
 * operation allowlist and automatically protects future COMMAND/SECRET routes.
 */
export function requiresSafetyIntent(mode: string): boolean {
    return mode === 'COMMAND' || mode === 'SECRET';
}
