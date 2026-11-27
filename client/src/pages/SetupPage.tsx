import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { BoardTile, Masonry, MasonryItem } from '../components/Masonry';
import { Icon, PillButton, Spinner } from '../components/ui';
import type { Board, SessionMeta } from '../types';

export function SetupPage({
  onStart,
  onNotConnected,
}: {
  onStart: (sessionId: string) => void;
  onNotConnected: () => void;
}) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [source, setSource] = useState('all');
  const [dest, setDest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [secret, setSecret] = useState(false);
  const [busyCreate, setBusyCreate] = useState(false);

  const load = (refresh = false) => {
    setError(null);
    Promise.all([api.boards(refresh), api.sessions()])
      .then(([b, s]) => {
        setBoards(b.boards);
        setSessions(s.sessions);
      })
      .catch((e: ApiError) => (e.code === 'not_connected' ? onNotConnected() : setError(e.message)));
  };
  useEffect(() => load(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (src = source, dst = dest) => {
    if (!dst) return;
    setStarting(true);
    setError(null);
    try {
      const { session } = await api.startSession(src, dst);
      onStart(session.id);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  const createBoard = async (e: FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusyCreate(true);
    try {
      const { board } = await api.createBoard(newName.trim(), secret ? 'SECRET' : 'PUBLIC');
      setBoards((b) => [board, ...(b ?? [])]);
      setDest(board.id);
      setCreating(false);
      setNewName('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyCreate(false);
    }
  };

  if (!boards) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-muted">
        {error ? (
          <>
            <p className="max-w-md text-center text-pin-red">{error}</p>
            <PillButton onClick={() => load()}>Try again</PillButton>
          </>
        ) : (
          <>
            <Spinner />
            Loading your boards…
          </>
        )}
      </div>
    );
  }

  const destBoard = boards.find((b) => b.id === dest);
  const sourceName = source === 'all' ? 'All pins' : boards.find((b) => b.id === source)?.name;

  return (
    <main className="mx-auto max-w-[1400px] px-4 pb-36 sm:px-6">
      {sessions.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl font-semibold">Pick up where you left off</h2>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {sessions.slice(0, 8).map((s) => (
              <button
                key={s.id}
                onClick={() => start(s.source, s.destBoardId)}
                className="flex min-w-64 cursor-pointer flex-col items-start rounded-2xl bg-canvas px-5 py-4 text-left transition-colors hover:bg-chip"
              >
                <span className="text-sm text-muted">{s.sourceName} →</span>
                <span className="font-semibold">{s.destBoardName}</span>
                <span className="mt-1 text-xs text-muted">
                  {s.saved} saved · {s.skipped} skipped
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold">Sort pins from</h2>
          <button className="cursor-pointer text-sm font-semibold text-muted hover:text-ink" onClick={() => load(true)}>
            Refresh
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {[{ id: 'all', name: 'All pins', pinCount: boards.reduce((n, b) => n + b.pinCount, 0) }, ...boards].map(
            (b) => {
              const active = source === b.id;
              const isDest = b.id === dest;
              return (
                <button
                  key={b.id}
                  disabled={isDest}
                  onClick={() => setSource(b.id)}
                  className={`h-10 cursor-pointer rounded-pill px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    active ? 'bg-pin-red text-white' : 'bg-chip text-ink hover:bg-chip-hover'
                  }`}
                >
                  {b.name}
                  <span className={`ml-1.5 font-normal ${active ? 'text-white/80' : 'text-muted'}`}>{b.pinCount}</span>
                </button>
              );
            },
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-xl font-semibold">Save keepers to</h2>
        <p className="mb-5 text-sm text-muted">Pins you save are copied here. They stay on their original boards too.</p>

        <Masonry>
          <MasonryItem>
            {creating ? (
              <form onSubmit={createBoard} className="rounded-2xl bg-canvas p-4">
                <label className="text-sm font-semibold" htmlFor="new-board">
                  Board name
                </label>
                <input
                  id="new-board"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder='Like "Kitchen keepers"'
                  className="mt-1.5 h-11 w-full rounded-2xl border-2 border-[#cdcdcd] bg-white px-4 text-[15px] outline-none focus:border-[#0084ff]/60"
                />
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="size-4 accent-pin-red" />
                  Keep this board secret
                </label>
                <div className="mt-4 flex gap-2">
                  <PillButton type="button" size="sm" onClick={() => setCreating(false)}>
                    Cancel
                  </PillButton>
                  <PillButton type="submit" size="sm" variant="primary" disabled={!newName.trim() || busyCreate}>
                    {busyCreate ? 'Creating…' : 'Create'}
                  </PillButton>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#cdcdcd] text-muted transition-colors hover:border-ink hover:text-ink"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-chip">{Icon.plus()}</span>
                <span className="font-semibold">Create board</span>
              </button>
            )}
          </MasonryItem>
          {boards.map((b) => (
            <BoardTile
              key={b.id}
              board={b}
              selected={dest === b.id}
              disabled={source === b.id}
              disabledLabel="Sorting from"
              onSelect={() => setDest(b.id)}
            />
          ))}
        </Masonry>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-6">
        <div className="flex max-w-full items-center gap-4 rounded-pill bg-white py-2 pr-2 pl-6 shadow-card">
          <span className="truncate text-[15px]">
            <span className="text-muted">From</span> <strong>{sourceName}</strong>
            <span className="text-muted"> into </span>
            <strong className={destBoard ? '' : 'text-muted'}>{destBoard?.name ?? 'pick a board'}</strong>
          </span>
          <PillButton variant="primary" size="lg" disabled={!dest || starting} onClick={() => start()}>
            {starting ? 'Loading pins…' : 'Start sorting'}
          </PillButton>
        </div>
      </div>

      {error && (
        <div className="fixed inset-x-0 bottom-28 z-30 flex justify-center px-4">
          <p className="rounded-pill bg-ink px-5 py-3 text-sm text-white shadow-card">{error}</p>
        </div>
      )}
    </main>
  );
}
