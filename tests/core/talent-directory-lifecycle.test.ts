import {test} from 'node:test';
import {mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fixture} from '../support/fixtures.ts';
import {verifyDirectoryLifecycle} from '../support/talent-directory-lifecycle.ts';
test('PR01b new fields and cover survive controlled transfer, recovery and merge, then erase through the frozen asset graph',async()=>{const f=await fixture(),target=await fixture(),root=await mkdtemp(join(await realpath(tmpdir()),'once-pr01b-lifecycle-'));try{await verifyDirectoryLifecycle(f,target,root);}finally{await rm(root,{recursive:true,force:true});}});
