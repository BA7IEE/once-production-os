import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from '../support/fixtures.ts';
import {verifySourcePersonErasure} from '../support/talent-source-person-erasure.ts';
test('TD2 source-owned identities and complete professional graphs erase atomically, preserving independent people and original files',async()=>{
 const root=await mkdtemp(join(await realpath(tmpdir()),'once-source-person-'));
 try{await verifySourcePersonErasure(await fixture(),root);}finally{await rm(root,{recursive:true,force:true});}
});
