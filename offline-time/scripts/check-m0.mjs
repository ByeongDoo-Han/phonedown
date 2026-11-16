import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const statusPath = process.argv[2];
if (!statusPath) throw new Error('Usage: node scripts/check-m0.mjs <supabase-status.json>');
const status = JSON.parse(await readFile(statusPath, 'utf8'));
const url = status.API_URL;
const anonKey = status.ANON_KEY;
const serviceKey = status.SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceKey, 'Local Supabase keys are missing');

const makeUserClient = () => createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const first = makeUserClient();
const second = makeUserClient();
const password = `Test-${crypto.randomUUID()}!`;
const createdIds = [];

try {
  const signupA = await first.auth.signUp({ email: `m0-a-${crypto.randomUUID()}@example.test`, password });
  assert.ifError(signupA.error);
  assert.ok(signupA.data.session && signupA.data.user, 'Email signup did not create a session');
  createdIds.push(signupA.data.user.id);

  const initial = await first.from('users').select('primary_mode,onboarded_at').eq('id', signupA.data.user.id).single();
  assert.ifError(initial.error);
  assert.equal(initial.data.primary_mode, 'both');
  assert.equal(initial.data.onboarded_at, null);

  const updated = await first.from('users')
    .update({ primary_mode: 'focus', onboarded_at: new Date().toISOString() })
    .eq('id', signupA.data.user.id).select('primary_mode,onboarded_at').single();
  assert.ifError(updated.error);
  assert.equal(updated.data.primary_mode, 'focus');
  assert.ok(updated.data.onboarded_at);

  const signupB = await second.auth.signUp({ email: `m0-b-${crypto.randomUUID()}@example.test`, password });
  assert.ifError(signupB.error);
  assert.ok(signupB.data.user);
  createdIds.push(signupB.data.user.id);
  const crossRead = await second.from('users').select('id').eq('id', signupA.data.user.id);
  assert.ifError(crossRead.error);
  assert.deepEqual(crossRead.data, []);

  console.log('PASS: email signup creates profile, onboarding persists, and RLS isolates profiles');
} finally {
  for (const id of createdIds) {
    const deleted = await admin.auth.admin.deleteUser(id);
    assert.ifError(deleted.error);
  }
}
