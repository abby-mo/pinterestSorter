import { useEffect, useState } from 'react';
import { api } from '../api';
import { Masonry, PinTile } from '../components/Masonry';
import { SyncStatus, useQueue } from '../components/SyncStatus';
import { Icon, PillButton, Spinner } from '../components/ui';
import type { Pin, SaveStatus, SessionMeta } from '../types';

type Item = { pin: Pin; status: SaveStatus; error: string | null };

export function SummaryPage({
  sessionId,
  onKeepSorting,
  onNewSession,
}: {
  sessionId: string;
  onKeepSorting: () => void;
  onNewSession: () => void;
}) {
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queue = useQueue(2000);

  // Refresh statuses whenever the queue changes.
  const queueKey = queue ? `${queue.pending}-${queue.sending}-${queue.done}-${queue.failed}` : '';
  useEffect(() => {
    api
      .saved(sessionId)
      .then((r) => {
        setSession(r.session);
        setItems(r.items);
      })
      .catch((e: Error) => setError(e.message));
  }, [sessionId, queueKey]);

  if (error) return <p className="p-10 text-center text-pin-red">{error}</p>;
  if (!items || !session) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const failed = items.filter((i) => i.status === 'failed');

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-16 sm:px-6">
      <section className="flex flex-col items-center pt-6 pb-10 text-center">
        <p className="text-sm font-semibold text-muted">{session.sourceName} →</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">{session.destBoardName}</h1>
        <p className="mt-3 text-muted">
          <strong className="text-ink">{session.saved}</strong> saved ·{' '}
          <strong className="text-ink">{session.skipped}</strong> skipped
        </p>
        <div className="mt-4">
          <SyncStatus queue={queue} />
        </div>
        <div className="mt-6 flex gap-2">
          <PillButton variant="primary" onClick={onKeepSorting}>
            Keep sorting
          </PillButton>
          <PillButton onClick={onNewSession}>New session</PillButton>
        </div>
      </section>

      {failed.length > 0 && (
        <div className="mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-2xl bg-pin-red/10 p-4 text-sm text-pin-red">
          {Icon.alert('size-5 mt-px')}
          <div className="flex-1">
            <p className="font-semibold">
              {failed.length} {failed.length === 1 ? 'pin' : 'pins'} couldn't be saved.
            </p>
            <p className="mt-0.5 text-ink/80">{failed[0].error}</p>
          </div>
          <PillButton size="sm" variant="primary" onClick={() => api.retryQueue().catch(() => {})}>
            Retry
          </PillButton>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center text-muted">
          <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-chip">{Icon.heart()}</span>
          No saved pins in this session yet.
        </div>
      ) : (
        <Masonry>
          {items.map((i) => (
            <PinTile key={i.pin.id} pin={i.pin} status={i.status} error={i.error} />
          ))}
        </Masonry>
      )}
    </main>
  );
}
