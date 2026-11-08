import type {RouteDefinition} from './routes.ts';
import {HomepageSchemas as S} from './professional-homepage-schema.ts';
import {v} from './validation.ts';
export const HOMEPAGE_OWNER_ROUTES:RouteDefinition[]=[
 {method:'GET',path:'/portal/homepage-options/{id}',operation:'portal.homepage.options',mode:'READ'},
 {method:'GET',path:'/portal/homepages',operation:'portal.homepage.list',mode:'READ'},
 {method:'POST',path:'/portal/homepages',operation:'portal.homepage.create',mode:'COMMAND',schema:S.create},
 {method:'GET',path:'/portal/homepages/{id}',operation:'portal.homepage.get',mode:'READ'},
 {method:'PATCH',path:'/portal/homepages/{id}',operation:'portal.homepage.save',mode:'COMMAND',schema:S.save},
 {method:'GET',path:'/portal/homepages/{id}/preview',operation:'portal.homepage.preview',mode:'READ'},
 {method:'GET',path:'/portal/homepages/{id}/qr',operation:'portal.homepage.qr',mode:'READ'},
 {method:'GET',path:'/portal/homepages/{id}/export',operation:'portal.homepage.export',mode:'READ'},
 {method:'GET',path:'/portal/homepages/{id}/activity',operation:'portal.homepage.activity',mode:'READ'},
 {method:'POST',path:'/portal/homepages/{id}/copy-link',operation:'portal.homepage.copyLink',mode:'COMMAND',schema:v.object({})},
 {method:'POST',path:'/portal/homepages/{id}/qr-download',operation:'portal.homepage.qrDownload',mode:'COMMAND',schema:v.object({})},
 {method:'POST',path:'/portal/homepages/{id}/publish',operation:'portal.homepage.publish',mode:'COMMAND',schema:S.publish},
 {method:'POST',path:'/portal/homepages/{id}/unpublish',operation:'portal.homepage.unpublish',mode:'COMMAND',schema:S.unpublish},
];
export const HOMEPAGE_PUBLIC_ROUTES:RouteDefinition[]=[
 {method:'GET',path:'/public/homepages/{slug}',operation:'homepage.public.read',mode:'READ'},
 ...(['preview','attachment','playback'] as const).map(part=>({method:'GET' as const,path:'/public/homepages/{slug}/media/{key}/'+part,operation:'homepage.media.'+part,mode:'BINARY' as const})),
];
