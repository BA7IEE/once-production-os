import {test} from 'node:test';
import {fixture} from '../support/fixtures.ts';
import {verifyLegacyProjection,verifyDelegatedLegacyProjection} from '../support/talent-legacy-projection.ts';
test('Phase C legacy reads use current typed facts and reject stale professional writes/evidence',async()=>{const f=await fixture();await verifyLegacyProjection(f.owner);});
test('Phase C basic handoff never exposes typed professional facts outside current native scope',async()=>{const f=await fixture();await verifyDelegatedLegacyProjection(f.owner,f.clock.now());});
