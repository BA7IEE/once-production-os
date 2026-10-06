import type {ThemeConfig} from 'antd';
/** ONCE production desk: neutral paper, ink, restrained cobalt. */
export const onceTokens = {
 paper:'#faf9f6', surface:'#ffffff', ink:'#20242a', secondary:'#565e69',
 line:'#d7dbe1', cobalt:'#34558b', cobaltWash:'#eaf0f8',
 success:'#27654b', warning:'#805718', danger:'#ab333b', radius:6,
 font:'"Avenir Next", "PingFang SC", "Microsoft YaHei", sans-serif',
} as const;
export const onceTheme:ThemeConfig = {
 token:{colorPrimary:onceTokens.cobalt,colorInfo:onceTokens.cobalt,colorSuccess:onceTokens.success,
 colorWarning:onceTokens.warning,colorError:onceTokens.danger,colorText:onceTokens.ink,
 colorTextSecondary:onceTokens.secondary,colorBgLayout:onceTokens.paper,colorBgContainer:onceTokens.surface,
 colorBorder:onceTokens.line,borderRadius:onceTokens.radius,fontFamily:onceTokens.font,fontSize:14,
 controlHeight:36},
 components:{Table:{cellPaddingBlock:12,cellPaddingInline:16,headerBg:'#f2f3f5',headerColor:onceTokens.secondary},
 Menu:{itemHeight:42,itemSelectedBg:onceTokens.cobaltWash,itemSelectedColor:onceTokens.cobalt},
 Button:{fontWeight:600},Modal:{titleFontSize:20},Tag:{defaultBg:'#eef0f3',defaultColor:onceTokens.secondary}},
};
