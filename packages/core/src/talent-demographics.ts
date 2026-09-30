import type { Clock } from './model.ts';
import { invariant } from './errors.ts';
export const DEMOGRAPHIC_FIELDS = ['genderCode','birthPrecision','birthDate','birthYear','minAgeYears','maxAgeYears','ageAsOfDate','nationalityCodes','coverAssetId'] as const;
export const MODEL_ROLE_FIELDS = ['castingMarketCode','experienceCode','styleCodes','serviceCodes'] as const;
export const PROFILE_DEFAULTS = {genderCode:null,birthPrecision:'UNKNOWN' as const,birthDate:null,birthYear:null,minAgeYears:null,maxAgeYears:null,ageAsOfDate:null,nationalityCodes:[],coverAssetId:null};
export const ROLE_DEFAULTS = {castingMarketCode:'UNCLASSIFIED' as const,experienceCode:'UNSPECIFIED' as const,styleCodes:[],serviceCodes:[]};
const fullYears=(birth:string,on:string)=>{let age=Number(on.slice(0,4))-Number(birth.slice(0,4));if(on.slice(5)<birth.slice(5))age--;return age;};
const earlier=(day:string,years:number)=>{const year=Number(day.slice(0,4))-years;const value=year+day.slice(4);return value.endsWith('02-29')&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value?year+'-02-28':value;};
/** Conservative complete age interval, recalculated at the explicit business date. No adulthood claim. */
export function ageRange(row:Record<string,unknown>,on:string):{min:number;max:number;asOf:string;precision:string}|null {
 const precision=String(row.birthPrecision??'UNKNOWN');let start:string,end:string;
 if(precision==='EXACT_DATE'&&typeof row.birthDate==='string')start=end=row.birthDate;
 else if(precision==='YEAR_ONLY'&&typeof row.birthYear==='number'){start=row.birthYear+'-01-01';end=row.birthYear+'-12-31';}
 else if(precision==='DECLARED_RANGE'&&typeof row.ageAsOfDate==='string'&&typeof row.minAgeYears==='number'&&typeof row.maxAgeYears==='number'){
  const boundary=earlier(row.ageAsOfDate,row.maxAgeYears+1),day=new Date(boundary+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+1);start=day.toISOString().slice(0,10);end=earlier(row.ageAsOfDate,row.minAgeYears);
 }else return null;
 if(end>on)end=on;
 return {min:Math.max(0,fullYears(end,on)),max:Math.max(0,fullYears(start,on)),asOf:on,precision};
}
export function validateDemographics(row:Record<string,unknown>,clock:Clock){
 const r:Record<string,unknown>={...PROFILE_DEFAULTS,...row},now=clock.now().toISOString().slice(0,10),p=r.birthPrecision;
 invariant(p==='EXACT_DATE'?typeof r.birthDate==='string'&&r.birthDate<=now&&r.birthYear==null&&r.minAgeYears==null&&r.maxAgeYears==null&&r.ageAsOfDate==null:p==='YEAR_ONLY'?Number.isInteger(r.birthYear)&&Number(r.birthYear)>=1900&&Number(r.birthYear)<=Number(now.slice(0,4))&&r.birthDate==null&&r.minAgeYears==null&&r.maxAgeYears==null&&r.ageAsOfDate==null:p==='DECLARED_RANGE'?Number.isInteger(r.minAgeYears)&&Number.isInteger(r.maxAgeYears)&&Number(r.minAgeYears)>=0&&Number(r.maxAgeYears)<=130&&Number(r.minAgeYears)<=Number(r.maxAgeYears)&&typeof r.ageAsOfDate==='string'&&r.ageAsOfDate<=now&&r.birthDate==null&&r.birthYear==null:r.birthDate==null&&r.birthYear==null&&r.minAgeYears==null&&r.maxAgeYears==null&&r.ageAsOfDate==null,'BIRTH_BRANCH_INVALID','出生信息须使用一个明确分支，未知请留空，声明范围须有声明日期',422);
}
