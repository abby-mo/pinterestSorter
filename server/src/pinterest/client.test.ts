import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertAllowed, PinterestApiError, SafePinterestClient, SafetyViolation } from './client';

test('allows only read calls, board creation, and pin copies', () => {
  assertAllowed('GET', '/user_account');
  assertAllowed('GET', '/boards');
  assertAllowed('GET', '/boards/123/pins');
  assertAllowed('POST', '/boards');
  assertAllowed('POST', '/pins/987/save');
  assertAllowed('POST', '/pins');
});

test('blocks every destructive or modifying call', () => {
  const blocked: Array<[string, string]> = [
    ['DELETE', '/pins/987'],
    ['DELETE', '/boards/123'],
    ['PATCH', '/pins/987'],
    ['PATCH', '/boards/123'],
    ['PUT', '/pins/987'],
    ['POST', '/boards/123/sections'],
    ['POST', '/pins/987'],
    ['POST', '/pins/987/save/../delete'],
    ['GET', '/pins/../boards/1/delete'],
  ];
  for (const [method, path] of blocked) {
    assert.throws(() => assertAllowed(method, path), SafetyViolation, `${method} ${path} should be blocked`);
  }
});

test('client refuses a blocked call before any network request', async () => {
  let calls = 0;
  const client = new SafePinterestClient({
    baseUrl: 'https://api.example.test/v5',
    getToken: async () => 't',
    refreshToken: async () => 't',
    fetchImpl: (async () => {
      calls++;
      return new Response('{}');
    }) as typeof fetch,
  });
  // @ts-expect-error DELETE is not even a valid method type
  await assert.rejects(client.request('DELETE', '/pins/1'), SafetyViolation);
  assert.equal(calls, 0);
});

test('GET retries on 429 then succeeds; follows bookmarks', async () => {
  const responses = [
    new Response('{"message":"slow down"}', { status: 429, headers: { 'retry-after': '0' } }),
    new Response(JSON.stringify({ items: [1, 2], bookmark: 'b2' })),
    new Response(JSON.stringify({ items: [3], bookmark: null })),
  ];
  const urls: string[] = [];
  const client = new SafePinterestClient({
    baseUrl: 'https://api.example.test/v5',
    getToken: async () => 't',
    refreshToken: async () => 't',
    fetchImpl: (async (url: URL) => {
      urls.push(String(url));
      return responses.shift()!;
    }) as unknown as typeof fetch,
  });
  const items: number[] = [];
  for await (const i of client.paginate<number>('/boards')) items.push(i);
  assert.deepEqual(items, [1, 2, 3]);
  assert.equal(urls.length, 3);
  assert.match(urls[2], /bookmark=b2/);
});

test('POST is not retried automatically (the save queue owns retries)', async () => {
  let calls = 0;
  const client = new SafePinterestClient({
    baseUrl: 'https://api.example.test/v5',
    getToken: async () => 't',
    refreshToken: async () => 't',
    fetchImpl: (async () => {
      calls++;
      return new Response('{"message":"oops"}', { status: 503 });
    }) as typeof fetch,
  });
  await assert.rejects(client.request('POST', '/pins/1/save', { body: { board_id: '2' } }), (e: unknown) => {
    assert.ok(e instanceof PinterestApiError);
    assert.equal(e.status, 503);
    assert.equal(e.retryable, true);
    return true;
  });
  assert.equal(calls, 1);
});
