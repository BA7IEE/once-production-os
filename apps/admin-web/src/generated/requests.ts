// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.
export interface Inputs {
  "td2.shortlist.role": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "itemId": string; "personRoleId": string; "personRoleRevision": number };
  "td2.schema": undefined;
  "td2.person.list": undefined;
  "td2.resolve": undefined;
  "td2.person.create": { "schemaVersion": "once-talent-v2.0.0"; "originSourceId": string; "sourceRevision": number; "displayName": string; "aliases"?: Array<string>; "intro"?: string; "createTalent"?: boolean };
  "td2.person.get": undefined;
  "td2.person.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "displayName"?: string; "aliases"?: Array<string>; "intro"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  "td2.person.enroll": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "sourceRevision": number };
  "td2.evidence": { "schemaVersion": "once-talent-v2.0.0"; "ownerKind": "person" | "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags"; "ownerId": string; "fieldPath": string; "expectedRevision": number; "sourceId": string; "sourceRevision": number };
  "td2.proposal.create": { "schemaVersion": "once-talent-v2.0.0"; "ownerKind": "person" | "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags"; "ownerId": string; "fieldPath": string; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "proposedValue": unknown };
  "td2.proposal.list": undefined;
  "td2.proposal.decide": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "decision": "APPLY" | "REJECT" };
  "td2.registry.create": { "schemaVersion": "once-talent-v2.0.0"; "code": string; "labelZh": string; "labelEn": string; "aliases": Array<string>; "applicableRoleCodes": Array<string>; "levelSchemeCode": "ABILITY_5" | null; "semanticVersion": string };
  "td2.registry.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "labelZh"?: string; "labelEn"?: string; "status"?: "ACTIVE" | "INACTIVE" };
  "td2.organization.create": { "schemaVersion": "once-talent-v2.0.0"; "sourceId": string; "sourceRevision": number; "name": string; "kind": "AGENCY" | "ISSUER" | "OTHER" };
  "td2.organization.list": undefined;
  "td2.measurement.confirm": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.external.verify": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.external.revoke": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.verify": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.revoke": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.secret": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "identifier": string };
  "td2.adult.verify": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number; "evidenceAssetId": string; "validUntil": string };
  "td2.collection.add": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "assetId": string; "caption"?: string; "featured"?: boolean };
  "td2.collection.remove": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "itemId": string };
  "td2.collection.order": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "itemIds": Array<string> };
  "td2.principal.list": undefined;
  "td2.principal.create": { "schemaVersion": "once-talent-v2.0.0"; "displayName": string; "scopeId": string; "defaultMaintainerMembershipId": string; "permissionCodes": Array<"records.read" | "sources.read" | "talent.propose" | "talent.fact.write">; "expiresAt": string };
  "td2.principal.rotate": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number };
  "td2.principal.revoke": { "schemaVersion": "once-talent-v2.0.0"; "expectedRevision": number };
  "td2.fact.talentProfiles.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "internalSummary"?: string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.talentProfiles.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "internalSummary"?: string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.personRoles.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "roleCode": string; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personRoles.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personCapabilities.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "capabilityCode": string; "levelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personCapabilities.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "levelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personLanguages.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "languageCode": string; "speakingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "listeningLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "readingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "writingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personLanguages.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "speakingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "listeningLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "readingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "writingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.talentLocations.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "locationCode": string; "relationCode": "BASE" | "SERVICE"; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.talentLocations.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "locationCode"?: string; "relationCode"?: "BASE" | "SERVICE"; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.castingProfiles.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "hairColorCode"?: "BLACK" | "BROWN" | "BLONDE" | "RED" | "GRAY" | "WHITE" | "OTHER" | null; "eyeColorCode"?: "BLACK" | "BROWN" | "BLUE" | "GREEN" | "GRAY" | "HAZEL" | "OTHER" | null; "appearanceObservedOn"?: string | null } };
  "td2.fact.castingProfiles.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "hairColorCode"?: "BLACK" | "BROWN" | "BLONDE" | "RED" | "GRAY" | "WHITE" | "OTHER" | null; "eyeColorCode"?: "BLACK" | "BROWN" | "BLUE" | "GREEN" | "GRAY" | "HAZEL" | "OTHER" | null; "appearanceObservedOn"?: string | null } };
  "td2.fact.measurementSets.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "measuredOn": string; "datePrecision": "EXACT_DAY" | "APPROXIMATE"; "heightCm"?: number | null; "bustCm"?: number | null; "waistCm"?: number | null; "hipsCm"?: number | null; "shoeSizeValue"?: string | null; "shoeSizeSystem"?: "EU" | "US" | "UK" | "CN" | null; "clothingSizeValue"?: string | null; "clothingSizeSystem"?: "INTL" | "EU" | "US" | "UK" | "CN" | null; "supersedesId"?: string | null } };
  "td2.fact.measurementSets.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "measuredOn"?: string; "datePrecision"?: "EXACT_DAY" | "APPROXIMATE"; "heightCm"?: number | null; "bustCm"?: number | null; "waistCm"?: number | null; "hipsCm"?: number | null; "shoeSizeValue"?: string | null; "shoeSizeSystem"?: "EU" | "US" | "UK" | "CN" | null; "clothingSizeValue"?: string | null; "clothingSizeSystem"?: "INTL" | "EU" | "US" | "UK" | "CN" | null } };
  "td2.fact.adultEligibilities.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "state": "UNKNOWN" | "SELF_DECLARED_ADULT" | "RESTRICTED"; "validUntil"?: string | null; "evidenceAssetId"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.adultEligibilities.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "state"?: "UNKNOWN" | "SELF_DECLARED_ADULT" | "RESTRICTED"; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.representations.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "agencyOrganizationId"?: string | null; "agentPersonId"?: string | null; "relationCode": "AGENT" | "AGENCY" | "MANAGER"; "territoryCode"?: string | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.representations.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "relationCode"?: "AGENT" | "AGENCY" | "MANAGER"; "territoryCode"?: string | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personExternalRefs.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "providerCode": "WECHAT" | "XIAOHONGSHU" | "INSTAGRAM" | "AGENCY_INTERNAL" | "SUPPLIER_SYSTEM"; "namespaceCode": string; "issuerOrganizationId"?: string | null; "externalKey": string } };
  "td2.fact.personExternalRefs.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": {  } };
  "td2.fact.personCredentials.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "credentialTypeCode": "DRONE_LICENSE" | "TRANSLATION_CERTIFICATE" | "DIVING_CERTIFICATE" | "EQUIPMENT_CERTIFICATE" | "OTHER"; "issuerOrganizationId"?: string | null; "issuerName"?: string | null; "issuedOn"?: string | null; "expiresOn"?: string | null; "evidenceAssetId"?: string | null } };
  "td2.fact.personCredentials.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "credentialTypeCode"?: "DRONE_LICENSE" | "TRANSLATION_CERTIFICATE" | "DIVING_CERTIFICATE" | "EQUIPMENT_CERTIFICATE" | "OTHER"; "issuerName"?: string | null; "issuedOn"?: string | null; "expiresOn"?: string | null } };
  "td2.fact.translatorLanguagePairs.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId": string; "sourceLanguageCode": string; "targetLanguageCode": string; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorLanguagePairs.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorServiceModes.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId": string; "modeCode": "BUSINESS_MEETING" | "ON_SET" | "ESCORT" | "CONSECUTIVE" | "SIMULTANEOUS" | "WRITTEN"; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorServiceModes.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.mediaCollections.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "collectionTypeCode": "MODEL_CARD" | "POLAROIDS" | "PORTFOLIO" | "SHOWREEL" | "INTRO_VIDEO" | "OTHER"; "title": string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.mediaCollections.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "collectionTypeCode"?: "MODEL_CARD" | "POLAROIDS" | "PORTFOLIO" | "SHOWREEL" | "INTRO_VIDEO" | "OTHER"; "title"?: string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.mediaCollectionTags.create": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "collectionId": string; "tagCode": "FASHION" | "BEAUTY" | "COMMERCIAL" | "LINGERIE" | "RUNWAY" | "LIFESTYLE" | "INDUSTRIAL" | "PRODUCT" } };
  "td2.fact.mediaCollectionTags.patch": { "schemaVersion": "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": {  } };
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
  "member.create": { "loginName": string; "displayName": string; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete" | "data.merge"> };
  "member.disable": { "expectedRevision": number };
  "member.permissions": { "expectedRevision": number; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete" | "data.merge"> };
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
  "person.mergeHistory": undefined;
  "person.mergePreview": { "canonicalId": string; "duplicateId": string; "expectedCanonicalRevision": number; "expectedDuplicateRevision": number };
  "person.merge": { "canonicalId": string; "duplicateId": string; "expectedCanonicalRevision": number; "expectedDuplicateRevision": number; "previewDigest": string; "fieldDecisions": Array<{ "field": "displayName" | "aliases" | "roles" | "cityCode" | "languageCodes" | "skillCodes" | "heightCm" | "intro"; "choice": "CANONICAL" | "DUPLICATE" | "UNION" }>; "collisionDecisions": Array<{ "collisionId": string; "choice": "KEEP_CANONICAL" | "KEEP_DUPLICATE" }>; "professionalDecisions"?: Array<{ "table": "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags" | "mediaCollectionItems" | "talentMigrationReviews" | "fieldProposals"; "id": string; "action": "MOVE" | "REBIND_AGENT" | "STALE_PROPOSAL" | "RETAIN_HISTORY" }>; "professionalConflicts"?: Array<{ "table": "talentProfiles" | "castingProfiles" | "adultEligibilities" | "personRoles" | "personLanguages" | "talentLocations"; "canonicalId": string; "duplicateId": string; "choice": "RETAIN_DUPLICATE_HISTORY" | "KEEP_CANONICAL_ACTIVE" | "KEEP_DUPLICATE_ACTIVE" }>; "acknowledgeRevocations": boolean; "acknowledgeMediaDetach": boolean; "reason": string };
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
  "shortlist.itemAdd": { "expectedRevision": number; "personId": string; "personRoleId"?: string; "personRoleRevision"?: number; "workId"?: string; "workAssetIds": Array<string>; "note": string };
  "shortlist.itemUpdate": { "expectedRevision": number; "entryId": string; "note": string };
  "shortlist.itemRemove": { "expectedRevision": number; "entryId": string };
  "shortlist.reorder": { "expectedRevision": number; "entryIds": Array<string> };
}
export const ENDPOINTS = {
  "td2.shortlist.role": {
    "method": "POST",
    "path": "/td2/shortlists/{id}/role",
    "mode": "COMMAND"
  },
  "td2.schema": {
    "method": "GET",
    "path": "/td2/schema",
    "mode": "READ"
  },
  "td2.person.list": {
    "method": "GET",
    "path": "/td2/people",
    "mode": "READ"
  },
  "td2.resolve": {
    "method": "GET",
    "path": "/td2/resolve",
    "mode": "READ"
  },
  "td2.person.create": {
    "method": "POST",
    "path": "/td2/people",
    "mode": "COMMAND"
  },
  "td2.person.get": {
    "method": "GET",
    "path": "/td2/people/{id}",
    "mode": "READ"
  },
  "td2.person.patch": {
    "method": "PATCH",
    "path": "/td2/people/{id}",
    "mode": "COMMAND"
  },
  "td2.person.enroll": {
    "method": "POST",
    "path": "/td2/people/{id}/enroll",
    "mode": "COMMAND"
  },
  "td2.evidence": {
    "method": "POST",
    "path": "/td2/evidence",
    "mode": "COMMAND"
  },
  "td2.proposal.create": {
    "method": "POST",
    "path": "/td2/proposals",
    "mode": "COMMAND"
  },
  "td2.proposal.list": {
    "method": "GET",
    "path": "/td2/proposals",
    "mode": "READ"
  },
  "td2.proposal.decide": {
    "method": "POST",
    "path": "/td2/proposals/{id}/decide",
    "mode": "COMMAND"
  },
  "td2.registry.create": {
    "method": "POST",
    "path": "/td2/capability-definitions",
    "mode": "COMMAND"
  },
  "td2.registry.patch": {
    "method": "PATCH",
    "path": "/td2/capability-definitions/{id}",
    "mode": "COMMAND"
  },
  "td2.organization.create": {
    "method": "POST",
    "path": "/td2/organizations",
    "mode": "COMMAND"
  },
  "td2.organization.list": {
    "method": "GET",
    "path": "/td2/organizations",
    "mode": "READ"
  },
  "td2.measurement.confirm": {
    "method": "POST",
    "path": "/td2/measurements/{id}/confirm",
    "mode": "COMMAND"
  },
  "td2.external.verify": {
    "method": "POST",
    "path": "/td2/external-refs/{id}/verify",
    "mode": "COMMAND"
  },
  "td2.external.revoke": {
    "method": "POST",
    "path": "/td2/external-refs/{id}/revoke",
    "mode": "COMMAND"
  },
  "td2.credential.verify": {
    "method": "POST",
    "path": "/td2/credentials/{id}/verify",
    "mode": "COMMAND"
  },
  "td2.credential.revoke": {
    "method": "POST",
    "path": "/td2/credentials/{id}/revoke",
    "mode": "COMMAND"
  },
  "td2.credential.secret": {
    "method": "POST",
    "path": "/td2/credentials/{id}/identifier",
    "mode": "COMMAND"
  },
  "td2.adult.verify": {
    "method": "POST",
    "path": "/td2/adult-eligibility/{id}/verify",
    "mode": "COMMAND"
  },
  "td2.collection.add": {
    "method": "POST",
    "path": "/td2/collections/{id}/items",
    "mode": "COMMAND"
  },
  "td2.collection.remove": {
    "method": "POST",
    "path": "/td2/collections/{id}/items/remove",
    "mode": "COMMAND"
  },
  "td2.collection.order": {
    "method": "POST",
    "path": "/td2/collections/{id}/items/reorder",
    "mode": "COMMAND"
  },
  "td2.principal.list": {
    "method": "GET",
    "path": "/td2/principals",
    "mode": "READ"
  },
  "td2.principal.create": {
    "method": "POST",
    "path": "/td2/principals",
    "mode": "SECRET"
  },
  "td2.principal.rotate": {
    "method": "POST",
    "path": "/td2/principals/{id}/rotate",
    "mode": "SECRET"
  },
  "td2.principal.revoke": {
    "method": "POST",
    "path": "/td2/principals/{id}/revoke",
    "mode": "COMMAND"
  },
  "td2.fact.talentProfiles.create": {
    "method": "POST",
    "path": "/td2/people/{id}/profile",
    "mode": "COMMAND"
  },
  "td2.fact.talentProfiles.patch": {
    "method": "PATCH",
    "path": "/td2/profile/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.personRoles.create": {
    "method": "POST",
    "path": "/td2/people/{id}/roles",
    "mode": "COMMAND"
  },
  "td2.fact.personRoles.patch": {
    "method": "PATCH",
    "path": "/td2/roles/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.personCapabilities.create": {
    "method": "POST",
    "path": "/td2/people/{id}/capabilities",
    "mode": "COMMAND"
  },
  "td2.fact.personCapabilities.patch": {
    "method": "PATCH",
    "path": "/td2/capabilities/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.personLanguages.create": {
    "method": "POST",
    "path": "/td2/people/{id}/languages",
    "mode": "COMMAND"
  },
  "td2.fact.personLanguages.patch": {
    "method": "PATCH",
    "path": "/td2/languages/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.talentLocations.create": {
    "method": "POST",
    "path": "/td2/people/{id}/locations",
    "mode": "COMMAND"
  },
  "td2.fact.talentLocations.patch": {
    "method": "PATCH",
    "path": "/td2/locations/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.castingProfiles.create": {
    "method": "POST",
    "path": "/td2/people/{id}/casting",
    "mode": "COMMAND"
  },
  "td2.fact.castingProfiles.patch": {
    "method": "PATCH",
    "path": "/td2/casting/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.measurementSets.create": {
    "method": "POST",
    "path": "/td2/people/{id}/measurements",
    "mode": "COMMAND"
  },
  "td2.fact.measurementSets.patch": {
    "method": "PATCH",
    "path": "/td2/measurements/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.adultEligibilities.create": {
    "method": "POST",
    "path": "/td2/people/{id}/adult-eligibility",
    "mode": "COMMAND"
  },
  "td2.fact.adultEligibilities.patch": {
    "method": "PATCH",
    "path": "/td2/adult-eligibility/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.representations.create": {
    "method": "POST",
    "path": "/td2/people/{id}/representations",
    "mode": "COMMAND"
  },
  "td2.fact.representations.patch": {
    "method": "PATCH",
    "path": "/td2/representations/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.personExternalRefs.create": {
    "method": "POST",
    "path": "/td2/people/{id}/external-refs",
    "mode": "COMMAND"
  },
  "td2.fact.personExternalRefs.patch": {
    "method": "PATCH",
    "path": "/td2/external-refs/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.personCredentials.create": {
    "method": "POST",
    "path": "/td2/people/{id}/credentials",
    "mode": "COMMAND"
  },
  "td2.fact.personCredentials.patch": {
    "method": "PATCH",
    "path": "/td2/credentials/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.translatorLanguagePairs.create": {
    "method": "POST",
    "path": "/td2/people/{id}/translation-pairs",
    "mode": "COMMAND"
  },
  "td2.fact.translatorLanguagePairs.patch": {
    "method": "PATCH",
    "path": "/td2/translation-pairs/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.translatorServiceModes.create": {
    "method": "POST",
    "path": "/td2/people/{id}/translation-modes",
    "mode": "COMMAND"
  },
  "td2.fact.translatorServiceModes.patch": {
    "method": "PATCH",
    "path": "/td2/translation-modes/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.mediaCollections.create": {
    "method": "POST",
    "path": "/td2/people/{id}/collections",
    "mode": "COMMAND"
  },
  "td2.fact.mediaCollections.patch": {
    "method": "PATCH",
    "path": "/td2/collections/{id}",
    "mode": "COMMAND"
  },
  "td2.fact.mediaCollectionTags.create": {
    "method": "POST",
    "path": "/td2/people/{id}/collection-tags",
    "mode": "COMMAND"
  },
  "td2.fact.mediaCollectionTags.patch": {
    "method": "PATCH",
    "path": "/td2/collection-tags/{id}",
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
  "person.mergeHistory": {
    "method": "GET",
    "path": "/people/{id}/merge-history",
    "mode": "READ"
  },
  "person.mergePreview": {
    "method": "POST",
    "path": "/people/merge-preview",
    "mode": "READ"
  },
  "person.merge": {
    "method": "POST",
    "path": "/people/merge",
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
