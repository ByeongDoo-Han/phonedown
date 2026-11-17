// AdMob server-side verification (SSV) helpers.
// https://developers.google.com/admob/android/ssv
//
// AdMob signs the callback query string (everything before `&signature=`) with an
// ECDSA P-256 key and sends the DER signature plus the key id. The verifier keys are
// published as SPKI DER (`base64`) under keyId values that rotate, so they are cached
// for an hour and refreshed once when an unknown key id arrives.

const DEFAULT_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEY_CACHE_MS = 60 * 60 * 1000;

export type SsvCallback = {
  content: string;
  signature: string;
  keyId: number;
  params: URLSearchParams;
};

export type SsvVerification =
  | { ok: true; params: URLSearchParams }
  | { ok: false; reason: string };

type KeyCache = { url: string; keys: Map<number, CryptoKey>; fetchedAt: number };

let keyCache: KeyCache | null = null;

export function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function readLength(bytes: Uint8Array, offset: number): { length: number; next: number } {
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  let length = 0;
  for (let index = 0; index < count; index += 1) {
    length = length * 256 + bytes[offset + 1 + index];
  }
  return { length, next: offset + 1 + count };
}

// WebCrypto expects the raw r||s pair; AdMob signs with DER-encoded ECDSA.
export function derToRaw(signature: Uint8Array): Uint8Array {
  if (signature.length === 64) return signature;
  if (signature[0] !== 0x30) throw new Error('Unsupported signature encoding');
  let offset = 1;
  const sequence = readLength(signature, offset);
  offset = sequence.next;
  const readInteger = () => {
    if (signature[offset] !== 0x02) throw new Error('Unsupported signature encoding');
    offset += 1;
    const { length, next } = readLength(signature, offset);
    offset = next;
    let value = signature.slice(offset, offset + length);
    offset += length;
    while (value.length > 32 && value[0] === 0x00) value = value.slice(1);
    if (value.length > 32) throw new Error('Unsupported signature size');
    return value;
  };
  const r = readInteger();
  const s = readInteger();
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

export function parseSsvCallback(callbackUrl: URL): SsvCallback | null {
  const query = callbackUrl.search.replace(/^\?/, '');
  const signatureMarker = query.indexOf('&signature=');
  if (signatureMarker < 0) return null;
  const content = query.slice(0, signatureMarker);
  const tail = query.slice(signatureMarker + 1);
  const keyMarker = tail.indexOf('&key_id=');
  if (keyMarker < 0) return null;
  const signature = tail.slice('signature='.length, keyMarker);
  const keyId = Number(tail.slice(keyMarker + '&key_id='.length));
  if (!content || !signature || !Number.isInteger(keyId)) return null;
  return { content, signature, keyId, params: callbackUrl.searchParams };
}

export async function loadVerifierKeys(options: {
  url?: string;
  fetcher?: typeof fetch;
  now?: number;
} = {}): Promise<Map<number, CryptoKey>> {
  const url = options.url ?? DEFAULT_KEYS_URL;
  const now = options.now ?? Date.now();
  if (keyCache && keyCache.url === url && now - keyCache.fetchedAt < KEY_CACHE_MS) {
    return keyCache.keys;
  }
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`AdMob verifier keys responded ${response.status}`);
  const body = await response.json() as { keys?: Array<{ keyId?: unknown; base64?: unknown }> };
  const keys = new Map<number, CryptoKey>();
  for (const entry of body.keys ?? []) {
    if (typeof entry.keyId !== 'number' || typeof entry.base64 !== 'string') continue;
    const key = await crypto.subtle.importKey('spki', toArrayBuffer(decodeBase64(entry.base64)),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    keys.set(entry.keyId, key);
  }
  if (keys.size === 0) throw new Error('No AdMob verifier keys available');
  keyCache = { url, keys, fetchedAt: now };
  return keys;
}

export function clearVerifierKeyCache() {
  keyCache = null;
}

export async function verifySsvSignature(
  content: string, signature: string, keys: Map<number, CryptoKey>, keyId: number,
): Promise<boolean> {
  const key = keys.get(keyId);
  if (!key) return false;
  try {
    const raw = derToRaw(decodeBase64(signature));
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key,
      toArrayBuffer(raw), new TextEncoder().encode(content));
  } catch {
    return false;
  }
}

export async function verifyAdMobSsv(
  callbackUrl: URL, options: { keysUrl?: string; fetcher?: typeof fetch } = {},
): Promise<SsvVerification> {
  const parsed = parseSsvCallback(callbackUrl);
  if (!parsed) return { ok: false, reason: 'missing_signature' };

  let keys = await loadVerifierKeys({ url: options.keysUrl, fetcher: options.fetcher });
  let valid = await verifySsvSignature(parsed.content, parsed.signature, keys, parsed.keyId);
  if (!valid && !keys.has(parsed.keyId)) {
    // The keys rotate; fetch once more before rejecting a callback signed with a new key.
    clearVerifierKeyCache();
    keys = await loadVerifierKeys({ url: options.keysUrl, fetcher: options.fetcher });
    valid = await verifySsvSignature(parsed.content, parsed.signature, keys, parsed.keyId);
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };
  return { ok: true, params: parsed.params };
}
