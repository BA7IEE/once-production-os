/** Shared, versioned directory product semantics. No persisted person classifications. */
export const DIRECTORY_QUERY_VERSION='once-talent-directory-query-v1.1';
export const DIRECTORY_DIMENSIONS={role:'roles',gender:'genders',nationality:'nationalities',market:'markets',experience:'experiences',style:'styles',service:'services',location:'locations',language:'languages',industryCode:'industries',workTypeCode:'workTypes'} as const;
export type TalentQuery=Record<string,string|string[]>;
export const queryValues=(value:string|string[]|undefined):string[]=>value===undefined?[]:Array.isArray(value)?value:[value];
export const DIRECTORY_AGE_PRESETS={version:'age-presets-v1',items:[
 {id:'child',label:'儿童（0–17）',min:0,max:17},{id:'18-24',label:'18–24',min:18,max:24},
 {id:'25-34',label:'25–34',min:25,max:34},{id:'35-49',label:'35–49',min:35,max:49},{id:'50-plus',label:'50+',min:50,max:130}
]} as const;
