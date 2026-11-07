import {SUPPLIER_FIELDS_VERSION,type FieldOption,type SupplierField,type SupplierFieldCatalog,type FieldComponent} from './supplier-field-contract.ts';
const options=(items:Array<[string,string]>):FieldOption[]=>items.map(([code,label])=>({code,label,aliases:[],status:'ACTIVE'}));
const tags=(code:string,label:string,roles:string[],items:Array<[string,string]>,description:string):SupplierField=>({code,label,roles,owner:'ROLE',type:'CODE_SET',required:false,
 visibility:'SELF_SHARED',description,searchable:true,ai:'SUGGEST',maxItems:30,options:options(items)});
const text=(code:string,label:string,required=false):FieldComponent=>({code,label,required,type:'TEXT',maxLength:500});
const day=(code:string,label:string):FieldComponent=>({code,label,required:false,type:'DATE'});
const records=(code:string,label:string,components:FieldComponent[],roles:string[]=[],owner:'PERSON'|'ROLE'='PERSON'):SupplierField=>({code,label,components,roles,owner,type:'RECORDS',required:false,
 visibility:'SELF_SHARED',description:'本人声明，保留原文和时间；确认入库不代表资格或经历已经核验。',searchable:false,ai:'SUGGEST',maxItems:30});
const year=(code:string,label:string):FieldComponent=>({code,label,type:'NUMBER',required:false,unit:'年',min:1900,max:2100});
const creative=['model','director','screenwriter','photographer','cinematographer','lighting','editor','colorist'];
const fields:SupplierField[]=[
 tags('production.focus','擅长制作类型',creative,[['commercial','商业广告'],['brand_film','品牌短片'],['fashion','时尚影像'],['music_video','音乐影像'],['documentary','纪录片'],['narrative','剧情'],['social_video','社交短视频'],['ecommerce','电商'],['live_event','现场活动']],
  '本人按职业声明的擅长方向；不是已核实的作品履历。'),
 tags('camera.duties','可承担的摄影职责',['photographer','cinematographer'],[['dp','摄影指导 / DP'],['photographer','平面摄影'],['camera_operator','掌机'],['focus_puller','跟焦'],['dit','DIT'],['aerial','航拍']],
  '保留职责之间的区别；单个作品的具体署名仍记录在作品贡献中。'),
 tags('camera.specialties','特殊摄影能力',['photographer','cinematographer'],[['steadicam','斯坦尼康'],['trinity','Trinity'],['moco','MOCO'],['film_16mm','16mm 胶片操作'],['film_35mm','35mm 胶片操作'],['underwater','水下摄影'],['high_speed','高速摄影']],
  '能力声明；器材品牌或证书出现在资料中并不自动代表已核验。'),
 tags('lighting.specialties','灯光专长',['lighting'],[['studio','棚拍布光'],['location','外景布光'],['product','产品布光'],['beauty','美妆布光'],['narrative','剧情布光'],['stage','舞台灯光']], '按灯光职业记录本人专长。'),
 tags('post.specialties','后期专长',['editor','colorist'],[['offline_edit','离线剪辑'],['online_edit','在线精编'],['motion_graphics','动态图形'],['conform','套底'],['color_management','色彩管理'],['film_grade','影像调色'],['ai_video','AI 视频制作']], '软件熟练度应另按具体软件逐项记录。'),
 tags('writing.specialties','编剧专长',['screenwriter'],[['commercial','广告脚本'],['short_film','短片'],['feature','长片'],['series','剧集'],['documentary','纪录片策划'],['social_video','短视频脚本']], '按编剧职业记录本人声明。'),
 tags('direction.specialties','导演专长',['director'],[['performance','演员调度'],['visual','视觉叙事'],['documentary','纪实拍摄'],['tabletop','桌面产品'],['action','动作场面'],['ai_video','AI 视频导演']], '导演能力和作品署名分开记录。'),
 tags('model.specialties','模特展示方向',['model'],[['runway','走秀'],['fashion','时装'],['beauty','美妆'],['commercial','商业平面'],['video','视频表演'],['fitting','试衣']], '可多选；不据此推断身体参数或承接意愿。'),
 records('person.education','教育与培训',[text('institution','院校或培训机构',true),text('program','专业或课程'),text('qualification','学历或结业说明'),day('from','开始日期'),day('until','结束日期'),year('from_year','开始年份'),year('until_year','结束年份'),text('period','原文起止时间')]),
 records('person.experience','从业经历',[text('organization','机构或项目',true),text('position','职责'),day('from','开始日期'),day('until','结束日期'),text('description','经历说明'),year('from_year','开始年份'),year('until_year','结束年份'),text('period','原文起止时间')]),
 records('person.unmapped_notes','其他专业资料',[text('label','资料名称',true),text('original','原文',true)]),
 {code:'role.started_year',label:'开始从业年份',owner:'ROLE',roles:[],type:'NUMBER',required:false,visibility:'SELF_SHARED',description:'仅在材料明确给出开始年份时填写，不用“从业 N 年”倒推。',searchable:true,ai:'SUGGEST',unit:'年',min:1900,max:2100},
 {code:'internal.relationship_tags',label:'ONCE 整理标签',owner:'PERSON',roles:[],type:'CODE_SET',required:false,visibility:'INTERNAL',description:'仅供 ONCE 内部整理，不向供应商或解析模型提供。',searchable:true,ai:'NEVER',maxItems:30,
  options:options([['contacted','已联系'],['worked_together','有合作记录'],['needs_followup','待跟进']])},
];
const roles:Array<[string,string]>=[['model','模特'],['director','导演'],['screenwriter','编剧'],['photographer','摄影'],['cinematographer','摄影指导'],['lighting','灯光'],['editor','剪辑'],['colorist','调色'],['translator','翻译']];
export const DEFAULT_SUPPLIER_FIELD_CATALOG:SupplierFieldCatalog={schemaVersion:SUPPLIER_FIELDS_VERSION,fields,templates:[
 {code:'common',label:'通用专业资料',roleCode:null,fieldCodes:fields.filter(f=>f.owner==='PERSON').map(f=>f.code)},
 ...roles.map(([code,label])=>({code,label,roleCode:code,fieldCodes:fields.filter(f=>f.owner==='ROLE'&&(!f.roles.length||f.roles.includes(code))).map(f=>f.code)})),
]};
