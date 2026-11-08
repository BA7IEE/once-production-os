import {useState,type ReactNode} from 'react';
import {StyleProvider} from '@ant-design/cssinjs';
import {App,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {onceTheme} from './theme.ts';
export function AdminProvider({children}:{children:ReactNode}) {
 // All fixed theme styles are baked to once-components.css. Keep the library's
 // runtime cache outside the live document; no inline stylesheet is authorized.
 const [styleCacheContainer]=useState(()=>typeof document==='undefined'?undefined:document.createElement('div'));
 return <StyleProvider container={styleCacheContainer}><ConfigProvider iconPrefixCls="anticon" wave={{disabled:true}} locale={zhCN} theme={{...onceTheme,zeroRuntime:!!styleCacheContainer}} componentSize="middle"><App className="once-foundation">{children}</App></ConfigProvider></StyleProvider>;
}
