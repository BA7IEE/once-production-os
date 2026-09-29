import {useState,type ReactNode} from 'react';
import {useNavigate,useLocation} from 'react-router';
import {Button,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {AppstoreOutlined,TeamOutlined,PictureOutlined,ProjectOutlined,UnorderedListOutlined,FolderOutlined,ToolOutlined,SettingOutlined,MenuFoldOutlined,MenuUnfoldOutlined} from '@ant-design/icons';
import type {Me} from '../dto.ts';
import {navigationFor,routeFor} from './navigation.ts';
import {NavigationGuard} from './surface.tsx';
import 'antd/dist/antd.css';
import './product.css';
const icons=[AppstoreOutlined,TeamOutlined,PictureOutlined,ProjectOutlined,UnorderedListOutlined,FolderOutlined];
export function WorkspaceLayout({me,children}:{me:Me;children:ReactNode}){
 const navigate=useNavigate(),location=useLocation(),[collapsed,setCollapsed]=useState(false);
 const pages=navigationFor(me.permissions),current=routeFor(location.pathname);
 const nonce=document.querySelector<HTMLMetaElement>('meta[name=once-style-nonce]')?.content;
 return <ConfigProvider csp={nonce?{nonce}:undefined} locale={zhCN} theme={{zeroRuntime:true,token:{colorPrimary:'#245d49',borderRadius:6,fontSize:14}}}><NavigationGuard/><div className={'product-shell'+(collapsed?' is-collapsed':'')}><aside className="product-sidebar"><div className="product-brand"><strong>ONCE</strong>{!collapsed&&<span>工作后台</span>}</div><nav aria-label="主导航">{['日常工作','工具与协作','系统设置'].map(group=>{const rows=pages.filter(p=>p.group===group);return rows.length>0&&<details key={group} open={group==='日常工作'||rows.some(p=>p.key===current?.key)}><summary>{collapsed?group.slice(0,2):group}</summary>{rows.map(p=>{const Icon=icons[['dashboard','people','works','projects','shortlists','media'].indexOf(p.key)]??(group==='系统设置'?SettingOutlined:ToolOutlined);return <button key={p.key} title={p.label} aria-current={current?.key===p.key?'page':undefined} onClick={()=>navigate(p.path)}><Icon aria-hidden="true"/>{!collapsed&&<span>{p.label}</span>}</button>;})}</details>;})}</nav><button className="product-account" aria-label="账号设置" onClick={()=>navigate('/account')}><span className="avatar">{me.displayName.slice(0,1)}</span>{!collapsed&&<span>{me.displayName}<small>账号设置</small></span>}</button></aside><div className="product-main"><header className="product-topbar"><Button type="text" aria-label={collapsed?'展开导航':'收起导航'} icon={collapsed?<MenuUnfoldOutlined/>:<MenuFoldOutlined/>} onClick={()=>setCollapsed(v=>!v)}/><span>{current?.group} / <strong>{current?.label??'页面不可用'}</strong></span><span className="product-environment">内部工作空间</span></header><main className="product-content" id="main-content">{children}</main></div></div></ConfigProvider>;
}
