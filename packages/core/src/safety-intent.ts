export interface SafetyIntent {
    intentId: string;
    workspaceId: string;
    operation: string;
    requestId: string;
    resourceId: string;
}
export interface SafetyIntentSink {
    writeAhead(intent: SafetyIntent): Promise<void>;
}

/**
 * Recovery zero-delta approval is conservative by design: every authenticated mutation must
 * be represented outside the database before the mutation starts. This avoids a brittle
 * operation allowlist and automatically protects future COMMAND/SECRET routes.
 */
export function requiresSafetyIntent(mode: string): boolean {
    return mode === 'COMMAND' || mode === 'SECRET';
}
