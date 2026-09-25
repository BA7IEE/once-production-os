// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.
export interface Inputs {
  "work.list": undefined;
  "work.create": { "title": string; "sourceId"?: string; "inlineSource"?: { "title": string; "type": "MANUAL" | "TEXT"; "providerClaim": string; "textPayload"?: string; "basisMode": "TEMP_ORGANIZE" | "INTERNAL_USE"; "basisDescription": string; "validUntil"?: string; "scopeId"?: string }; "description"?: string; "industryCode"?: string | null; "workTypeCodes"?: Array<string>; "origin"?: "ONCE" | "EXTERNAL" | "UNKNOWN"; "originNote"?: string };
  "work.get": undefined;
  "work.update": { "expectedRevision": number; "title"?: string; "description"?: string; "industryCode"?: string | null; "workTypeCodes"?: Array<string>; "origin"?: "ONCE" | "EXTERNAL" | "UNKNOWN"; "originNote"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  "work.assetAdd": { "expectedRevision": number; "assetId": string };
  "work.assetRemove": { "expectedRevision": number; "entryId": string };
  "work.reorder": { "expectedRevision": number; "entryIds": Array<string>; "coverEntryId": string | null };
  "work.creditAdd": { "expectedRevision": number; "personId": string; "roleCode": string; "note": string };
  "work.creditRemove": { "expectedRevision": number; "entryId": string };
  "project.list": undefined;
  "project.create": { "title": string; "sourceId"?: string; "inlineSource"?: { "title": string; "type": "MANUAL" | "TEXT"; "providerClaim": string; "textPayload"?: string; "basisMode": "TEMP_ORGANIZE" | "INTERNAL_USE"; "basisDescription": string; "validUntil"?: string; "scopeId"?: string }; "brief"?: string; "locationNote"?: string; "dateNote"?: string };
  "project.get": undefined;
  "project.update": { "expectedRevision": number; "title"?: string; "brief"?: string; "locationNote"?: string; "dateNote"?: string; "reviewNote"?: string; "status"?: "DRAFT" | "ACTIVE" | "COMPLETED" | "ARCHIVED" };
  "project.participantAdd": { "expectedRevision": number; "personId": string; "roleCode": string; "state": "NOMINATED" | "CONFIRMED" | "ACTUAL"; "note": string };
  "project.participantUpdate": { "expectedRevision": number; "entryId": string; "state": "NOMINATED" | "CONFIRMED" | "ACTUAL"; "note": string };
  "project.participantRemove": { "expectedRevision": number; "entryId": string };
  "project.workLink": { "expectedRevision": number; "workId": string; "relation": "REFERENCE" | "DELIVERABLE" };
  "project.workRemove": { "expectedRevision": number; "entryId": string };
  "person.production": undefined;
  "upload.create": { "sourceId": string; "expectedSourceRevision": number; "personId"?: string; "fileName": string; "mime": "image/jpeg" | "image/png" | "image/webp"; "expectedBytes": number; "sha256": string };
  "upload.list": undefined;
  "upload.get": undefined;
  "upload.content": undefined;
  "upload.renew": { "expectedRevision": number };
  "upload.complete": { "expectedRevision": number };
  "upload.cancel": { "expectedRevision": number };
  "asset.list": undefined;
  "asset.get": undefined;
  "asset.preview": undefined;
  "asset.quarantine": { "expectedRevision": number };
  "auth.csrf": undefined;
  "auth.login": { "loginName": string; "password": string };
  "auth.activate": { "token": string; "password": string };
  "auth.logout": {  };
  "auth.changePassword": { "oldPassword": string; "newPassword": string };
  "identity.me": undefined;
  "dashboard.get": undefined;
  "catalog.list": undefined;
  "catalog.create": { "namespace": "role" | "city" | "language" | "skill" | "industry" | "workType"; "code": string; "labelZh": string; "labelEn": string };
  "catalog.update": { "expectedRevision": number; "labelZh"?: string; "labelEn"?: string; "status"?: "ACTIVE" | "INACTIVE" };
  "member.list": undefined;
  "member.create": { "loginName": string; "displayName": string; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete"> };
  "member.disable": { "expectedRevision": number };
  "member.permissions": { "expectedRevision": number; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete"> };
  "member.resetAccess": { "expectedRevision": number };
  "scope.list": undefined;
  "scope.create": { "name": string; "membershipIds": Array<string> };
  "record.scope": { "expectedRevision": number; "scopeId": string };
  "source.list": undefined;
  "source.create": { "title": string; "type": "MANUAL" | "TEXT"; "providerClaim": string; "textPayload"?: string; "basisMode": "TEMP_ORGANIZE" | "INTERNAL_USE"; "basisDescription": string; "validUntil"?: string; "scopeId"?: string };
  "source.history": undefined;
  "source.get": undefined;
  "source.update": { "expectedRevision": number; "title"?: string; "textPayload"?: string; "providerClaim"?: string };
  "source.review": { "expectedRevision": number; "basisDescription": string; "validUntil": string };
  "source.suspend": { "expectedRevision": number; "reason": string };
  "handoff.recipients": undefined;
  "handoff.create": { "expectedRevision": number; "expectedSourceRevision": number; "recipientId": string; "purpose": "EDIT" | "REVIEW"; "expiresAt": string; "acknowledgeLimitedAccess": boolean };
  "handoff.list": undefined;
  "handoff.get": undefined;
  "handoff.accept": { "expectedRevision": number };
  "handoff.decline": { "expectedRevision": number };
  "handoff.revoke": { "expectedRevision": number };
  "person.list": undefined;
  "person.create": { "displayName": string; "roles": Array<string>; "sourceId"?: string; "inlineSource"?: { "title": string; "type": "MANUAL" | "TEXT"; "providerClaim": string; "textPayload"?: string; "basisMode": "TEMP_ORGANIZE" | "INTERNAL_USE"; "basisDescription": string; "validUntil"?: string; "scopeId"?: string }; "aliases"?: Array<string>; "cityCode"?: string | null; "languageCodes"?: Array<string>; "skillCodes"?: Array<string>; "heightCm"?: number | null; "intro"?: string };
  "person.get": undefined;
  "person.update": { "expectedRevision": number; "displayName"?: string; "roles"?: Array<string>; "aliases"?: Array<string>; "cityCode"?: string | null; "languageCodes"?: Array<string>; "skillCodes"?: Array<string>; "heightCm"?: number | null; "intro"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  "contact.get": undefined;
  "contact.replace": { "expectedRevision": number; "contacts": Array<{ "kind": "PHONE" | "WECHAT" | "EMAIL" | "OTHER"; "value": string; "sourceId": string }> };
  "evidence.confirm": { "personId": string; "expectedRevision": number; "fieldPath": "displayName" | "aliases" | "roles" | "cityCode" | "languageCodes" | "skillCodes" | "heightCm" | "intro"; "sourceId": string; "sourceRevision": number };
  "import.preview": { "sourceId": string; "rows": Array<unknown> };
  "import.get": undefined;
  "import.commit": { "expectedRevision": number; "selectedRows": Array<number> };
  "job.list": undefined;
  "job.resume": { "expectedRevision": number };
  "job.get": undefined;
  "audit.list": undefined;
  "deletion.preview": { "targetKind": "SOURCE" | "PERSON" | "WORK" | "PROJECT" | "ASSET"; "targetId": string; "expectedRevision": number };
  "deletion.list": undefined;
  "deletion.create": { "targetKind": "SOURCE" | "PERSON" | "WORK" | "PROJECT" | "ASSET"; "targetId": string; "expectedRevision": number; "previewDigest": string; "reason": string };
  "deletion.get": undefined;
  "deletion.block": { "expectedRevision": number; "previewDigest": string; "acknowledgeBlock": boolean };
  "deletion.items": undefined;
  "deletion.decision": { "expectedRevision": number; "entryId": string; "decision": "APPLY_PROPOSED" | "RETAIN_WITH_BASIS"; "decisionReason": string; "retentionSourceId"?: string | null };
  "deletion.planFreeze": { "expectedRevision": number; "acknowledgePlan": boolean };
  "deletion.cleanupStart": { "expectedRevision": number; "planDigest": string; "acknowledgeIrreversible": boolean };
  "usePermission.list": undefined;
  "usePermission.create": { "sourceId": string; "subjectKind": "SOURCE" | "PERSON" | "WORK" | "PROJECT" | "ASSET"; "subjectId": string; "fields": Array<"person.displayName" | "person.aliases" | "person.roles" | "person.cityCode" | "person.languageCodes" | "person.skillCodes" | "person.heightCm" | "person.intro" | "person.status" | "work.title" | "work.description" | "work.industryCode" | "work.workTypeCodes" | "work.origin" | "work.originNote" | "work.status" | "work.relations" | "project.title" | "project.brief" | "project.locationNote" | "project.dateNote" | "project.reviewNote" | "project.status" | "project.relations" | "source.title" | "source.type" | "source.providerClaim" | "source.basisMode" | "source.basisDescription" | "source.validFrom" | "source.validUntil" | "source.status" | "media.identity">; "validUntil": string; "evidenceNote": string };
  "usePermission.revoke": { "expectedRevision": number };
  "export.list": undefined;
  "export.create": { "format": "JSON"; "selectedIds": { "people": Array<string>; "works": Array<string>; "projects": Array<string> }; "fields": Array<"person.displayName" | "person.aliases" | "person.roles" | "person.cityCode" | "person.languageCodes" | "person.skillCodes" | "person.heightCm" | "person.intro" | "person.status" | "work.title" | "work.description" | "work.industryCode" | "work.workTypeCodes" | "work.origin" | "work.originNote" | "work.status" | "work.relations" | "project.title" | "project.brief" | "project.locationNote" | "project.dateNote" | "project.reviewNote" | "project.status" | "project.relations" | "source.title" | "source.type" | "source.providerClaim" | "source.basisMode" | "source.basisDescription" | "source.validFrom" | "source.validUntil" | "source.status" | "media.identity">; "usePermissionRefs": Array<string> };
  "export.get": undefined;
  "export.download": {  };
  "talent.search": undefined;
  "shortlist.list": undefined;
  "shortlist.create": { "title": string; "brief"?: string; "scopeId": string };
  "shortlist.get": undefined;
  "shortlist.update": { "expectedRevision": number; "title"?: string; "brief"?: string };
  "shortlist.itemAdd": { "expectedRevision": number; "personId": string; "workId"?: string; "workAssetIds": Array<string>; "note": string };
  "shortlist.itemUpdate": { "expectedRevision": number; "entryId": string; "note": string };
  "shortlist.itemRemove": { "expectedRevision": number; "entryId": string };
  "shortlist.reorder": { "expectedRevision": number; "entryIds": Array<string> };
}
export const ENDPOINTS = {
  "work.list": {
    "method": "GET",
    "path": "/works",
    "mode": "READ"
  },
  "work.create": {
    "method": "POST",
    "path": "/works",
    "mode": "COMMAND"
  },
  "work.get": {
    "method": "GET",
    "path": "/works/{id}",
    "mode": "READ"
  },
  "work.update": {
    "method": "PATCH",
    "path": "/works/{id}",
    "mode": "COMMAND"
  },
  "work.assetAdd": {
    "method": "POST",
    "path": "/works/{id}/assets",
    "mode": "COMMAND"
  },
  "work.assetRemove": {
    "method": "POST",
    "path": "/works/{id}/assets/remove",
    "mode": "COMMAND"
  },
  "work.reorder": {
    "method": "POST",
    "path": "/works/{id}/assets/reorder",
    "mode": "COMMAND"
  },
  "work.creditAdd": {
    "method": "POST",
    "path": "/works/{id}/credits",
    "mode": "COMMAND"
  },
  "work.creditRemove": {
    "method": "POST",
    "path": "/works/{id}/credits/remove",
    "mode": "COMMAND"
  },
  "project.list": {
    "method": "GET",
    "path": "/projects",
    "mode": "READ"
  },
  "project.create": {
    "method": "POST",
    "path": "/projects",
    "mode": "COMMAND"
  },
  "project.get": {
    "method": "GET",
    "path": "/projects/{id}",
    "mode": "READ"
  },
  "project.update": {
    "method": "PATCH",
    "path": "/projects/{id}",
    "mode": "COMMAND"
  },
  "project.participantAdd": {
    "method": "POST",
    "path": "/projects/{id}/participants",
    "mode": "COMMAND"
  },
  "project.participantUpdate": {
    "method": "POST",
    "path": "/projects/{id}/participants/update",
    "mode": "COMMAND"
  },
  "project.participantRemove": {
    "method": "POST",
    "path": "/projects/{id}/participants/remove",
    "mode": "COMMAND"
  },
  "project.workLink": {
    "method": "POST",
    "path": "/projects/{id}/works",
    "mode": "COMMAND"
  },
  "project.workRemove": {
    "method": "POST",
    "path": "/projects/{id}/works/remove",
    "mode": "COMMAND"
  },
  "person.production": {
    "method": "GET",
    "path": "/people/{id}/production",
    "mode": "READ"
  },
  "upload.create": {
    "method": "POST",
    "path": "/uploads",
    "mode": "COMMAND"
  },
  "upload.list": {
    "method": "GET",
    "path": "/uploads",
    "mode": "READ"
  },
  "upload.get": {
    "method": "GET",
    "path": "/uploads/{id}",
    "mode": "READ"
  },
  "upload.content": {
    "method": "PUT",
    "path": "/uploads/{id}/content",
    "mode": "BINARY"
  },
  "upload.renew": {
    "method": "POST",
    "path": "/uploads/{id}/renew",
    "mode": "COMMAND"
  },
  "upload.complete": {
    "method": "POST",
    "path": "/uploads/{id}/complete",
    "mode": "COMMAND"
  },
  "upload.cancel": {
    "method": "POST",
    "path": "/uploads/{id}/cancel",
    "mode": "COMMAND"
  },
  "asset.list": {
    "method": "GET",
    "path": "/assets",
    "mode": "READ"
  },
  "asset.get": {
    "method": "GET",
    "path": "/assets/{id}",
    "mode": "READ"
  },
  "asset.preview": {
    "method": "GET",
    "path": "/assets/{id}/preview",
    "mode": "BINARY"
  },
  "asset.quarantine": {
    "method": "POST",
    "path": "/assets/{id}/quarantine",
    "mode": "COMMAND"
  },
  "auth.csrf": {
    "method": "GET",
    "path": "/auth/csrf",
    "mode": "AUTH"
  },
  "auth.login": {
    "method": "POST",
    "path": "/auth/login",
    "mode": "AUTH"
  },
  "auth.activate": {
    "method": "POST",
    "path": "/auth/activate",
    "mode": "AUTH"
  },
  "auth.logout": {
    "method": "POST",
    "path": "/auth/logout",
    "mode": "AUTH"
  },
  "auth.changePassword": {
    "method": "POST",
    "path": "/auth/change-password",
    "mode": "AUTH"
  },
  "identity.me": {
    "method": "GET",
    "path": "/me",
    "mode": "READ"
  },
  "dashboard.get": {
    "method": "GET",
    "path": "/dashboard",
    "mode": "READ"
  },
  "catalog.list": {
    "method": "GET",
    "path": "/catalog",
    "mode": "READ"
  },
  "catalog.create": {
    "method": "POST",
    "path": "/catalog/items",
    "mode": "COMMAND"
  },
  "catalog.update": {
    "method": "PATCH",
    "path": "/catalog/items/{id}",
    "mode": "COMMAND"
  },
  "member.list": {
    "method": "GET",
    "path": "/memberships",
    "mode": "READ"
  },
  "member.create": {
    "method": "POST",
    "path": "/memberships",
    "mode": "SECRET"
  },
  "member.disable": {
    "method": "POST",
    "path": "/memberships/{id}/disable",
    "mode": "COMMAND"
  },
  "member.permissions": {
    "method": "PATCH",
    "path": "/memberships/{id}/permissions",
    "mode": "COMMAND"
  },
  "member.resetAccess": {
    "method": "POST",
    "path": "/memberships/{id}/reset-access",
    "mode": "SECRET"
  },
  "scope.list": {
    "method": "GET",
    "path": "/scopes",
    "mode": "READ"
  },
  "scope.create": {
    "method": "POST",
    "path": "/scopes",
    "mode": "COMMAND"
  },
  "record.scope": {
    "method": "PATCH",
    "path": "/records/{kind}/{id}/scope",
    "mode": "COMMAND"
  },
  "source.list": {
    "method": "GET",
    "path": "/sources",
    "mode": "READ"
  },
  "source.create": {
    "method": "POST",
    "path": "/sources",
    "mode": "COMMAND"
  },
  "source.history": {
    "method": "GET",
    "path": "/sources/{id}/history",
    "mode": "READ"
  },
  "source.get": {
    "method": "GET",
    "path": "/sources/{id}",
    "mode": "READ"
  },
  "source.update": {
    "method": "PATCH",
    "path": "/sources/{id}",
    "mode": "COMMAND"
  },
  "source.review": {
    "method": "POST",
    "path": "/sources/{id}/review",
    "mode": "COMMAND"
  },
  "source.suspend": {
    "method": "POST",
    "path": "/sources/{id}/suspend",
    "mode": "COMMAND"
  },
  "handoff.recipients": {
    "method": "GET",
    "path": "/people/{id}/handoff-recipients",
    "mode": "READ"
  },
  "handoff.create": {
    "method": "POST",
    "path": "/people/{id}/handoffs",
    "mode": "COMMAND"
  },
  "handoff.list": {
    "method": "GET",
    "path": "/handoffs",
    "mode": "READ"
  },
  "handoff.get": {
    "method": "GET",
    "path": "/handoffs/{id}",
    "mode": "READ"
  },
  "handoff.accept": {
    "method": "POST",
    "path": "/handoffs/{id}/accept",
    "mode": "COMMAND"
  },
  "handoff.decline": {
    "method": "POST",
    "path": "/handoffs/{id}/decline",
    "mode": "COMMAND"
  },
  "handoff.revoke": {
    "method": "POST",
    "path": "/handoffs/{id}/revoke",
    "mode": "COMMAND"
  },
  "person.list": {
    "method": "GET",
    "path": "/people",
    "mode": "READ"
  },
  "person.create": {
    "method": "POST",
    "path": "/people",
    "mode": "COMMAND"
  },
  "person.get": {
    "method": "GET",
    "path": "/people/{id}",
    "mode": "READ"
  },
  "person.update": {
    "method": "PATCH",
    "path": "/people/{id}",
    "mode": "COMMAND"
  },
  "contact.get": {
    "method": "GET",
    "path": "/people/{id}/contacts",
    "mode": "READ"
  },
  "contact.replace": {
    "method": "PUT",
    "path": "/people/{id}/contacts",
    "mode": "COMMAND"
  },
  "evidence.confirm": {
    "method": "POST",
    "path": "/field-evidence",
    "mode": "COMMAND"
  },
  "import.preview": {
    "method": "POST",
    "path": "/imports/preview",
    "mode": "COMMAND"
  },
  "import.get": {
    "method": "GET",
    "path": "/imports/{id}",
    "mode": "READ"
  },
  "import.commit": {
    "method": "POST",
    "path": "/imports/{id}/commit",
    "mode": "COMMAND"
  },
  "job.list": {
    "method": "GET",
    "path": "/jobs",
    "mode": "READ"
  },
  "job.resume": {
    "method": "POST",
    "path": "/jobs/{id}/resume",
    "mode": "COMMAND"
  },
  "job.get": {
    "method": "GET",
    "path": "/jobs/{id}",
    "mode": "READ"
  },
  "audit.list": {
    "method": "GET",
    "path": "/audit-events",
    "mode": "READ"
  },
  "deletion.preview": {
    "method": "POST",
    "path": "/deletion-requests/preview",
    "mode": "READ"
  },
  "deletion.list": {
    "method": "GET",
    "path": "/deletion-requests",
    "mode": "READ"
  },
  "deletion.create": {
    "method": "POST",
    "path": "/deletion-requests",
    "mode": "COMMAND"
  },
  "deletion.get": {
    "method": "GET",
    "path": "/deletion-requests/{id}",
    "mode": "READ"
  },
  "deletion.block": {
    "method": "POST",
    "path": "/deletion-requests/{id}/block",
    "mode": "COMMAND"
  },
  "deletion.items": {
    "method": "GET",
    "path": "/deletion-requests/{id}/items",
    "mode": "READ"
  },
  "deletion.decision": {
    "method": "POST",
    "path": "/deletion-requests/{id}/decisions",
    "mode": "COMMAND"
  },
  "deletion.planFreeze": {
    "method": "POST",
    "path": "/deletion-requests/{id}/plan/freeze",
    "mode": "COMMAND"
  },
  "deletion.cleanupStart": {
    "method": "POST",
    "path": "/deletion-requests/{id}/cleaning/start",
    "mode": "COMMAND"
  },
  "usePermission.list": {
    "method": "GET",
    "path": "/use-permissions",
    "mode": "READ"
  },
  "usePermission.create": {
    "method": "POST",
    "path": "/use-permissions",
    "mode": "COMMAND"
  },
  "usePermission.revoke": {
    "method": "POST",
    "path": "/use-permissions/{id}/revoke",
    "mode": "COMMAND"
  },
  "export.list": {
    "method": "GET",
    "path": "/exports",
    "mode": "READ"
  },
  "export.create": {
    "method": "POST",
    "path": "/exports",
    "mode": "COMMAND"
  },
  "export.get": {
    "method": "GET",
    "path": "/exports/{id}",
    "mode": "READ"
  },
  "export.download": {
    "method": "POST",
    "path": "/exports/{id}/download",
    "mode": "READ"
  },
  "talent.search": {
    "method": "GET",
    "path": "/talent-search",
    "mode": "READ"
  },
  "shortlist.list": {
    "method": "GET",
    "path": "/shortlists",
    "mode": "READ"
  },
  "shortlist.create": {
    "method": "POST",
    "path": "/shortlists",
    "mode": "COMMAND"
  },
  "shortlist.get": {
    "method": "GET",
    "path": "/shortlists/{id}",
    "mode": "READ"
  },
  "shortlist.update": {
    "method": "PATCH",
    "path": "/shortlists/{id}",
    "mode": "COMMAND"
  },
  "shortlist.itemAdd": {
    "method": "POST",
    "path": "/shortlists/{id}/items",
    "mode": "COMMAND"
  },
  "shortlist.itemUpdate": {
    "method": "POST",
    "path": "/shortlists/{id}/items/update",
    "mode": "COMMAND"
  },
  "shortlist.itemRemove": {
    "method": "POST",
    "path": "/shortlists/{id}/items/remove",
    "mode": "COMMAND"
  },
  "shortlist.reorder": {
    "method": "POST",
    "path": "/shortlists/{id}/items/reorder",
    "mode": "COMMAND"
  }
} as const;
