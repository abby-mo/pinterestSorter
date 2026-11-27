import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { api, ApiError } from '../api';
import { SwipeCard } from '../components/SwipeCard';
import { SyncStatus, useQueue } from '../components/SyncStatus';
import { Icon, PillButton, Spinner } from '../components/ui';
import type { Decision, Pin, SessionMeta } from '../types';

export function SwipePage({
  sessionId,
  onFinish,
  onBack,
  onNotConnected,
}: {
  sessionId: string;
  onFinish: () => void;
  onBack: () => void;
  onNotConnected: () => void;
}) {
  const [session, setSession] = useState<SessionMeta | null>(null);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [total, setTotal] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [exitDir, setExitDir] = useState(1);
  const [returning, setReturning] = useState<{ id: string; dir: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'dark' | 'red' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queue = useQueue();

  // Server calls run strictly in order so Undo always reverts the latest swipe.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = <T,>(fn: () => Promise<T>) => {
    const p = chain.current.then(fn);
    chain.current = p.catch(() => {});
    return p;
  };

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = useCallback((text: string, tone: 'dark' | 'red' = 'dark', ms = 3200) => {
    setToast({ text, tone });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), ms);
  }, []);

  useEffect(() => {
    api
      .sessionPins(sessionId)
      .then((r) => {
        setSession(r.session);
        setPins(r.pins);
        setTotal(r.total);
        setReviewed(r.reviewed);
      })
      .catch((e: ApiError) => (e.code === 'not_connected' ? onNotConnected() : setError(e.message)));
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload upcoming images so cards appear instantly.
  useEffect(() => {
    pins?.slice(0, 5).forEach((p) => {
      new Image().src = p.imageUrl;
      new Image().src = p.thumbUrl;
    });
  }, [pins]);

  const pinsRef = useRef(pins);
  pinsRef.current = pins;

  const decide = useCallback(
    (decision: Decision) => {
      const pin = pinsRef.current?.[0];
      if (!pin) return;
      setExitDir(decision === 'save' ? -1 : 1);
      setReturning(null);
      setPins((p) => (p ? p.slice(1) : p));
      setReviewed((n) => n + 1);
      enqueue(() => api.decide(sessionId, pin, decision))
        .then((r) => setSession(r.session))
        .catch((e: Error) => showToast(`Couldn't record that swipe: ${e.message}`, 'red'));
    },
    [sessionId, showToast],
  );

  const undo = useCallback(() => {
    enqueue(() => api.undo(sessionId))
      .then((r) => {
        setSession(r.session);
        setReturning({ id: r.pin.id, dir: r.decision === 'save' ? -1 : 1 });
        setPins((p) => [r.pin, ...(p ?? []).filter((x) => x.id !== r.pin.id)]);
        setReviewed((n) => Math.max(0, n - 1));
        if (r.note) showToast(r.note, 'dark', 6000);
        else showToast(r.decision === 'save' ? 'Save cancelled' : 'Skip undone', 'dark', 1600);
      })
      .catch((e: ApiError) => showToast(e.status === 409 ? 'Nothing to undo' : e.message, 'dark', 1600));
  }, [sessionId, showToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        decide('save');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        decide('skip');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, undo]);

  if (error) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-pin-red">{error}</p>
        <PillButton onClick={onBack}>Back</PillButton>
      </div>
    );
  }

  if (!pins || !session) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-4 text-muted">
        <Spinner />
        Gathering pins… (large accounts can take a moment)
      </div>
    );
  }

  const pct = total ? Math.round((reviewed / total) * 100) : 100;
  const visible = pins.slice(0, 3);

  return (
    <main className="flex min-h-[calc(100vh-72px)] flex-col items-center px-4 pb-8">
      {/* Top bar: progress + sync */}
      <div className="flex w-full max-w-[440px] items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex size-10 cursor-pointer items-center justify-center rounded-full hover:bg-chip"
          aria-label="Back to setup"
        >
          {Icon.arrowLeft()}
        </button>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted">
            {session.sourceName} → <strong className="text-ink">{session.destBoardName}</strong>
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {reviewed} <span className="text-muted">/ {total}</span>
          </span>
        </div>
        <PillButton size="sm" variant="dark" onClick={onFinish}>
          Done
        </PillButton>
      </div>
      <div className="mt-2 h-1 w-full max-w-[440px] overflow-hidden rounded-pill bg-chip">
        <div className="h-full rounded-pill bg-pin-red transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 h-9">
        <SyncStatus queue={queue} />
      </div>

      {/* Card stack */}
      <div className="relative mt-4 h-[min(66vh,680px)] w-[min(92vw,420px)]">
        <AnimatePresence custom={exitDir}>
          {visible
            .map((pin, i) => (
              <SwipeCard
                key={pin.id}
                pin={pin}
                depth={i}
                enterFrom={returning?.id === pin.id ? returning.dir : undefined}
                onDecision={decide}
              />
            ))
            .reverse()}
        </AnimatePresence>

        {pins.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[var(--radius-card)] bg-canvas px-8 text-center">
            <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-white text-pin-red shadow-soft">
              {Icon.check('size-8')}
            </span>
            <h2 className="text-2xl font-semibold">All caught up</h2>
            <p className="mt-2 text-muted">
              You've reviewed every pin here. {session.saved} saved to {session.destBoardName}.
            </p>
            <div className="mt-6 flex gap-2">
              <PillButton onClick={undo}>{Icon.undo('size-4')} Undo last</PillButton>
              <PillButton variant="primary" onClick={onFinish}>
                See saved pins
              </PillButton>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-3">
        <PillButton
          variant="primary"
          size="lg"
          className="min-w-36"
          disabled={!pins.length}
          onClick={() => decide('save')}
          aria-label="Save (left arrow)"
        >
          {Icon.heart()} Save
        </PillButton>
        <button
          onClick={undo}
          className="flex size-14 cursor-pointer items-center justify-center rounded-full bg-chip text-ink transition-colors hover:bg-chip-hover active:scale-95"
          aria-label="Undo (Ctrl+Z)"
          title="Undo (Ctrl/Cmd+Z)"
        >
          {Icon.undo()}
        </button>
        <PillButton size="lg" className="min-w-36" disabled={!pins.length} onClick={() => decide('skip')} aria-label="Skip (right arrow)">
          Skip {Icon.x('size-4')}
        </PillButton>
      </div>
      <p className="mt-4 hidden text-xs text-muted sm:block">
        <Kbd>←</Kbd> save · <Kbd>→</Kbd> skip · <Kbd>Ctrl</Kbd>/<Kbd>⌘</Kbd>+<Kbd>Z</Kbd> undo
      </p>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <p
            role="status"
            className={`max-w-lg rounded-pill px-5 py-3 text-center text-sm font-medium text-white shadow-card ${
              toast.tone === 'red' ? 'bg-pin-red' : 'bg-ink'
            }`}
          >
            {toast.text}
          </p>
        )}
      </div>
    </main>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-md bg-chip px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink">{children}</kbd>;
}
