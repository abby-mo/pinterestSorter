import { useEffect, useState } from 'react';
import { api } from '../api';
import type { QueueSummary } from '../types';
import { Icon } from './ui';

export function useQueue(intervalMs = 1500) {
  const [queue, setQueue] = useState<QueueSummary | null>(null);
  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .queue()
        .then((q) => alive && setQueue(q))
        .catch(() => {});
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [intervalMs]);
  return queue;
}

export function SyncStatus({ queue }: { queue: QueueSummary | null }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  if (!queue) return null;

  const inFlight = queue.pending + queue.sending;
  let content;
  let tone = 'bg-chip text-ink';

  if (queue.failed > 0) {
    tone = 'bg-pin-red/10 text-pin-red';
    content = (
      <>
        {Icon.alert('size-4')}
        {queue.failed} failed
        <button
          className="ml-1 cursor-pointer underline underline-offset-2"
          onClick={() => api.retryQueue().catch(() => {})}
        >
          Retry
        </button>
      </>
    );
  } else if (queue.retrying > 0 && queue.nextRetryAt) {
    const secs = Math.max(0, Math.ceil((queue.nextRetryAt - Date.now()) / 1000));
    content = (
      <>
        {Icon.cloud('size-4')}
        {inFlight} waiting · retry in {secs}s
      </>
    );
  } else if (inFlight > 0) {
    content = (
      <>
        <span className="size-2 animate-pulse rounded-full bg-pin-red" />
        Saving {inFlight}…
      </>
    );
  } else {
    content = (
      <>
        {Icon.check('size-4')}
        All saved
      </>
    );
  }

  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-sm font-semibold ${tone}`}
      title={queue.failures.map((f) => `${f.pinTitle}: ${f.error}`).join('\n') || undefined}
      aria-live="polite"
    >
      {content}
    </span>
  );
}
