export const navigation = [
 {key:'dashboard',path:'/workspace',label:'工作台',group:'日常工作',permissions:[]},
 {key:'people',path:'/talents',label:'人才库',group:'日常工作',permissions:['records.read']},
 {key:'works',path:'/works',label:'作品库',group:'日常工作',permissions:['records.read']},
 {key:'projects',path:'/projects',label:'项目',group:'日常工作',permissions:['records.read']},
 {key:'shortlists',path:'/shortlists',label:'候选清单',group:'日常工作',permissions:['records.read']},
 {key:'media',path:'/assets',label:'素材库',group:'日常工作',permissions:['assets.read']},
 {key:'handoffs',path:'/tools/handoffs',label:'资料交接',group:'工具与协作',permissions:['records.read']},
 {key:'imports',path:'/tools/imports',label:'批量导入',group:'工具与协作',permissions:['records.write']},
 {key:'ai',path:'/tools/ai',label:'AI 整理',group:'工具与协作',permissions:['ai.use','sources.review']},
 {key:'exports',path:'/tools/exports',label:'导出记录',group:'工具与协作',permissions:['data.export','sources.review']},
 {key:'sources',path:'/tools/sources',label:'资料来源与使用范围',group:'工具与协作',permissions:['sources.read']},
 {key:'members',path:'/settings/members',label:'成员与权限',group:'系统设置',permissions:['members.manage']},
 {key:'catalog',path:'/settings/catalog',label:'分类设置',group:'系统设置',permissions:['catalog.manage']},
 {key:'organizations',path:'/settings/organizations',label:'机构与品牌',group:'系统设置',permissions:['records.read']},
 {key:'audit',path:'/settings/audit',label:'操作日志',group:'系统设置',permissions:['audit.read']},
 {key:'merges',path:'/settings/maintenance/merges',label:'合并记录',group:'系统设置',permissions:['data.merge']},
 {key:'deletions',path:'/settings/maintenance/deletions',label:'删除任务与影响核对',group:'系统设置',permissions:['data.delete']},
 {key:'account',path:'/account',label:'账号设置',group:'账号',permissions:[]},
] as const;
export function navigationFor(permissions:readonly string[]) {return navigation.filter(p=>!p.permissions.length||p.permissions.some(x=>permissions.includes(x)));}
export function routeFor(path:string) {return navigation.find(p=>path===p.path||path.startsWith(p.path+'/'));}
