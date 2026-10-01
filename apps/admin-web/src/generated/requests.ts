// Generated from packages/core/src/routes.ts and validation.ts. Do not edit.
export interface Inputs {
  "portal.auth.context": { "purpose": "LOGIN" | "RECOVER" };
  "portal.auth.contextStatus": undefined;
  "portal.auth.challenge": { "contextId": string; "purpose": "LOGIN" | "RECOVER"; "kind": "EMAIL" | "PHONE"; "identity": string };
  "portal.auth.verify": { "contextId": string; "challengeId": string; "purpose": "LOGIN" | "RECOVER"; "code": string };
  "portal.me": undefined;
  "portal.auth.logout": {  };
  "portal.sessions.revoke": {  };
  "talent.account.disable": { "expectedRevision": number };
  "talent.account.erase": { "expectedRevision": number };
  "talent.invitation.create": { "purpose": "CLAIM" | "ENROLL"; "targetPersonId"?: string; "scopeId": string; "recipientKind"?: "EMAIL" | "PHONE"; "recipient"?: string; "maxUses"?: number; "exposureFields": Array<"displayName" | "aliases" | "intro"> };
  "talent.invitation.list": undefined;
  "talent.invitation.issue": { "expectedRevision": number };
  "talent.invitation.revoke": { "expectedRevision": number };
  "talent.claim.list": undefined;
  "talent.claim.decide": { "expectedRevision": number; "decision": "APPROVE" | "REJECT"; "ownershipBasis": string; "guardianConfirmed": boolean };
  "talent.grant.revoke": { "expectedRevision": number };
  "talent.submission.list": undefined;
  "talent.submission.get": undefined;
  "talent.submission.decide": { "expectedRevision": number; "acceptedKeys": Array<string>; "publicReason": string; "targetPersonId"?: string; "createPerson"?: boolean; "ownershipBasis"?: string; "guardianConfirmed"?: boolean };
  "portal.invitation.exchange": { "invitationId": string; "token": string };
  "portal.invitation.inspect": undefined;
  "portal.claim.create": { "contextId": string; "relation": "SELF" | "GUARDIAN" | "AGENT"; "applicantKey": string; "adultDeclared": boolean };
  "portal.claim.list": undefined;
  "portal.claim.renew": { "expectedRevision": number; "contextId": string };
  "portal.profile.list": undefined;
  "portal.profile.get": undefined;
  "portal.submission.create": { "schemaVersion": "once-talent-text-v1"; "claimId"?: string; "grantId"?: string; "consentTextVersion": "internal-directory-2026-10-v1"; "consentAccepted": boolean; "items": Array<{ "clientItemKey": string; "field": "displayName" | "aliases" | "intro"; "text"?: string; "aliases"?: Array<string>; "dependencyGroup": string; "dependsOn": Array<string> }> };
  "portal.submission.list": undefined;
  "portal.submission.get": undefined;
  "portal.submission.save": { "expectedRevision": number; "items": Array<{ "clientItemKey": string; "field": "displayName" | "aliases" | "intro"; "text"?: string; "aliases"?: Array<string>; "dependencyGroup": string; "dependsOn": Array<string> }> };
  "portal.submission.submit": { "expectedRevision": number };
  "portal.submission.withdraw": { "expectedRevision": number };
  "portal.submission.fork": { "expectedRevision": number };
  "portal.consent.revoke": { "expectedRevision": number };
  "brand.create": { "sourceId": string; "sourceRevision": number; "name": string; "organizationId": string | null };
  "brand.list": undefined;
  "brand.patch": { "expectedRevision": number; "name"?: string; "organizationId"?: string | null; "status"?: "ACTIVE" | "ARCHIVED" };
  "project.parties": { "expectedRevision": number; "clientOrganizationId": string | null; "brandId": string | null };
  "ai.connection.test": { "expectedRevision": number; "confirmTest": boolean };
  "ai.connection": undefined;
  "ai.connection.save": { "expectedRevision": number; "connection": { "name": string; "baseURL": string; "protocol": "openai-chat" | "openai-responses" | "anthropic-messages"; "model": string; "timeoutMs": number; "maxOutputTokens": number }; "apiKey": string; "currency": string; "perTaskLimitUnits": number; "dailyLimitUnits": number };
  "ai.operations": undefined;
  "ai.approval": { "configDigest": string; "expectedRevision": number; "enabled": boolean; "confirmConfiguration": boolean };
  "ai.reconcile": { "expectedRevision": number; "outcome": "SUCCEEDED" | "NOT_EXECUTED"; "amountUnits": number; "evidenceSourceId": string; "evidenceSourceRevision": number; "providerIdempotencyKey": string; "providerIdentityHash": string; "confirmProviderResult": boolean };
  "ai.unfreeze": { "expectedRevision": number; "confirmOverrun": boolean };
  "ai.settings": undefined;
  "ai.grants": undefined;
  "ai.grant": { "sourceId": string; "expectedRevision": number; "validUntil": string; "evidenceNote": string; "confirmTextOnly": boolean };
  "ai.grant.revoke": { "expectedRevision": number };
  "ai.preview": { "taskType": "extract_profile" | "suggest_tags" | "draft_locale" | "parse_search"; "subjectKind": "PERSON" | "WORK" | "PROJECT" | "NONE"; "subjectId": string | null; "expectedRevision": number | null; "locale": "zh" | "en" | null; "sources": Array<{ "sourceId": string; "expectedRevision": number; "grantId": string; "start": number; "end": number }>; "queryText": string; "confirmMinimizedInput": boolean };
  "ai.list": undefined;
  "ai.create": { "taskType": "extract_profile" | "suggest_tags" | "draft_locale" | "parse_search"; "subjectKind": "PERSON" | "WORK" | "PROJECT" | "NONE"; "subjectId": string | null; "expectedRevision": number | null; "locale": "zh" | "en" | null; "sources": Array<{ "sourceId": string; "expectedRevision": number; "grantId": string; "start": number; "end": number }>; "queryText": string; "confirmMinimizedInput": boolean };
  "ai.get": undefined;
  "ai.proposal": undefined;
  "ai.cancel": { "expectedRevision": number };
  "ai.apply": { "expectedRevision": number; "selectedFields": Array<"displayName" | "intro" | "aliases" | "industryCode" | "workTypeCodes" | "text" | "filters"> };
  "ai.reject": { "expectedRevision": number };
  "ai.results": undefined;
  "locale.list": undefined;
  "locale.get": undefined;
  "locale.create": { "subjectKind": "PERSON" | "WORK" | "PROJECT"; "subjectId": string; "locale": "zh" | "en"; "text": string; "sourceRefs": Array<{ "id": string; "expectedRevision": number }>; "expectedSubjectRevision": number; "confirmCurrentBasis": boolean };
  "locale.update": { "expectedRevision": number; "text": string; "sourceRefs": Array<{ "id": string; "expectedRevision": number }>; "expectedSubjectRevision": number; "confirmCurrentBasis": boolean };
  "directory.talent.update": { "schemaVersion": "once-talent-experience-v1"; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "profile"?: { "internalSummary"?: string; "status"?: "ACTIVE" | "ARCHIVED"; "genderCode"?: "FEMALE" | "MALE" | "NON_BINARY" | "OTHER" | null; "birthPrecision"?: "UNKNOWN" | "EXACT_DATE" | "YEAR_ONLY" | "DECLARED_RANGE"; "birthDate"?: string | null; "birthYear"?: number | null; "minAgeYears"?: number | null; "maxAgeYears"?: number | null; "ageAsOfDate"?: string | null; "nationalityCodes"?: Array<string>; "coverAssetId"?: string | null }; "model"?: { "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE"; "castingMarketCode"?: "UNCLASSIFIED" | "DOMESTIC" | "INTERNATIONAL"; "experienceCode"?: "UNSPECIFIED" | "AMATEUR" | "PROFESSIONAL"; "styleCodes"?: Array<string>; "serviceCodes"?: Array<string> }; "locationCode"?: string | null; "measurement"?: { "measuredOn": string | null; "datePrecision": "EXACT_DAY" | "APPROXIMATE" | "UNKNOWN"; "heightCm"?: number | null; "bustCm"?: number | null; "waistCm"?: number | null; "hipsCm"?: number | null; "shoeSizeValue"?: string | null; "shoeSizeSystem"?: "EU" | "US" | "UK" | "CN" | null; "clothingSizeValue"?: string | null; "clothingSizeSystem"?: "INTL" | "EU" | "US" | "UK" | "CN" | null; "supersedesId"?: string | null }; "confirmMeasurement"?: boolean };
  "directory.talent.search": { "q"?: string; "mode"?: "ALL" | "TALENT" | "CONTACT"; "role"?: string | Array<string>; "gender"?: "FEMALE" | "MALE" | "NON_BINARY" | "OTHER" | "UNKNOWN" | Array<"FEMALE" | "MALE" | "NON_BINARY" | "OTHER" | "UNKNOWN">; "nationality"?: string | Array<string>; "market"?: "DOMESTIC" | "INTERNATIONAL" | "UNCLASSIFIED" | Array<"DOMESTIC" | "INTERNATIONAL" | "UNCLASSIFIED">; "experience"?: "AMATEUR" | "PROFESSIONAL" | "UNSPECIFIED" | Array<"AMATEUR" | "PROFESSIONAL" | "UNSPECIFIED">; "style"?: string | Array<string>; "service"?: string | Array<string>; "location"?: string | Array<string>; "language"?: string | Array<string>; "industryCode"?: string | Array<string>; "workTypeCode"?: string | Array<string>; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED"; "ageMin"?: number; "ageMax"?: number; "ageUnknown"?: boolean; "heightMin"?: number; "heightMax"?: number; "page"?: number; "pageSize"?: number };
  "directory.talent.get": undefined;
  "directory.talent.create": { "schemaVersion": "once-talent-experience-v1"; "displayName": string; "kind": "TALENT" | "CONTACT"; "roleCodes"?: Array<string>; "sourceId"?: string; "sourceRevision"?: number };
  "td2.heightReview.list": undefined;
  "td2.heightReview.dismiss": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number; "resolution": "DO_NOT_USE_LEGACY_HEIGHT"; "acknowledge": boolean };
  "td2.credential.secret.clear": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number; "acknowledge": boolean };
  "td2.shortlist.role": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "itemId": string; "personRoleId": string; "personRoleRevision": number };
  "td2.schema": undefined;
  "td2.person.list": undefined;
  "td2.resolve": undefined;
  "td2.person.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "originSourceId": string; "sourceRevision": number; "displayName": string; "aliases"?: Array<string>; "intro"?: string; "createTalent"?: boolean };
  "td2.person.get": undefined;
  "td2.person.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "displayName"?: string; "aliases"?: Array<string>; "intro"?: string; "status"?: "DRAFT" | "ACTIVE" | "ARCHIVED" };
  "td2.person.enroll": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "sourceRevision": number };
  "td2.evidence.list": undefined;
  "td2.evidence": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "ownerKind": "person" | "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags"; "ownerId": string; "fieldPath": string; "expectedRevision": number; "sourceId": string; "sourceRevision": number };
  "td2.proposal.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "ownerKind": "person" | "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags"; "ownerId": string; "fieldPath": string; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "proposedValue": unknown };
  "td2.proposal.list": undefined;
  "td2.proposal.decide": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "decision": "APPLY" | "REJECT" };
  "td2.registry.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "code": string; "labelZh": string; "labelEn": string; "aliases": Array<string>; "applicableRoleCodes": Array<string>; "levelSchemeCode": "ABILITY_5" | null; "semanticVersion": string };
  "td2.registry.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "labelZh"?: string; "labelEn"?: string; "status"?: "ACTIVE" | "INACTIVE" };
  "td2.organization.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "sourceId": string; "sourceRevision": number; "name": string; "kind": "AGENCY" | "ISSUER" | "OTHER" };
  "td2.organization.list": undefined;
  "td2.measurement.confirm": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.external.verify": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.external.revoke": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.verify": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.revoke": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number };
  "td2.credential.secret": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "identifier": string };
  "td2.adult.verify": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "sourceRevision": number; "evidenceAssetId": string; "validUntil": string };
  "td2.collection.add": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "assetId": string; "caption"?: string; "featured"?: boolean };
  "td2.collection.remove": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "itemId": string };
  "td2.collection.order": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number; "expectedPersonRevision": number; "itemIds": Array<string> };
  "td2.principal.list": undefined;
  "td2.principal.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "displayName": string; "scopeId": string; "defaultMaintainerMembershipId": string; "permissionCodes": Array<"records.read" | "sources.read" | "talent.propose" | "talent.fact.write">; "expiresAt": string };
  "td2.principal.rotate": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number };
  "td2.principal.revoke": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedRevision": number };
  "td2.fact.talentProfiles.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "internalSummary"?: string; "status"?: "ACTIVE" | "ARCHIVED"; "genderCode"?: "FEMALE" | "MALE" | "NON_BINARY" | "OTHER" | null; "birthPrecision"?: "UNKNOWN" | "EXACT_DATE" | "YEAR_ONLY" | "DECLARED_RANGE"; "birthDate"?: string | null; "birthYear"?: number | null; "minAgeYears"?: number | null; "maxAgeYears"?: number | null; "ageAsOfDate"?: string | null; "nationalityCodes"?: Array<string>; "coverAssetId"?: string | null } };
  "td2.fact.talentProfiles.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "internalSummary"?: string; "status"?: "ACTIVE" | "ARCHIVED"; "genderCode"?: "FEMALE" | "MALE" | "NON_BINARY" | "OTHER" | null; "birthPrecision"?: "UNKNOWN" | "EXACT_DATE" | "YEAR_ONLY" | "DECLARED_RANGE"; "birthDate"?: string | null; "birthYear"?: number | null; "minAgeYears"?: number | null; "maxAgeYears"?: number | null; "ageAsOfDate"?: string | null; "nationalityCodes"?: Array<string>; "coverAssetId"?: string | null } };
  "td2.fact.personRoles.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "roleCode": string; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE"; "castingMarketCode"?: "UNCLASSIFIED" | "DOMESTIC" | "INTERNATIONAL"; "experienceCode"?: "UNSPECIFIED" | "AMATEUR" | "PROFESSIONAL"; "styleCodes"?: Array<string>; "serviceCodes"?: Array<string> } };
  "td2.fact.personRoles.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE"; "castingMarketCode"?: "UNCLASSIFIED" | "DOMESTIC" | "INTERNATIONAL"; "experienceCode"?: "UNSPECIFIED" | "AMATEUR" | "PROFESSIONAL"; "styleCodes"?: Array<string>; "serviceCodes"?: Array<string> } };
  "td2.fact.personCapabilities.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "capabilityCode": string; "levelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personCapabilities.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "levelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personLanguages.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "languageCode": string; "speakingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "listeningLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "readingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "writingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personLanguages.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "speakingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "listeningLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "readingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "writingLevelCode"?: "BASIC" | "WORKING" | "PROFESSIONAL" | "FLUENT" | "NATIVE" | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.talentLocations.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "locationCode": string; "relationCode": "BASE" | "SERVICE"; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.talentLocations.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "locationCode"?: string; "relationCode"?: "BASE" | "SERVICE"; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.castingProfiles.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "hairColorCode"?: "BLACK" | "BROWN" | "BLONDE" | "RED" | "GRAY" | "WHITE" | "OTHER" | null; "eyeColorCode"?: "BLACK" | "BROWN" | "BLUE" | "GREEN" | "GRAY" | "HAZEL" | "OTHER" | null; "appearanceObservedOn"?: string | null } };
  "td2.fact.castingProfiles.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "hairColorCode"?: "BLACK" | "BROWN" | "BLONDE" | "RED" | "GRAY" | "WHITE" | "OTHER" | null; "eyeColorCode"?: "BLACK" | "BROWN" | "BLUE" | "GREEN" | "GRAY" | "HAZEL" | "OTHER" | null; "appearanceObservedOn"?: string | null } };
  "td2.fact.measurementSets.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "measuredOn": string | null; "datePrecision": "EXACT_DAY" | "APPROXIMATE" | "UNKNOWN"; "heightCm"?: number | null; "bustCm"?: number | null; "waistCm"?: number | null; "hipsCm"?: number | null; "shoeSizeValue"?: string | null; "shoeSizeSystem"?: "EU" | "US" | "UK" | "CN" | null; "clothingSizeValue"?: string | null; "clothingSizeSystem"?: "INTL" | "EU" | "US" | "UK" | "CN" | null; "supersedesId"?: string | null } };
  "td2.fact.measurementSets.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "measuredOn"?: string | null; "datePrecision"?: "EXACT_DAY" | "APPROXIMATE" | "UNKNOWN"; "heightCm"?: number | null; "bustCm"?: number | null; "waistCm"?: number | null; "hipsCm"?: number | null; "shoeSizeValue"?: string | null; "shoeSizeSystem"?: "EU" | "US" | "UK" | "CN" | null; "clothingSizeValue"?: string | null; "clothingSizeSystem"?: "INTL" | "EU" | "US" | "UK" | "CN" | null } };
  "td2.fact.adultEligibilities.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "state": "UNKNOWN" | "SELF_DECLARED_ADULT" | "RESTRICTED"; "validUntil"?: string | null; "evidenceAssetId"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.adultEligibilities.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "state"?: "UNKNOWN" | "SELF_DECLARED_ADULT" | "RESTRICTED"; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.representations.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "agencyOrganizationId"?: string | null; "agentPersonId"?: string | null; "relationCode": "AGENT" | "AGENCY" | "MANAGER"; "territoryCode"?: string | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.representations.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "relationCode"?: "AGENT" | "AGENCY" | "MANAGER"; "territoryCode"?: string | null; "validFrom"?: string | null; "validUntil"?: string | null; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.personExternalRefs.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "providerCode": "WECHAT" | "XIAOHONGSHU" | "INSTAGRAM" | "AGENCY_INTERNAL" | "SUPPLIER_SYSTEM"; "namespaceCode": string; "issuerOrganizationId"?: string | null; "externalKey": string } };
  "td2.fact.personExternalRefs.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": {  } };
  "td2.fact.personCredentials.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "credentialTypeCode": "DRONE_LICENSE" | "TRANSLATION_CERTIFICATE" | "DIVING_CERTIFICATE" | "EQUIPMENT_CERTIFICATE" | "OTHER"; "issuerOrganizationId"?: string | null; "issuerName"?: string | null; "issuedOn"?: string | null; "expiresOn"?: string | null; "evidenceAssetId"?: string | null } };
  "td2.fact.personCredentials.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "credentialTypeCode"?: "DRONE_LICENSE" | "TRANSLATION_CERTIFICATE" | "DIVING_CERTIFICATE" | "EQUIPMENT_CERTIFICATE" | "OTHER"; "issuerName"?: string | null; "issuedOn"?: string | null; "expiresOn"?: string | null } };
  "td2.fact.translatorLanguagePairs.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId": string; "sourceLanguageCode": string; "targetLanguageCode": string; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorLanguagePairs.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorServiceModes.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId": string; "modeCode": "BUSINESS_MEETING" | "ON_SET" | "ESCORT" | "CONSECUTIVE" | "SIMULTANEOUS" | "WRITTEN"; "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.translatorServiceModes.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "status"?: "ACTIVE" | "INACTIVE" } };
  "td2.fact.mediaCollections.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "personRoleId"?: string | null; "collectionTypeCode": "MODEL_CARD" | "POLAROIDS" | "PORTFOLIO" | "SHOWREEL" | "INTRO_VIDEO" | "OTHER"; "title": string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.mediaCollections.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": { "collectionTypeCode"?: "MODEL_CARD" | "POLAROIDS" | "PORTFOLIO" | "SHOWREEL" | "INTRO_VIDEO" | "OTHER"; "title"?: string; "status"?: "ACTIVE" | "ARCHIVED" } };
  "td2.fact.mediaCollectionTags.create": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "sourceId": string; "sourceRevision": number; "values": { "collectionId": string; "tagCode": "FASHION" | "BEAUTY" | "COMMERCIAL" | "LINGERIE" | "RUNWAY" | "LIFESTYLE" | "INDUSTRIAL" | "PRODUCT" } };
  "td2.fact.mediaCollectionTags.patch": { "schemaVersion": "once-talent-v2.1.0" | "once-talent-v2.0.0"; "expectedPersonRevision": number; "expectedRevision": number; "sourceId": string; "sourceRevision": number; "values": {  } };
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
  "upload.create": { "sourceId": string; "expectedSourceRevision": number; "personId"?: string; "fileName": string; "mime": "image/jpeg" | "image/png" | "image/webp" | "application/pdf" | "video/mp4"; "expectedBytes": number; "sha256": string };
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
  "catalog.create": { "namespace": "role" | "city" | "language" | "skill" | "industry" | "workType" | "nationality" | "roleStyle" | "roleService"; "code": string; "labelZh": string; "labelEn": string };
  "catalog.update": { "expectedRevision": number; "labelZh"?: string; "labelEn"?: string; "status"?: "ACTIVE" | "INACTIVE" };
  "member.list": undefined;
  "member.create": { "loginName": string; "displayName": string; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete" | "data.merge" | "ai.use" | "talent.invite" | "talent.review"> };
  "member.disable": { "expectedRevision": number };
  "member.permissions": { "expectedRevision": number; "role": "ADMIN" | "EDITOR" | "REVIEWER" | "VIEWER"; "extraPermissions": Array<"sensitive.read" | "sensitive.write" | "data.export" | "data.delete" | "data.merge" | "ai.use" | "talent.invite" | "talent.review"> };
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
  "person.merge": { "canonicalId": string; "duplicateId": string; "expectedCanonicalRevision": number; "expectedDuplicateRevision": number; "previewDigest": string; "fieldDecisions": Array<{ "field": "displayName" | "aliases" | "roles" | "cityCode" | "languageCodes" | "skillCodes" | "heightCm" | "intro"; "choice": "CANONICAL" | "DUPLICATE" | "UNION" }>; "collisionDecisions": Array<{ "collisionId": string; "choice": "KEEP_CANONICAL" | "KEEP_DUPLICATE" }>; "professionalDecisions"?: Array<{ "table": "talentProfiles" | "personRoles" | "personCapabilities" | "personLanguages" | "talentLocations" | "castingProfiles" | "measurementSets" | "adultEligibilities" | "representations" | "personExternalRefs" | "personCredentials" | "translatorLanguagePairs" | "translatorServiceModes" | "mediaCollections" | "mediaCollectionTags" | "mediaCollectionItems" | "talentMigrationReviews" | "fieldProposals" | "shortlistItems"; "id": string; "action": "MOVE" | "REBIND_AGENT" | "STALE_PROPOSAL" | "RETAIN_HISTORY" }>; "professionalConflicts"?: Array<{ "table": "talentProfiles" | "castingProfiles" | "adultEligibilities" | "personRoles" | "personLanguages" | "talentLocations"; "canonicalId": string; "duplicateId": string; "choice": "RETAIN_DUPLICATE_HISTORY" | "KEEP_CANONICAL_ACTIVE" | "KEEP_DUPLICATE_ACTIVE" }>; "localeDecisions"?: Array<{ "locale": "zh" | "en"; "selectedTextId": string }>; "acknowledgeRevocations": boolean; "acknowledgeMediaDetach": boolean; "reason": string };
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
  "usePermission.create": { "sourceId": string; "retentionBasisSourceId"?: string; "subjectKind": "SOURCE" | "PERSON" | "WORK" | "PROJECT" | "ASSET"; "subjectId": string; "fields": Array<"person.localeTexts" | "work.localeTexts" | "project.localeTexts" | "person.displayName" | "person.aliases" | "person.roles" | "person.cityCode" | "person.languageCodes" | "person.skillCodes" | "person.heightCm" | "person.intro" | "person.status" | "work.title" | "work.description" | "work.industryCode" | "work.workTypeCodes" | "work.origin" | "work.originNote" | "work.status" | "work.relations" | "project.parties" | "project.title" | "project.brief" | "project.locationNote" | "project.dateNote" | "project.reviewNote" | "project.status" | "project.relations" | "source.title" | "source.type" | "source.providerClaim" | "source.basisMode" | "source.basisDescription" | "source.validFrom" | "source.validUntil" | "source.status" | "person.td2.mergeHistory" | "person.identityEvidence" | "media.identity" | "media.originals" | "person.td2.talentProfiles" | "person.td2.personRoles" | "person.td2.personCapabilities" | "person.td2.representations" | "person.td2.personCredentials" | "person.td2.personExternalRefs" | "person.td2.personLanguages" | "person.td2.talentLocations" | "person.td2.measurementSets" | "person.td2.castingProfiles" | "person.td2.translatorLanguagePairs" | "person.td2.translatorServiceModes" | "person.td2.mediaCollections" | "person.td2.mediaCollectionTags" | "person.td2.adultEligibilities" | "person.td2.birthDate" | "person.td2.credentialIdentifiers" | "person.td2.fieldEvidence">; "validUntil": string; "evidenceNote": string };
  "usePermission.revoke": { "expectedRevision": number };
  "export.list": undefined;
  "export.create": { "format": "JSON"; "selectedIds": { "people": Array<string>; "works": Array<string>; "projects": Array<string> }; "fields": Array<"person.localeTexts" | "work.localeTexts" | "project.localeTexts" | "person.displayName" | "person.aliases" | "person.roles" | "person.cityCode" | "person.languageCodes" | "person.skillCodes" | "person.heightCm" | "person.intro" | "person.status" | "work.title" | "work.description" | "work.industryCode" | "work.workTypeCodes" | "work.origin" | "work.originNote" | "work.status" | "work.relations" | "project.parties" | "project.title" | "project.brief" | "project.locationNote" | "project.dateNote" | "project.reviewNote" | "project.status" | "project.relations" | "source.title" | "source.type" | "source.providerClaim" | "source.basisMode" | "source.basisDescription" | "source.validFrom" | "source.validUntil" | "source.status" | "person.td2.mergeHistory" | "person.identityEvidence" | "media.identity" | "media.originals" | "person.td2.talentProfiles" | "person.td2.personRoles" | "person.td2.personCapabilities" | "person.td2.representations" | "person.td2.personCredentials" | "person.td2.personExternalRefs" | "person.td2.personLanguages" | "person.td2.talentLocations" | "person.td2.measurementSets" | "person.td2.castingProfiles" | "person.td2.translatorLanguagePairs" | "person.td2.translatorServiceModes" | "person.td2.mediaCollections" | "person.td2.mediaCollectionTags" | "person.td2.adultEligibilities" | "person.td2.birthDate" | "person.td2.credentialIdentifiers" | "person.td2.fieldEvidence">; "usePermissionRefs": Array<string> };
  "export.get": undefined;
  "export.mediaOriginal": undefined;
  "export.mediaPreview": undefined;
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
  "portal.auth.context": {
    "method": "POST",
    "path": "/portal/auth/context",
    "mode": "AUTH"
  },
  "portal.auth.contextStatus": {
    "method": "GET",
    "path": "/portal/auth/contexts/{id}",
    "mode": "AUTH"
  },
  "portal.auth.challenge": {
    "method": "POST",
    "path": "/portal/auth/challenges",
    "mode": "AUTH"
  },
  "portal.auth.verify": {
    "method": "POST",
    "path": "/portal/auth/verify",
    "mode": "AUTH"
  },
  "portal.me": {
    "method": "GET",
    "path": "/portal/me",
    "mode": "READ"
  },
  "portal.auth.logout": {
    "method": "POST",
    "path": "/portal/auth/logout",
    "mode": "AUTH"
  },
  "portal.sessions.revoke": {
    "method": "POST",
    "path": "/portal/auth/revoke-other-sessions",
    "mode": "COMMAND"
  },
  "talent.account.disable": {
    "method": "POST",
    "path": "/talent-accounts/{id}/disable",
    "mode": "COMMAND"
  },
  "talent.account.erase": {
    "method": "POST",
    "path": "/talent-accounts/{id}/erase",
    "mode": "COMMAND"
  },
  "talent.invitation.create": {
    "method": "POST",
    "path": "/talent-invitations",
    "mode": "COMMAND"
  },
  "talent.invitation.list": {
    "method": "GET",
    "path": "/talent-invitations",
    "mode": "READ"
  },
  "talent.invitation.issue": {
    "method": "POST",
    "path": "/talent-invitations/{id}/issue",
    "mode": "SECRET"
  },
  "talent.invitation.revoke": {
    "method": "POST",
    "path": "/talent-invitations/{id}/revoke",
    "mode": "COMMAND"
  },
  "talent.claim.list": {
    "method": "GET",
    "path": "/talent-claims",
    "mode": "READ"
  },
  "talent.claim.decide": {
    "method": "POST",
    "path": "/talent-claims/{id}/decide",
    "mode": "COMMAND"
  },
  "talent.grant.revoke": {
    "method": "POST",
    "path": "/talent-grants/{id}/revoke",
    "mode": "COMMAND"
  },
  "talent.submission.list": {
    "method": "GET",
    "path": "/talent-submissions",
    "mode": "READ"
  },
  "talent.submission.get": {
    "method": "GET",
    "path": "/talent-submissions/{id}",
    "mode": "READ"
  },
  "talent.submission.decide": {
    "method": "POST",
    "path": "/talent-submissions/{id}/decide",
    "mode": "COMMAND"
  },
  "portal.invitation.exchange": {
    "method": "POST",
    "path": "/portal/invitations/exchange",
    "mode": "AUTH"
  },
  "portal.invitation.inspect": {
    "method": "GET",
    "path": "/portal/invitations/{id}",
    "mode": "READ"
  },
  "portal.claim.create": {
    "method": "POST",
    "path": "/portal/claims",
    "mode": "COMMAND"
  },
  "portal.claim.list": {
    "method": "GET",
    "path": "/portal/claims",
    "mode": "READ"
  },
  "portal.claim.renew": {
    "method": "POST",
    "path": "/portal/claims/{id}/renew-admission",
    "mode": "COMMAND"
  },
  "portal.profile.list": {
    "method": "GET",
    "path": "/portal/profiles",
    "mode": "READ"
  },
  "portal.profile.get": {
    "method": "GET",
    "path": "/portal/profiles/{id}",
    "mode": "READ"
  },
  "portal.submission.create": {
    "method": "POST",
    "path": "/portal/submissions",
    "mode": "COMMAND"
  },
  "portal.submission.list": {
    "method": "GET",
    "path": "/portal/submissions",
    "mode": "READ"
  },
  "portal.submission.get": {
    "method": "GET",
    "path": "/portal/submissions/{id}",
    "mode": "READ"
  },
  "portal.submission.save": {
    "method": "PATCH",
    "path": "/portal/submissions/{id}",
    "mode": "COMMAND"
  },
  "portal.submission.submit": {
    "method": "POST",
    "path": "/portal/submissions/{id}/submit",
    "mode": "COMMAND"
  },
  "portal.submission.withdraw": {
    "method": "POST",
    "path": "/portal/submissions/{id}/withdraw",
    "mode": "COMMAND"
  },
  "portal.submission.fork": {
    "method": "POST",
    "path": "/portal/submissions/{id}/fork",
    "mode": "COMMAND"
  },
  "portal.consent.revoke": {
    "method": "POST",
    "path": "/portal/consents/{id}/revoke",
    "mode": "COMMAND"
  },
  "brand.create": {
    "method": "POST",
    "path": "/brands",
    "mode": "COMMAND"
  },
  "brand.list": {
    "method": "GET",
    "path": "/brands",
    "mode": "READ"
  },
  "brand.patch": {
    "method": "PATCH",
    "path": "/brands/{id}",
    "mode": "COMMAND"
  },
  "project.parties": {
    "method": "POST",
    "path": "/projects/{id}/parties",
    "mode": "COMMAND"
  },
  "ai.connection.test": {
    "method": "POST",
    "path": "/ai-connection/test",
    "mode": "COMMAND"
  },
  "ai.connection": {
    "method": "GET",
    "path": "/ai-connection",
    "mode": "READ"
  },
  "ai.connection.save": {
    "method": "POST",
    "path": "/ai-connection",
    "mode": "COMMAND"
  },
  "ai.operations": {
    "method": "GET",
    "path": "/ai-operations",
    "mode": "READ"
  },
  "ai.approval": {
    "method": "POST",
    "path": "/ai-operations/approval",
    "mode": "COMMAND"
  },
  "ai.reconcile": {
    "method": "POST",
    "path": "/ai-attempts/{id}/reconcile",
    "mode": "COMMAND"
  },
  "ai.unfreeze": {
    "method": "POST",
    "path": "/ai-budgets/{id}/unfreeze",
    "mode": "COMMAND"
  },
  "ai.settings": {
    "method": "GET",
    "path": "/ai-settings",
    "mode": "READ"
  },
  "ai.grants": {
    "method": "GET",
    "path": "/ai-grants",
    "mode": "READ"
  },
  "ai.grant": {
    "method": "POST",
    "path": "/ai-grants",
    "mode": "COMMAND"
  },
  "ai.grant.revoke": {
    "method": "POST",
    "path": "/ai-grants/{id}/revoke",
    "mode": "COMMAND"
  },
  "ai.preview": {
    "method": "POST",
    "path": "/ai-jobs/preview",
    "mode": "READ"
  },
  "ai.list": {
    "method": "GET",
    "path": "/ai-jobs",
    "mode": "READ"
  },
  "ai.create": {
    "method": "POST",
    "path": "/ai-jobs",
    "mode": "COMMAND"
  },
  "ai.get": {
    "method": "GET",
    "path": "/ai-jobs/{id}",
    "mode": "READ"
  },
  "ai.proposal": {
    "method": "GET",
    "path": "/proposals/{id}",
    "mode": "READ"
  },
  "ai.cancel": {
    "method": "POST",
    "path": "/ai-jobs/{id}/cancel",
    "mode": "COMMAND"
  },
  "ai.apply": {
    "method": "POST",
    "path": "/proposals/{id}/apply",
    "mode": "COMMAND"
  },
  "ai.reject": {
    "method": "POST",
    "path": "/proposals/{id}/reject",
    "mode": "COMMAND"
  },
  "ai.results": {
    "method": "GET",
    "path": "/ai-jobs/{id}/results",
    "mode": "READ"
  },
  "locale.list": {
    "method": "GET",
    "path": "/locale-texts",
    "mode": "READ"
  },
  "locale.get": {
    "method": "GET",
    "path": "/locale-texts/{id}",
    "mode": "READ"
  },
  "locale.create": {
    "method": "POST",
    "path": "/locale-texts",
    "mode": "COMMAND"
  },
  "locale.update": {
    "method": "PATCH",
    "path": "/locale-texts/{id}",
    "mode": "COMMAND"
  },
  "directory.talent.update": {
    "method": "PATCH",
    "path": "/directory/talents/{id}",
    "mode": "COMMAND"
  },
  "directory.talent.search": {
    "method": "POST",
    "path": "/directory/talents/search",
    "mode": "READ"
  },
  "directory.talent.get": {
    "method": "GET",
    "path": "/directory/talents/{id}",
    "mode": "READ"
  },
  "directory.talent.create": {
    "method": "POST",
    "path": "/directory/talents",
    "mode": "COMMAND"
  },
  "td2.heightReview.list": {
    "method": "GET",
    "path": "/td2/people/{id}/height-reviews",
    "mode": "READ"
  },
  "td2.heightReview.dismiss": {
    "method": "POST",
    "path": "/td2/height-reviews/{id}/dismiss",
    "mode": "COMMAND"
  },
  "td2.credential.secret.clear": {
    "method": "POST",
    "path": "/td2/credentials/{id}/identifier/clear",
    "mode": "COMMAND"
  },
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
  "td2.evidence.list": {
    "method": "GET",
    "path": "/td2/evidence",
    "mode": "READ"
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
  "export.mediaOriginal": {
    "method": "GET",
    "path": "/exports/{id}/media/{assetId}/original",
    "mode": "BINARY"
  },
  "export.mediaPreview": {
    "method": "GET",
    "path": "/exports/{id}/media/{assetId}/preview",
    "mode": "BINARY"
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
