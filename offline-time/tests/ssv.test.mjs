import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import { clearVerifierKeyCache, decodeBase64, derToRaw, parseSsvCallback,
  verifyAdMobSsv } from '../supabase/functions/_shared/ssv.ts';

const KEY_ID = 1916455855;

function makeKeys(fetcher) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const json = { keys: [{ keyId: KEY_ID, base64: spki }] };
  const stub = fetcher ?? (async () => ({ ok: true, json: async () => json }));
  const signContent = (content) => sign('sha256', Buffer.from(content, 'utf8'),
    { key: privateKey, dsaEncoding: 'der' }).toString('base64url');
  return { signContent, fetcher: stub };
}

function callbackUrl(content, signature, keyId = KEY_ID) {
  return new URL(`https://project.supabase.co/functions/v1/ad-reward-ssv?${content}&signature=${signature}&key_id=${keyId}`);
}

test('a correctly signed AdMob callback verifies', async () => {
  clearVerifierKeyCache();
  const keys = makeKeys();
  const customData = encodeURIComponent(JSON.stringify({ v: 1, kind: 'weekly_box' }));
  const content = `ad_network=5450213213286189855&ad_unit=1234567890&reward_amount=1&reward_item=point`
    + `&timestamp=1700000000&transaction_id=abc123&user_id=11111111-1111-4111-8111-111111111111`
    + `&custom_data=${customData}`;
  const url = callbackUrl(content, keys.signContent(content));
  assert.deepEqual(parseSsvCallback(url)?.content, content);

  const result = await verifyAdMobSsv(url, {
    fetcher: keys.fetcher,
    keysUrl: 'https://keys.test/one.json',
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.params.get('transaction_id'), 'abc123');
});

test('a tampered callback is rejected', async () => {
  clearVerifierKeyCache();
  const keys = makeKeys();
  const content = 'ad_network=1&transaction_id=abc123&user_id=11111111-1111-4111-8111-111111111111';
  const signature = keys.signContent(content);
  const tampered = callbackUrl(`${content}&custom_data=changed`, signature);
  const result = await verifyAdMobSsv(tampered, { fetcher: keys.fetcher, keysUrl: 'https://keys.test/two.json' });
  assert.deepEqual(result, { ok: false, reason: 'bad_signature' });
});

test('a callback without a signature is rejected before any key fetch', async () => {
  let fetched = false;
  const result = await verifyAdMobSsv(new URL('https://project.supabase.co/ssv?ad_network=1&transaction_id=abc'),
    { fetcher: async () => { fetched = true; throw new Error('must not fetch'); } });
  assert.deepEqual(result, { ok: false, reason: 'missing_signature' });
  assert.equal(fetched, false);
});

test('DER signatures become the raw r||s pair WebCrypto expects', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const der = sign('sha256', Buffer.from('payload'), { key: privateKey, dsaEncoding: 'der' });
  const raw = derToRaw(new Uint8Array(der));
  assert.equal(raw.length, 64);
  assert.equal(derToRaw(raw).length, 64);
  assert.ok(publicKey.asymmetricKeyType === 'ec');
});

test('verifier keys decode from standard base64', () => {
  const bytes = decodeBase64('AAEC');
  assert.deepEqual([...bytes], [0, 1, 2]);
});
