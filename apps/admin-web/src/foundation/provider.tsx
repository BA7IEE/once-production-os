import type {ReactNode} from 'react';
import {App,ConfigProvider} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {onceTheme} from './theme.ts';
export function AdminProvider({children}:{children:ReactNode}) {
 return <ConfigProvider locale={zhCN} theme={onceTheme} componentSize="middle"><App className="once-foundation">{children}</App></ConfigProvider>;
}
