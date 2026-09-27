import {constants,openSync,fstatSync,readFileSync,closeSync} from 'node:fs';
import {AppError} from '../packages/core/src/errors.ts';
import {RebuildSchemas} from '../packages/core/src/rebuild-validation.ts';
import {transferRows} from '../packages/core/src/talent-transfer.ts';
import type {CredentialRebuildKeys} from '../packages/core/src/credential-transfer-crypto.ts';

/** Read keys before entering the database transaction. Never include paths or contents in errors. */
function readPrivateKey(path:string|undefined):Buffer {
    let fd:number|undefined;
    try {
        if(!path)throw new Error();
        fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
        const stat=fstatSync(fd);
        if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size<64||stat.size>128)throw new Error();
        const text=readFileSync(fd,'utf8').trim();
        if(!/^[a-f0-9]{64}$/i.test(text))throw new Error();
        return Buffer.from(text,'hex');
    } catch {throw new AppError(422,'REBUILD_CREDENTIAL_KEY_FILE_INVALID','编号迁移需设置 REBUILD_SOURCE_CONTACT_KEY_FILE 和 CONTACT_KEY_FILE；文件须私有、有效且不是符号链接');}
    finally {if(fd!==undefined)closeSync(fd);}
}
export function loadCredentialRebuildKeys(payload:unknown,env:NodeJS.ProcessEnv):CredentialRebuildKeys|undefined {
    const parsed=RebuildSchemas.payload.parse(payload);
    if(!parsed.manifest.talent||!transferRows(parsed.manifest.talent,'personCredentials').some(r=>r.data.identifierCiphertext))return undefined;
    return {sourceContactKey:readPrivateKey(env.REBUILD_SOURCE_CONTACT_KEY_FILE),targetContactKey:readPrivateKey(env.CONTACT_KEY_FILE)};
}
