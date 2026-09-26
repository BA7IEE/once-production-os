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

const SAFETY_OPERATIONS = new Set([
    'auth.changePassword',
    'member.resetAccess','member.disable','member.permissions',
    'scope.create','record.scope',
    'source.create','source.update','source.review','source.suspend',
    'handoff.create','handoff.accept','handoff.decline','handoff.revoke',
    'usePermission.create','usePermission.revoke',
    'deletion.create','deletion.block','deletion.decision','deletion.planFreeze','deletion.cleanupStart',
    'person.merge',
    'contact.replace','evidence.confirm',
    'asset.quarantine','upload.cancel'
]);

export function requiresSafetyIntent(operation: string): boolean {
    return SAFETY_OPERATIONS.has(operation);
}
