import type { FieldEvidence, Person } from './model.ts';

export interface TalentQueryFilters {
    workspaceId: string;
    visibleScopeIds: string[];
    visibleSourceIds: string[];
    q: string;
    role: string | null;
    cityCode: string | null;
    languageCode: string | null;
    skillCode: string | null;
    status: Person['status'] | null;
    actualProject: boolean;
    industryCode: string | null;
    workTypeCode: string | null;
    page: number;
    pageSize: number;
    scanForVerification: boolean;
}

export interface TalentQueryRow {
    person: Person;
    actualProjectCount: number;
    industryCodes: string[];
    workTypeCodes: string[];
}

export interface TalentFacetRow {
    personId: string;
    roles: string[];
    cityCode: string | null;
    languageCodes: string[];
    skillCodes: string[];
    industryCodes: string[];
    workTypeCodes: string[];
}

export interface TalentFacetCount {
    code: string;
    count: number;
}
export interface TalentFacetCounts {
    roles: TalentFacetCount[];
    cities: TalentFacetCount[];
    languages: TalentFacetCount[];
    skills: TalentFacetCount[];
    industries: TalentFacetCount[];
    workTypes: TalentFacetCount[];
}

export interface TalentQueryResult {
    rows: TalentQueryRow[];
    baseTotal: number;
    alreadyPaged: boolean;
    facets: TalentFacetCounts;
    evidence: FieldEvidence[];
}
