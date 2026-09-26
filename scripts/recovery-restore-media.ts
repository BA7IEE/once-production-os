/** DEV-09D restore private-media files from a backup-manifest v2 bundle into a fresh root. */
import { readBackupManifest } from '../apps/api/src/recovery/backup-manifest.ts';
import { restorePrivateMedia } from '../apps/api/src/recovery/media-backup.ts';

function usage(): never {
    console.error('Usage: pnpm recovery:restore-media -- --backup-manifest <path> --media-bundle <path> --target-root <fresh-path>');
    process.exit(2);
}
function args() {
    const out:{manifest?:string;bundle?:string;target?:string}={};
    const list=process.argv.slice(2);
    for(let i=0;i<list.length;i++){
        const arg=list[i]; if(arg==='--') continue;
        if(arg==='--backup-manifest') out.manifest=list[++i];
        else if(arg==='--media-bundle') out.bundle=list[++i];
        else if(arg==='--target-root') out.target=list[++i];
        else usage();
    }
    if(!out.manifest||!out.bundle||!out.target) usage();
    return out as {manifest:string;bundle:string;target:string};
}
const input=args();
try{
    const manifest=await readBackupManifest(input.manifest);
    if(manifest.media.provider==='disabled'){
        if(manifest.media.assetCount!==0) throw new Error('invalid disabled media manifest');
        console.log(JSON.stringify({mode:'RESTORE_MEDIA',provider:'disabled',assetCount:0,targetRoot:null},null,2));
    }else{
        await restorePrivateMedia(manifest.media,input.bundle,input.target);
        console.log(JSON.stringify({
            mode:'RESTORE_MEDIA',provider:'local',assetCount:manifest.media.assetCount,
            identityDigest:manifest.media.identityDigest,targetRoot:input.target
        },null,2));
    }
}catch{
    console.error('RESTORE_MEDIA_FAILED: target media root was not approved for use.');
    process.exitCode=1;
}
