import {Alert,Button,Empty as AntEmpty,Modal as AntModal,Pagination,Tag as AntTag} from 'antd';
import {PageContainer} from '@ant-design/pro-components';
import { useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { ApiError } from './api.ts';
export const labels: Record<string, string> = { DRAFT: '草稿', ACTIVE: '在库', ARCHIVED: '已归档', RECEIVED: '临时整理', CONFIRMED: '已核验', SUSPENDED: '已暂停', PENDING: '待激活', DISABLED: '已停用', ADMIN: '管理员', EDITOR: '资料维护', REVIEWER: '资料核验', VIEWER: '只读成员', QUEUED: '排队中', RUNNING: '处理中', SUCCEEDED: '已完成', READY: '可下载', REVOKED: '已撤销', ERASED: '已擦除', BLOCKED_FOR_USE: '已阻断使用', CLEANING: '清理中', COMPLETED: '已完成删除', RETAINED_WITH_BASIS: '有据保留后完成', FAILED: '失败', VALID: '可导入', INVALID: '需修正', IMPORTED: '已导入', VERIFIED: '已确认', STALE: '需重新确认' };
export function date(value: string | null | undefined) {
    if (!value)
        return '—';
    return new Date(value).toLocaleString('zh-CN', { hour12: false });
}
export function ErrorBox({ error }: {
    error: unknown;
}) {
    if (!error)
        return null;
    return <Alert className="once-error" type="error" showIcon title={error instanceof Error ? error.message : '操作未完成'} description={<>{error instanceof ApiError && error.requestId && <small>请求编号：{error.requestId}</small>}{error instanceof ApiError && error.code === 'REVISION_CONFLICT' && <p>其他人可能已经修改这条资料。当前表单不会被自动覆盖；请在另一窗口核对新版本后再决定如何保存。</p>}</>} />;
}
export function Tag({ value }: {
    value: string;
}) { return <AntTag color={['FAILED','REVOKED','ERASED','DISABLED','BLOCKED_FOR_USE'].includes(value)?'error':['CONFIRMED','ACTIVE','SUCCEEDED','VERIFIED','COMPLETED'].includes(value)?'success':['PENDING','QUEUED','STALE','DRAFT','SUSPENDED'].includes(value)?'warning':undefined}>{labels[value] ?? value}</AntTag>; }
export function Empty({ title, children }: {
    title: string;
    children?: ReactNode;
}) { return <AntEmpty className="empty" image={AntEmpty.PRESENTED_IMAGE_SIMPLE} description={<><h3>{title}</h3>{children && <p>{children}</p>}</>}/>; }
export { Field } from './field.ts';
export function Modal({ title, children, onClose, wide = false }: {
    title: string;
    children: ReactNode;
    onClose: () => void;
    wide?: boolean;
}) {
    return <AntModal open title={<h2 style={{margin:0,fontSize:20}}>{title}</h2>} closable={{'aria-label':'关闭'}} onCancel={onClose} footer={null} width={wide?1040:640} maskClosable={false} destroyOnHidden>{children}</AntModal>;
}
export function useLoad<T>(load: () => Promise<T>, key: string | number) {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [busy, setBusy] = useState(true);
    useEffect(() => {
        let active = true;
        setBusy(true);
        setError(null);
        load().then(v => {
            if (active)
                setData(v);
        }).catch(e => {
            if (active) {
                setError(e);
                setData(null);
            }
        }).finally(() => {
            if (active)
                setBusy(false);
        });
        return () => { active = false; };
    }, [key]);
    return { data, error, busy };
}
export function useAction() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<unknown>(null);
    const lock = useRef(false);
    return { busy, error, clear: () => setError(null), run: async (fn: () => Promise<void>) => {
            if (lock.current)
                return;
            lock.current = true;
            setBusy(true);
            setError(null);
            try {
                await fn();
            }
            catch (e) {
                setError(e);
            }
            finally {
                lock.current = false;
                setBusy(false);
            }
        } };
}
export function Submit({ busy, disabled = false, children = '保存' }: {
    busy: boolean;
    disabled?: boolean;
    children?: ReactNode;
}) { return <Button autoInsertSpace={false} htmlType="submit" type="primary" loading={busy} disabled={busy||disabled}>{busy ? '正在处理…' : children}</Button>; }
export function PageTitle({ overline, title, description, action }: {
    overline: string;
    title: string;
    description: string;
    action?: ReactNode;
}) { return <PageContainer className="once-page-title" header={{title:false,breadcrumb:undefined}}><div className="page-title"><div><span className="eyebrow">{overline}</span><h1>{title}</h1><p>{description}</p></div>{action}</div></PageContainer>; }
export function Pager({ page, pageSize, total, setPage }: {
    page: number;
    pageSize: number;
    total: number;
    setPage: (page: number) => void;
}) { return <div className="pager"><small>共 {total} 条 · 第 {page} 页</small><Pagination current={page} pageSize={pageSize} total={total} showSizeChanger={false} onChange={setPage} itemRender={(_n,type,original)=>type==='prev'?<button type="button" aria-label="上一页" disabled={page<=1}>‹</button>:type==='next'?<button type="button" aria-label="下一页" disabled={page*pageSize>=total}>›</button>:original}/></div>; }
export function prevent(e: FormEvent) { e.preventDefault(); }
