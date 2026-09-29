import {decryptContact,encryptContact} from './crypto.ts';
import {invariant} from './errors.ts';
import {v} from './validation.ts';
import {transferRows,type TalentTransfer,type TransferRow} from './talent-transfer.ts';

export interface CredentialRebuildKeys {sourceContactKey:Buffer;targetContactKey:Buffer}
const identifier=v.string(180,1);
function plaintext(bundle:TalentTransfer,row:TransferRow,keys?:CredentialRebuildKeys):string {
    invariant(keys?.sourceContactKey.length===32&&keys.targetContactKey.length===32,'REBUILD_CREDENTIAL_KEYS_REQUIRED','加密编号重建需要原环境和目标环境的有效密钥文件',422);
    invariant(bundle.identifierContextWorkspaceId,'REBUILD_CREDENTIAL_CONTEXT_REQUIRED','加密编号缺少原工作空间绑定',422);
    let value:string;
    try {value=identifier.parse(decryptContact(String(row.data.identifierCiphertext),keys.sourceContactKey,`credential:${bundle.identifierContextWorkspaceId}:${row.id}`));}
    catch {invariant(false,'REBUILD_CREDENTIAL_DECRYPT_FAILED','资质编号解密或校验失败；未写入资料',422);}
    invariant(row.data.maskedIdentifier==='***'+value.slice(-4),'REBUILD_CREDENTIAL_MASK_MISMATCH','资质编号遮罩与密文不一致',422);
    return value;
}
/** AES-GCM work is bounded by the transfer record limit; no file I/O or KDF in transactions. */
export function validateCredentialKeys(bundle:TalentTransfer,keys?:CredentialRebuildKeys) {
    for(const row of transferRows(bundle,'personCredentials')) if(row.data.identifierCiphertext) plaintext(bundle,row,keys);
}
export function rekeyCredential(bundle:TalentTransfer,row:TransferRow,targetWorkspaceId:string,keys?:CredentialRebuildKeys) {
    if(!row.data.identifierCiphertext)return row.data;
    const value=plaintext(bundle,row,keys);
    return {...row.data,identifierCiphertext:encryptContact(value,keys!.targetContactKey,`credential:${targetWorkspaceId}:${row.id}`)};
}
