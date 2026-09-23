import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson, parseStrictJson, digest } from '../../packages/core/src/json.ts';
import { Schemas, dateIso } from '../../packages/core/src/validation.ts';
import { encryptContact, decryptContact, verifyPassword, passwordHash } from '../../packages/core/src/crypto.ts';
import { randomBytes } from 'node:crypto';
for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"__proto__":{}}', '{"constructor":1}', '[1,]', '01', '1e400', '9007199254740992', '{"a":"\\ud800"}', '{}x', '{"a":NaN}']) {
    test('strict JSON rejects ' + raw, () => assert.throws(() => parseStrictJson(raw)));
}
test('strict JSON accepts escaped strings and supplementary characters', () => { const s = '{"z":"a\\\"b","a":"\\ud83d\\ude00","n":-0.25e+2}'; assert.equal(canonicalJson(parseStrictJson(s)), '{"a":"😀","n":-25,"z":"a\\\"b"}'); });
test('canonical field order does not change digest', () => assert.equal(digest({ b: 2, a: 1 }), digest({ a: 1, b: 2 })));
// Unsafe integer values are rejected by the selected input profile, rather than claimed as full JCS.
test('canonical rejects integers outside safe range', () => assert.throws(() => canonicalJson({ x: 1e21 })));
test('canonical subset vector', () => assert.equal(canonicalJson({ z: -0, e: 1e-7, s: '\n' }), '{"e":1e-7,"s":"\\n","z":0}'));
test('canonical does not normalize Unicode or trim source content', () => { assert.notEqual(digest('é'), digest('e\u0301')); assert.notEqual(digest('a'), digest('a ')); });
test('strict JSON rejects excessive nesting', () => assert.throws(() => parseStrictJson('['.repeat(30) + '0' + ']'.repeat(30))));
test('body size cap is bytes', () => assert.throws(() => parseStrictJson('"' + '人'.repeat(400000) + '"')));
test('DTO rejects contact injection in normal person fields', () => assert.throws(() => Schemas.personPatch.parse({ expectedRevision: 1, phone: 'private' })));
test('DTO rejects caller-supplied workspace', () => assert.throws(() => Schemas.personCreate.parse({ displayName: 'A', roles: ['model'], workspaceId: 'x' })));
test('date validation rejects normalized invalid date', () => assert.throws(() => dateIso.parse('2026-02-30T00:00:00.000Z')));
test('explicit null height remains null', () => assert.equal(Schemas.personPatch.parse({ expectedRevision: 1, heightCm: null }).heightCm, null));
test('omitted keys are not emitted', () => assert.deepEqual(Object.keys(Schemas.personPatch.parse({ expectedRevision: 1, intro: 'ok' })), ['expectedRevision', 'intro']));
test('AES-GCM roundtrip, random ciphertext and wrong-key rejection', () => { const key = randomBytes(32); const a = encryptContact('合成联系人', key); const b = encryptContact('合成联系人', key); assert.notEqual(a, b); assert.equal(decryptContact(a, key), '合成联系人'); assert.throws(() => decryptContact(a, randomBytes(32))); });
test('scrypt verifies only correct password', async () => { const hash = await passwordHash('Synthetic-long-password'); assert.equal(await verifyPassword('Synthetic-long-password', hash), true); assert.equal(await verifyPassword('wrong', hash), false); assert.equal(await verifyPassword('x', null), false); });
test('contact decryption rejects trailing ciphertext components and malformed encoding', () => { const key = randomBytes(32); const encrypted = encryptContact('合成测试', key, 'context'); assert.throws(() => decryptContact(encrypted + '.ignored', key, 'context')); assert.throws(() => decryptContact('v1.bad..encoding', key, 'context')); });
test('password verifier rejects a valid hash with trailing serialized components', async () => { const hash = await passwordHash('Synthetic-long-password'); assert.equal(await verifyPassword('Synthetic-long-password', hash + '$ignored'), false); });
