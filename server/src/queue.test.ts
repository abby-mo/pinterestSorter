import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelSave, enqueueSave, processNext } from './queue';
import { PinterestApiError } from './pinterest/client';
import type { AppState, Pin, PinterestService } from './types';

const pin: Pin = {
  id: 'p1', title: 'Test', imageUrl: 'https://x/y.jpg', thumbUrl: 'https://x/y.jpg',
  width: 1, height: 1, boardId: 'b1', boardName: 'Source',
};

function fakeService(savePin: PinterestService['savePin']): PinterestService {
  return {
    getUser: async () => ({ username: 'u' }),
    listBoards: async () => [],
    listBoardPins: async () => [],
    createBoard: async () => { throw new Error('unused'); },
    savePin,
  };
}

test('saves wait for the undo window, and undo inside it cancels', async () => {
  const state: AppState = { sessions: {}, queue: [] };
  let sent = 0;
  const svc = fakeService(async () => { sent++; return {}; });
  enqueueSave(state, 's', pin, 'dest', 5000);
  assert.equal(await processNext(state, svc), false, 'not sent during grace window');
  assert.equal(cancelSave(state, 'p1', 'dest'), 'cancelled');
  assert.equal(state.queue.length, 0);
  assert.equal(sent, 0);
});

test('undo after sending never deletes anything', async () => {
  const state: AppState = { sessions: {}, queue: [] };
  const svc = fakeService(async () => ({ createdPinId: 'copy' }));
  enqueueSave(state, 's', pin, 'dest', 0);
  await processNext(state, svc);
  assert.equal(state.queue[0].status, 'done');
  assert.equal(cancelSave(state, 'p1', 'dest'), 'already-sent');
  assert.equal(state.queue.length, 1);
});

test('rate-limited saves are retried later; 403 fails without retry', async () => {
  const state: AppState = { sessions: {}, queue: [] };
  enqueueSave(state, 's', pin, 'dest', 0);
  await processNext(state, fakeService(async () => { throw new PinterestApiError(429, 'slow', 3000); }));
  const item = state.queue[0];
  assert.equal(item.status, 'pending');
  assert.equal(item.attempts, 1);
  assert.ok(item.nextAttemptAt > Date.now() + 2000);

  item.nextAttemptAt = 0;
  await processNext(state, fakeService(async () => { throw new PinterestApiError(403, 'forbidden'); }));
  assert.equal(item.status, 'failed');
});

test('the same pin is never queued twice for one board', () => {
  const state: AppState = { sessions: {}, queue: [] };
  enqueueSave(state, 's', pin, 'dest', 0);
  enqueueSave(state, 's', pin, 'dest', 0);
  assert.equal(state.queue.length, 1);
});
