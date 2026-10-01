import { useEffect, useRef, useState } from 'react';
import { ApiError, call, read } from './api.ts';
import type { Inputs } from './generated/requests.ts';
import type { Me, Page, Receipt, Source } from './dto.ts';
import { ErrorBox, Field, PageTitle, Pager, Submit, useAction, useLoad, date } from './ui.tsx';
export interface AssetDto {
    id: string;
    sourceId: string;
    personId: string | null;
    originSourceId?: string | null;
    personRoleId?: string | null;
    relationId?: string;
    usageState: 'STAGED' | 'ADOPTED' | 'RETIRED';
    fileName: string;
    mime: string;
    bytes: number;
    width: number;
    height: number;
    state: 'READY' | 'QUARANTINED';
    revision: number;
    createdAt: string;
}
interface UploadDto {
    id: string;
    fileName: string;
    expectedBytes: number;
    state: string;
    revision: number;
    expiresAt: string;
    errorCode: string | null;
    assetId: string | null;
}
const states: Record<string, string> = { OPEN: '等待文件', RECEIVING: '正在接收', UPLOADED: '文件已收到，待提交检查', QUEUED: '等待检查', PROCESSING: '检查与生成预览', READY: '可预览', FAILED: '失败', CANCELLED: '已取消', QUARANTINED: '已隔离' };
const errors: Record<string, string> = { IMAGE_REJECTED: '文件损坏、不支持的编码或超过处理限制；图片请导出JPEG，视频请导出H.264/AAC MP4后重传', MEDIA_TYPE_INVALID: '真实类型与声明不符', MEDIA_CONTEXT_CHANGED: '来源或权限发生变化，请重新核对', UPLOAD_EXPIRED: '上传已过期', UPLOAD_INTERRUPTED: '文件未完整接收', MEDIA_DIGEST_INVALID: '文件校验不一致', MEDIA_IO_FAILED: '存储操作未完成，请联系维护人员' };
const terminal = (s: string) => ['READY', 'FAILED', 'CANCELLED'].includes(s);
const uncertain = (e: unknown) => e instanceof ApiError && e.unknownOutcome;
export function MediaPanel({ me, personId, source, compact = false, onReady }: {
    me: Me;
    personId?: string;
    source?: {
        id: string;
        revision: number;
    };
    compact?: boolean;
    onReady?:()=>void;
}) {
    const [refresh, setRefresh] = useState(0), [page, setPage] = useState(1), [selectedSource, setSource] = useState(source?.id ?? ''), [file, setFile] = useState<File | null>(null), [upload, setUpload] = useState<UploadDto | null>(null), [status, setStatus] = useState('');
    const createInput = useRef<Inputs['upload.create'] | null>(null), completeInput = useRef<{
        expectedRevision: number;
    } | null>(null);
    const fileControl = useRef<HTMLInputElement | null>(null);
    const a = useAction(), control = useAction();
    const sources = useLoad(() => me.permissions.includes('assets.upload') && !source ? read<Page<Source>>('source.list', {}, { pageSize: '100' }) : Promise.resolve({ items: [] } as unknown as Page<Source>), me.membershipId);
    const assets = useLoad(() => read<Page<AssetDto>>('asset.list', {}, { page: String(page), pageSize: '20', ...(personId ? { personId } : {}) }), [personId, page, refresh].join(':'));
    const uploads = useLoad(() => read<Page<UploadDto>>('upload.list', {}, { pageSize: '20' }), refresh);
    const freeze = a.busy || uncertain(a.error) || !!upload;
    useEffect(() => {
        if (!upload || terminal(upload.state))
            return;
        let alive = true;
        const timer = setInterval(() => {
            void read<UploadDto>('upload.get', { id: upload.id }).then(u => { if (alive) {
                setUpload(u);
                if (terminal(u.state)){
                    setRefresh(x => x + 1);if(u.state==='READY')onReady?.();}
            } }).catch(() => { if (alive)
                setStatus('状态读取失败，请手动核对；不会自动重新上传。'); });
        }, 2000);
        return () => { alive = false; clearInterval(timer); };
    }, [upload?.id, upload?.state]);
    async function proceed() {
        if (!file)
            throw new Error('请选择文件');
        if (!createInput.current) {
            const s = source ?? sources.data?.items.find(s => s.id === selectedSource);
            if (!s)
                throw new Error('请选择当前有权使用的来源');
            if (!['image/jpeg', 'image/png', 'image/webp','application/pdf','video/mp4'].includes(file.type) || file.size < 1 || file.size > (file.type==='application/pdf'?50000000:file.type==='video/mp4'?200000000:30000000))
                throw new Error('图片不超过30MB，PDF不超过50MB，精选MP4不超过200MB');
            setStatus('计算文件校验值…');
            const bytes = await file.arrayBuffer();
            const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
            createInput.current = { sourceId: s.id, expectedSourceRevision: s.revision, ...(personId ? { personId } : {}), fileName: file.name, mime: file.type as Inputs['upload.create']['mime'], expectedBytes: file.size, sha256 };
        }
        let u = upload;
        if (!u) {
            const receipt = await call<'upload.create', Receipt>('upload.create', createInput.current!);
            u = await read<UploadDto>('upload.get', { id: receipt.resourceId });
            setUpload(u);
        }
        else
            u = await read<UploadDto>('upload.get', { id: u.id });
        setUpload(u);
        if (completeInput.current) {
            await call('upload.complete', completeInput.current, { id: u.id });
            completeInput.current = null;
            u = await read<UploadDto>('upload.get', { id: u.id });
            setUpload(u);
        }
        if (u.state === 'OPEN') {
            setStatus('正在传输到私有隔离区…');
            const identity = await read<Me>('identity.me');
            let response: Response;
            try {
                response = await fetch('/api/v1/uploads/' + u.id + '/content', { method: 'PUT', body: file, credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': identity.csrfToken }, signal: AbortSignal.timeout(70000) });
            }
            catch {
                throw new ApiError('传输响应未知，请点击核对上传状态；不会覆盖已经收到的文件。', 'UPLOAD_OUTCOME_UNKNOWN', 0, '', true);
            }
            let body: unknown;
            try {
                body = await response.json();
            }
            catch {
                throw new ApiError('传输响应无法解析，请核对状态。', 'UPLOAD_OUTCOME_UNKNOWN', response.status, '', true);
            }
            if (!response.ok) {
                const e = (body as {
                    error?: {
                        message: string;
                        code: string;
                    };
                }).error;
                throw new ApiError(e?.message ?? '传输失败', e?.code ?? 'UPLOAD_FAILED', response.status);
            }
            u = body as UploadDto;
            setUpload(u);
        }
        if (u.state === 'UPLOADED') {
            completeInput.current = { expectedRevision: u.revision };
            await call('upload.complete', completeInput.current, { id: u.id });
            completeInput.current = null;
            u = await read<UploadDto>('upload.get', { id: u.id });
            setUpload(u);
        }
        setStatus(states[u.state] ?? u.state);
        setRefresh(x => x + 1);
    }
    return <section className="media-panel">{!compact && <PageTitle overline="PRIVATE MEDIA" title="私有素材" description="图片生成私有预览，支持H.264/AAC MP4受控播放。PDF只保存附件，解析交给外部Agent；原件通过受控导出下载。"/>}
        {compact && <h3>关联私有素材</h3>}<ErrorBox error={assets.error ?? sources.error ?? a.error ?? control.error}/>
        {me.mediaEnabled && me.permissions.includes('assets.upload') && <form className="panel padded" onSubmit={e => { e.preventDefault(); void a.run(proceed); }}>
            {!source && <Field label="文件资料来源"><select required disabled={freeze} value={selectedSource} onChange={e => { setSource(e.target.value); createInput.current = null; }}><option value="">选择当前有效来源</option>{sources.data?.items.filter(s => s.current).map(s => <option value={s.id} key={s.id}>{s.title}</option>)}</select></Field>}
            <Field label="选择图片、PDF或精选MP4"><input ref={fileControl} type="file" required={!file} accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4" disabled={freeze} onChange={e => { setFile(e.target.files?.[0] ?? null); createInput.current = null; }}/></Field>
            <p className="muted">预览会重新编码并移除元数据。图片随来源及原生访问范围管理，基本档案交接不会自动开放图片。</p>
            <div className="button-row"><Submit busy={a.busy}>{uncertain(a.error) || upload ? '核对上传状态并继续' : '上传并检查'}</Submit>{upload && terminal(upload.state) && !uncertain(a.error) && <button type="button" onClick={() => { setUpload(null); setFile(null); if (fileControl.current)
            fileControl.current.value = ''; createInput.current = null; completeInput.current = null; a.clear(); setStatus(''); }}>上传另一份</button>}</div>
            {status && <p role="status">{status}</p>}{upload && <p data-upload-state={upload.state}>状态：{states[upload.state]} {upload.errorCode && (errors[upload.errorCode] ?? upload.errorCode)}</p>}
        </form>}
        <div className="button-row"><button onClick={() => setRefresh(x => x + 1)}>刷新素材与上传状态</button></div>
        <div className="media-grid">{assets.data?.items.map(item => <article className="panel padded" key={item.id} data-asset-id={item.id}>
            {item.state === 'READY' && item.mime === 'application/pdf' ? <p>PDF附件 · 未解析，内容处理交给外部Agent</p> : item.state === 'READY' && item.mime === 'video/mp4' ? <PrivateVideo id={item.id} name={item.fileName}/> : item.state === 'READY' ? <img loading="lazy" className="private-preview" src={'/api/v1/assets/' + item.id + '/preview'} alt={'私有素材预览：' + item.fileName}/> : <p>已隔离，禁止读取预览</p>}
            <strong>{item.fileName}</strong><small>{item.width} × {item.height} · {(item.bytes / 1000000).toFixed(2)}MB · {states[item.state]}</small>
            {me.permissions.includes('sources.review') && item.state === 'READY' && <button className="danger" disabled={control.busy} onClick={() => { if (confirm('隔离后此图片将停止预览；本批暂不提供解除隔离。确认？'))
            void control.run(async () => { await call('asset.quarantine', { expectedRevision: item.revision }, { id: item.id }); setRefresh(x => x + 1); }); }}>隔离图片</button>}
        </article>)}</div>{assets.data?.items.length === 0 && <p className="muted">暂无当前可见的图片。</p>}
        {assets.data && <Pager page={page} pageSize={20} total={assets.data.total} setPage={setPage}/>}
        {!compact && <section className="panel padded"><h3>我的最近上传</h3>{uploads.data?.items.map(u => <div className="media-upload-row" key={u.id} data-upload-id={u.id}><span>{u.fileName} · {states[u.state]}{u.errorCode ? ' · ' + (errors[u.errorCode] ?? u.errorCode) : ''}</span><small>{date(u.expiresAt)}</small><div>
            {u.state === 'UPLOADED' && <button disabled={control.busy} onClick={() => void control.run(async () => { await call('upload.complete', { expectedRevision: u.revision }, { id: u.id }); setRefresh(x => x + 1); })}>提交检查</button>}
            {!terminal(u.state) && <button disabled={control.busy} onClick={() => void control.run(async () => { await call('upload.cancel', { expectedRevision: u.revision }, { id: u.id }); setRefresh(x => x + 1); })}>取消上传</button>}
        </div></div>)}</section>}
    </section>;
}

function PrivateVideo({id, name}: {id: string; name: string}) {
    const [error, setError] = useState(false);
    return <div><video className="private-preview" controls playsInline preload="none" aria-label={'播放视频：' + name}
        poster={'/api/v1/assets/' + id + '/preview'} src={'/api/v1/assets/' + id + '/playback'} onError={() => setError(true)}/>
        {error && <p role="alert">视频暂时无法播放，请刷新核对权限；格式不支持时请重新提供 H.264/AAC MP4。</p>}</div>;
}
