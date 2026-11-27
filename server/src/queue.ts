import crypto from 'node:crypto';
import { NotConnectedError } from './auth';
import { PinterestApiError, SafetyViolation, backoffMs } from './pinterest/client';
import type { AppState, Pin, PinterestService, QueueItem } from './types';

export const MAX_ATTEMPTS = 8;

export function enqueueSave(state: AppState, sessionId: string, pin: Pin, destBoardId: string, delayMs: number) {
  // Never queue a second copy of the same pin to the same board.
  const existing = state.queue.find(
    (q) => q.pin.id === pin.id && q.destBoardId === destBoardId && q.status !== 'failed',
  );
  if (existing) return existing;
  const failed = state.queue.find((q) => q.pin.id === pin.id && q.destBoardId === destBoardId);
  if (failed) {
    Object.assign(failed, { status: 'pending', attempts: 0, sendAfter: Date.now() + delayMs, nextAttemptAt: 0, sessionId });
    return failed;
  }
  const item: QueueItem = {
    id: crypto.randomUUID(),
    sessionId,
    pin,
    destBoardId,
    status: 'pending',
    attempts: 0,
    sendAfter: Date.now() + delayMs,
    nextAttemptAt: 0,
  };
  state.queue.push(item);
  return item;
}

/**
 * Cancel a save if it has not been sent yet.
 * Returns 'cancelled' or 'already-sent' (in which case nothing is deleted).
 */
export function cancelSave(state: AppState, pinId: string, destBoardId: string): 'cancelled' | 'already-sent' | 'none' {
  const idx = state.queue.findIndex((q) => q.pin.id === pinId && q.destBoardId === destBoardId);
  if (idx === -1) return 'none';
  const item = state.queue[idx];
  if (item.status === 'pending' || item.status === 'failed') {
    state.queue.splice(idx, 1);
    return 'cancelled';
  }
  return 'already-sent';
}

function describeError(err: unknown): { message: string; retryable: boolean; retryAfterMs?: number } {
  if (err instanceof PinterestApiError) {
    let message = err.message;
    if (err.status === 403) {
      message +=
        ' — If your Pinterest app has Trial access, write calls may be blocked until you are approved for Standard access.';
    }
    return { message, retryable: err.retryable, retryAfterMs: err.retryAfterMs };
  }
  if (err instanceof NotConnectedError) return { message: err.message, retryable: true, retryAfterMs: 60_000 };
  if (err instanceof SafetyViolation) return { message: err.message, retryable: false };
  return { message: (err as Error)?.message ?? String(err), retryable: true };
}

/** Process one due item. Returns true if something was attempted. */
export async function processNext(state: AppState, service: PinterestService, now = Date.now()) {
  const item = state.queue.find((q) => q.status === 'pending' && q.sendAfter <= now && q.nextAttemptAt <= now);
  if (!item) return false;

  item.status = 'sending';
  try {
    const result = await service.savePin(item.pin, item.destBoardId);
    item.status = 'done';
    item.createdPinId = result.createdPinId;
    item.doneAt = Date.now();
    item.lastError = undefined;
  } catch (err) {
    const { message, retryable, retryAfterMs } = describeError(err);
    item.attempts++;
    item.lastError = message;
    if (retryable && item.attempts < MAX_ATTEMPTS) {
      item.status = 'pending';
      item.nextAttemptAt = Date.now() + (retryAfterMs ?? backoffMs(item.attempts, 2000));
    } else {
      item.status = 'failed';
    }
  }
  return true;
}

export function queueSummary(state: AppState) {
  const count = (s: QueueItem['status']) => state.queue.filter((q) => q.status === s).length;
  const waiting = state.queue.filter((q) => q.status === 'pending' && q.attempts > 0);
  return {
    pending: count('pending'),
    sending: count('sending'),
    done: count('done'),
    failed: count('failed'),
    retrying: waiting.length,
    nextRetryAt: waiting.length ? Math.min(...waiting.map((q) => q.nextAttemptAt)) : null,
    failures: state.queue
      .filter((q) => q.status === 'failed')
      .map((q) => ({ id: q.id, pinTitle: q.pin.title, error: q.lastError, attempts: q.attempts })),
  };
}

export function retryFailed(state: AppState, id?: string) {
  let n = 0;
  for (const q of state.queue) {
    if (q.status === 'failed' && (!id || q.id === id)) {
      q.status = 'pending';
      q.attempts = 0;
      q.nextAttemptAt = 0;
      n++;
    }
  }
  return n;
}
