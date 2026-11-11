import type {PortalMarker,PortalMarkerStorage} from './portal-command.ts';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function encodePortalMarker(marker:PortalMarker){
 if(!uuid.test(marker.owner)||!uuid.test(marker.key)||typeof marker.draft!=='boolean')throw new Error('请求核对标记无效');
 const binding=marker.cancelBinding;
 if(Object.hasOwn(marker,'cancelBinding')&&(typeof binding!=='string'||!/^v1:[0-9a-f]{64}$/.test(binding)||marker.draft))throw new Error('请求核对标记无效');
 if(Object.hasOwn(marker,'nonCancel')&&(marker.nonCancel!==true||binding))throw new Error('请求核对标记无效');
 // The cancel-only correlation is a salted request digest, not the request or its target.
 // It remains linkable metadata. Never save file names, bodies, credentials or receipts.
 return JSON.stringify({owner:marker.owner,key:marker.key,draft:marker.draft,...(binding?{cancelBinding:binding}:{}),...(marker.nonCancel?{nonCancel:true}:{})});
}
export const portalMarkers:PortalMarkerStorage={
 read(){const raw=sessionStorage.getItem('once-portal-pending');if(!raw)return null;return JSON.parse(encodePortalMarker(JSON.parse(raw))) as PortalMarker;},
 write(marker){sessionStorage.setItem('once-portal-pending',encodePortalMarker(marker));},
 remove(owner,key,binding,nonCancel){const current=this.read(owner);if(!current||current.owner!==owner||current.key!==key||current.cancelBinding!==binding||current.nonCancel!==nonCancel)throw new Error('请求标记已变化，请重新打开页面核对。');sessionStorage.removeItem('once-portal-pending');}
};
/** Homepage commands have their own markers so profile refresh cannot consume a publication receipt. */
export const homepageMarkers:PortalMarkerStorage={
 read(){const raw=sessionStorage.getItem('once-homepage-pending');if(!raw)return null;return JSON.parse(encodePortalMarker(JSON.parse(raw))) as PortalMarker;},
 write(marker){sessionStorage.setItem('once-homepage-pending',encodePortalMarker(marker));},
 remove(owner,key,binding,nonCancel){const current=this.read(owner);if(!current||current.owner!==owner||current.key!==key||current.cancelBinding!==binding||current.nonCancel!==nonCancel)throw new Error('请求标记已变化，请重新打开页面核对。');sessionStorage.removeItem('once-homepage-pending');}
};
