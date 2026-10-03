import type {PortalMarker,PortalMarkerStorage} from './portal-command.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function encodePortalMarker(marker:PortalMarker){
 if(!uuid.test(marker.owner)||!uuid.test(marker.key)||typeof marker.draft!=='boolean')throw new Error('请求核对标记无效');
 // Deliberately discard every other property, including receipt, body and original text.
 return JSON.stringify({owner:marker.owner,key:marker.key,draft:marker.draft});
}
export const portalMarkers:PortalMarkerStorage={
 read(owner){const raw=sessionStorage.getItem('once-portal-pending');if(!raw)return null;const parsed=JSON.parse(raw);encodePortalMarker(parsed);return {owner:parsed.owner,key:parsed.key,draft:parsed.draft};},
 write(marker){sessionStorage.setItem('once-portal-pending',encodePortalMarker(marker));},
 remove(owner){const current=this.read(owner);if(current?.owner!==owner)throw new Error('请使用原人才账号核对');sessionStorage.removeItem('once-portal-pending');}
};
