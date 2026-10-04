import {useRef,useState} from 'react';
import {call,read} from './api.ts';
import {useLoad,useAction,ErrorBox} from './ui.tsx';
import type {Inputs} from './generated/requests.ts';
import type {TalentDetail} from './talent-dto.ts';
import type {Me,Source,Page} from './dto.ts';
import {TalentSourceChoice,outcomeUnknown} from './talent-edit.tsx';
import {EditorFrame} from './ux-controls.tsx';
import {useUnsaved,allowLeave} from './unsaved.ts';
import {CommandRecovery} from './command-recovery.tsx';
import {MediaPanel} from './media-ui.tsx';
import {blankCollection,CollectionGallery,CollectionPlanEditor,type CollectionPlan,type CollectionView,type CollectionAsset} from './collection-ui.tsx';
export function InternalCollections({detail,me,onSaved}:{detail:TalentDetail;me:Me;onSaved:()=>void}){
 const [plan,setPlan]=useState<CollectionPlan|null>(null);
 const collections:CollectionView[]=detail.facts.mediaCollections.filter(c=>c.usable).map(c=>({id:c.id,revision:c.revision,title:String(c.title),collectionTypeCode:c.collectionTypeCode as CollectionPlan['collectionTypeCode'],personRoleId:c.personRoleId as string|null,isCurrent:!!c.isCurrent,coverAssetId:c.coverAssetId as string|null,tagCodes:detail.facts.mediaCollectionTags.filter(t=>t.usable&&t.collectionId===c.id).map(t=>String(t.tagCode)),items:c.items as CollectionView['items']}));
 const start=(c?:CollectionView)=>setPlan(c?{clientItemKey:'collection_'+c.id.slice(0,8),targetCollectionId:c.id,expectedCollectionRevision:c.revision,personRoleId:c.personRoleId,collectionTypeCode:c.collectionTypeCode,title:c.title,isCurrent:c.isCurrent,coverAssetId:c.coverAssetId,tagCodes:c.tagCodes as CollectionPlan['tagCodes'],items:c.items.map(i=>({assetId:i.assetId,referenceKind:'EXISTING_ADOPTED_ASSET_REFERENCE',caption:i.caption,featured:i.featured}))}:blankCollection());
 if(plan)return <CollectionEditor detail={detail} me={me} initial={plan} onClose={()=>setPlan(null)} onSaved={()=>{setPlan(null);onSaved();}}/>;
 return <section className="panel padded" aria-label="媒体集合"><div className="section-heading"><h2>模卡与媒体资料</h2>{detail.canEdit&&<button onClick={()=>start()}>新建媒体集合</button>}</div><p>按用途整理照片、视频和模卡，选择现有素材或在当前档案补充上传。</p><CollectionGallery collections={collections} base="/api/v1/assets/" onEdit={detail.canEdit?start:undefined}/>{!collections.length&&<p>暂无可用集合。</p>}</section>;
}
function CollectionEditor({detail,me,initial,onClose,onSaved}:{detail:TalentDetail;me:Me;initial:CollectionPlan;onClose:()=>void;onSaved:()=>void}){
 const [plan,setPlan]=useState(initial),[source,setSource]=useState<Source|null>(null),[page,setPage]=useState(1),[pool,setPool]=useState<CollectionAsset[]>([]),[tick,setTick]=useState(0),[upload,setUpload]=useState(false),action=useAction(),snapshot=useRef<Inputs['td2.collection.save']|null>(null),frozen=action.busy||outcomeUnknown(action.error);
 const assets=useLoad(async()=>{const result=await read<Page<CollectionAsset>>('asset.list',{}, {personId:detail.id,page:String(page),pageSize:'20'});setPool(old=>[...old.filter(a=>!result.items.some(b=>b.id===a.id)),...result.items]);return result;},detail.id+':'+page+':'+tick);
 const dirty=JSON.stringify(plan)!==JSON.stringify(initial)||!!source,markSaved=useUnsaved(dirty,'模卡与媒体集合');
 const close=()=>{if(frozen)return;if(!allowLeave())return;markSaved();onClose();};
 const save=()=>void action.run(async()=>{if(!source)throw new Error('请选择本次整理的当前有效来源');snapshot.current??={schemaVersion:'once-talent-v2.1.0',expectedPersonRevision:detail.revision,sourceId:source.id,sourceRevision:source.revision,collection:plan};await call('td2.collection.save',snapshot.current,{id:detail.id});markSaved();onSaved();});
 return <EditorFrame title="整理模卡与媒体集合" onClose={close}><div className="modal-body"><ErrorBox error={action.error??assets.error}/><fieldset disabled={frozen}><TalentSourceChoice value={source} onChange={s=>{snapshot.current=null;setSource(s);}}/><CollectionPlanEditor plan={plan} onChange={p=>{snapshot.current=null;setPlan(p);}} assets={pool} roles={detail.facts.personRoles.filter(r=>r.usable).map(r=>({id:r.id,label:({model:'模特',actor:'演员',kol:'达人'} as Record<string,string>)[String(r.roleCode)]??String(r.roleCode)}))} base="/api/v1/assets/" disabled={frozen}/>{assets.data&&pool.length<assets.data.total&&<button type="button" onClick={()=>setPage(p=>p+1)}>加载更多可用素材</button>}<button type="button" onClick={()=>setUpload(v=>!v)}>{upload?'收起上传':'补充上传照片视频'}</button></fieldset>{upload&&<MediaPanel me={me} personId={detail.id} source={source??undefined} compact showGallery={false} onReady={()=>setTick(t=>t+1)}/>} {outcomeUnknown(action.error)&&<CommandRecovery operation="td2.collection.save" params={{id:detail.id}} busy={action.busy} onRetry={save}/>}</div><footer className="modal-footer"><button disabled={frozen} onClick={close}>返回</button><button className="primary" disabled={frozen||!source||!plan.title.trim()} onClick={save}>保存媒体集合</button></footer></EditorFrame>;
}
