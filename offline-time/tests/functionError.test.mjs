import assert from 'node:assert/strict';
import test from 'node:test';

import { describeFunctionError } from '../src/lib/functionError.ts';

test('the server message and status come out of a non-2xx response', async () => {
  const error = { context: new Response(JSON.stringify({ error: '운영자 권한이 없습니다.' }), { status: 403 }) };
  assert.deepEqual(await describeFunctionError(error), { message: '운영자 권한이 없습니다.', status: 403 });
});

test('a response without a readable body still reports its status', async () => {
  const error = { context: new Response('<html>bad gateway</html>', { status: 502 }) };
  assert.deepEqual(await describeFunctionError(error), { message: '', status: 502 });
  const empty = { context: new Response(JSON.stringify({}), { status: 500 }) };
  assert.deepEqual(await describeFunctionError(empty), { message: '', status: 500 });
});

test('a plain error keeps its own message and no status', async () => {
  assert.deepEqual(await describeFunctionError(new Error('Failed to fetch')),
    { message: 'Failed to fetch', status: null });
  assert.deepEqual(await describeFunctionError(null), { message: '', status: null });
});
