// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.
export interface Inputs {
  "shortlist.list": undefined;
  "shortlist.create": { "projectId": string; "title": string; "brief"?: string };
  "shortlist.get": undefined;
  "shortlist.update": { "expectedRevision": number; "title"?: string; "brief"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  "shortlist.personAdd": { "expectedRevision": number; "personId": string; "groupLabel"?: string; "state"?: "CANDIDATE" | "PRIORITY" | "CONTACTED" | "NOT_SUITABLE"; "note"?: string };
  "shortlist.personUpdate": { "expectedRevision": number; "entryId": string; "groupLabel"?: string; "state"?: "CANDIDATE" | "PRIORITY" | "CONTACTED" | "NOT_SUITABLE"; "note"?: string };
  "shortlist.personRemove": { "expectedRevision": number; "entryId": string };
  "shortlist.peopleReorder": { "expectedRevision": number; "entryIds": Array<string> };
  "shortlist.workAdd": { "expectedRevision": number; "workId": string; "note"?: string };
  "shortlist.workRemove": { "expectedRevision": number; "entryId": string };
  "shortlist.worksReorder": { "expectedRevision": number; "entryIds": Array<string> };
  "work.list": undefined;
  "work.create": { "title": string; "sourceId"?: string; "inlineSource"?: { "title": string; "type": "MANUAL" | "TEXT"; "providerClaim": string; "textPayload"?: string; "basisMode": "TEMP_ORGANIZE" | "INTERNAL_USE"; "basisDescription": string; "validUntil"?: string; "scopeId"?: string }; "description"?: string; "origin"?: "ONCE" | "EXTERNAL" | "UNKNOWN"; "originNote"?: string };
  "work.get": undefined;
  "work.update": { "expectedRevision": number; "title"?: string; "description"?: string; "origin"?: "ONCE" | "EXTERNAL" | "UNKNOWN"; "originNote"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
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
  "catalog.create": { "namespace": "role" | "city" | "language" | "skill"; "code": string; "labelZh": string; "labelEn": string };
  "catalog.update": { "expectedRevision": number; "labelZh"?: string; "labelEn"?: string; "status"?: "ACTIVE" | "INACTIVE" };
  "member.list": undefined;
  "member.create": { "loginName": string; "displayName": string; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write"> };
  "member.disable": { "expectedRevision": number };
  "member.permissions": { "expectedRevision": number; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write"> };
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
  "search.people": { "q"?: string; "roles"?: { "codes": Array<string>; "mode": "ANY" | "ALL" }; "cityCode"?: string; "languages"?: { "codes": Array<string>; "mode": "ANY" | "ALL" }; "skills"?: { "codes": Array<string>; "mode": "ANY" | "ALL" }; "minHeightCm"?: number; "maxHeightCm"?: number; "workOrigins"?: Array<"ONCE" | "EXTERNAL" | "UNKNOWN">; "minVisibleWorks"?: number; "minActualProjects"?: number; "verifiedWithinDays"?: number; "statuses"?: Array<"DRAFT" | "ACTIVE" | "ARCHIVED">; "page"?: number; "pageSize"?: number };
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
}
export const ENDPOINTS = {
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
  "shortlist.personAdd": {
    "method": "POST",
    "path": "/shortlists/{id}/people",
    "mode": "COMMAND"
  },
  "shortlist.personUpdate": {
    "method": "POST",
    "path": "/shortlists/{id}/people/update",
    "mode": "COMMAND"
  },
  "shortlist.personRemove": {
    "method": "POST",
    "path": "/shortlists/{id}/people/remove",
    "mode": "COMMAND"
  },
  "shortlist.peopleReorder": {
    "method": "POST",
    "path": "/shortlists/{id}/people/reorder",
    "mode": "COMMAND"
  },
  "shortlist.workAdd": {
    "method": "POST",
    "path": "/shortlists/{id}/works",
    "mode": "COMMAND"
  },
  "shortlist.workRemove": {
    "method": "POST",
    "path": "/shortlists/{id}/works/remove",
    "mode": "COMMAND"
  },
  "shortlist.worksReorder": {
    "method": "POST",
    "path": "/shortlists/{id}/works/reorder",
    "mode": "COMMAND"
  },
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
  "search.people": {
    "method": "POST",
    "path": "/search/people",
    "mode": "READ"
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
  }
} as const;
