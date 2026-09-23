// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.
export interface Inputs {
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
  }
} as const;
