import crypto from 'node:crypto';
import { Router, type Request } from 'express';
import { config, hasCredentials } from './config';
import { isConnected, tokenStore } from './auth';
import { cancelSave, enqueueSave, queueSummary, retryFailed } from './queue';
import { currentMode, getBoardPins, getBoards, invalidateBoards, services, setMode, states } from './services';
import type { AppState, Decision, Mode, Pin, Session } from './types';

export const api = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const ctx = () => {
  const mode = currentMode();
  return { mode, state: states[mode], service: services[mode] };
};

function sessionMeta(s: Session) {
  const saved = s.decisions.filter((d) => d.decision === 'save').length;
  return {
    id: s.id,
    source: s.source,
    sourceName: s.sourceName,
    destBoardId: s.destBoardId,
    destBoardName: s.destBoardName,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    saved,
    skipped: s.decisions.length - saved,
  };
}

function getSession(state: AppState, req: Request): Session {
  const s = state.sessions[req.params.id as string];
  if (!s) throw new HttpError(404, 'Session not found');
  return s;
}

/** Pins already decided for a destination board, across all its sessions. */
function reviewedIds(state: AppState, destBoardId: string) {
  const ids = new Set<string>();
  for (const s of Object.values(state.sessions)) {
    if (s.destBoardId !== destBoardId) continue;
    for (const d of s.decisions) ids.add(d.pinId);
  }
  return ids;
}

/* ---------------- status & mode ---------------- */

api.get('/status', (_req, res) => {
  const mode = currentMode();
  res.json({
    mode,
    hasCredentials: hasCredentials(),
    connected: mode === 'mock' || isConnected(),
    username: mode === 'mock' ? 'demo_user' : tokenStore.data.username ?? null,
    saveDelayMs: config.saveDelayMs,
  });
});

api.post('/mode', (req, res) => {
  const mode = req.body?.mode as Mode;
  if (mode !== 'mock' && mode !== 'live') throw new HttpError(400, 'mode must be "mock" or "live"');
  setMode(mode);
  res.json({ mode });
});

/* ---------------- boards ---------------- */

api.get('/boards', async (req, res) => {
  const { mode } = ctx();
  res.json({ boards: await getBoards(mode, req.query.refresh === '1') });
});

api.post('/boards', async (req, res) => {
  const { mode, service } = ctx();
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Board name is required');
  if (name.length > 180) throw new HttpError(400, 'Board name is too long');
  const privacy = req.body?.privacy === 'SECRET' ? 'SECRET' : 'PUBLIC';
  const board = await service.createBoard({ name, description: req.body?.description, privacy });
  invalidateBoards(mode);
  res.status(201).json({ board });
});

/* ---------------- sessions ---------------- */

api.get('/sessions', (_req, res) => {
  const { state } = ctx();
  const list = Object.values(state.data.sessions)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(sessionMeta);
  res.json({ sessions: list });
});

api.post('/sessions', async (req, res) => {
  const { mode, state } = ctx();
  const source = String(req.body?.source ?? 'all');
  const destBoardId = String(req.body?.destBoardId ?? '');
  const boards = await getBoards(mode);
  const dest = boards.find((b) => b.id === destBoardId);
  if (!dest) throw new HttpError(400, 'Choose a destination board');
  if (source === destBoardId) throw new HttpError(400, 'Source and destination must be different boards');
  const srcBoard = source === 'all' ? null : boards.find((b) => b.id === source);
  if (source !== 'all' && !srcBoard) throw new HttpError(400, 'Source board not found');

  // Resume an existing session for the same source -> destination.
  let session = Object.values(state.data.sessions).find(
    (s) => s.source === source && s.destBoardId === destBoardId,
  );
  if (!session) {
    session = {
      id: crypto.randomUUID(),
      source,
      sourceName: srcBoard?.name ?? 'All pins',
      destBoardId,
      destBoardName: dest.name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      decisions: [],
    };
    state.data.sessions[session.id] = session;
  }
  session.updatedAt = Date.now();
  state.save();
  res.json({ session: sessionMeta(session) });
});

api.get('/sessions/:id', (req, res) => {
  const { state } = ctx();
  res.json({ session: sessionMeta(getSession(state.data, req)) });
});

/** Unreviewed pins for this session, plus progress numbers. */
api.get('/sessions/:id/pins', async (req, res) => {
  const { mode, state } = ctx();
  const session = getSession(state.data, req);
  const refresh = req.query.refresh === '1';
  const boards = await getBoards(mode, refresh);
  const sources =
    session.source === 'all'
      ? boards.filter((b) => b.id !== session.destBoardId)
      : boards.filter((b) => b.id === session.source);

  const seen = new Set<string>();
  const all: Pin[] = [];
  for (const board of sources) {
    for (const pin of await getBoardPins(mode, board, refresh)) {
      if (seen.has(pin.id)) continue;
      seen.add(pin.id);
      all.push(pin);
    }
  }
  const reviewed = reviewedIds(state.data, session.destBoardId);
  const pins = all.filter((p) => !reviewed.has(p.id));
  res.json({ session: sessionMeta(session), pins, total: all.length, reviewed: all.length - pins.length });
});

api.post('/sessions/:id/decisions', (req, res) => {
  const { state } = ctx();
  const session = getSession(state.data, req);
  const decision = req.body?.decision as Decision;
  const pin = req.body?.pin as Pin | undefined;
  if (decision !== 'save' && decision !== 'skip') throw new HttpError(400, 'decision must be save or skip');
  if (!pin || typeof pin.id !== 'string' || typeof pin.imageUrl !== 'string') throw new HttpError(400, 'pin is required');

  if (!session.decisions.some((d) => d.pinId === pin.id)) {
    session.decisions.push({ pinId: pin.id, decision, at: Date.now(), pin });
    if (decision === 'save') enqueueSave(state.data, session.id, pin, session.destBoardId, config.saveDelayMs);
  }
  session.updatedAt = Date.now();
  state.save();
  res.json({ session: sessionMeta(session) });
});

api.post('/sessions/:id/undo', (req, res) => {
  const { state } = ctx();
  const session = getSession(state.data, req);
  const last = session.decisions.pop();
  if (!last) throw new HttpError(409, 'Nothing to undo');

  let note: string | null = null;
  if (last.decision === 'save') {
    const result = cancelSave(state.data, last.pinId, session.destBoardId);
    if (result === 'already-sent') {
      note = `Already copied to “${session.destBoardName}” on Pinterest. Swipekeep never deletes pins — remove the copy in Pinterest if you don't want it.`;
    }
  }
  session.updatedAt = Date.now();
  state.save();
  res.json({ pin: last.pin, decision: last.decision, note, session: sessionMeta(session) });
});

api.get('/sessions/:id/saved', (req, res) => {
  const { state } = ctx();
  const session = getSession(state.data, req);
  const items = session.decisions
    .filter((d) => d.decision === 'save')
    .map((d) => {
      const q = state.data.queue.find((x) => x.pin.id === d.pinId && x.destBoardId === session.destBoardId);
      return { pin: d.pin, status: q?.status ?? 'done', error: q?.lastError ?? null };
    })
    .reverse();
  res.json({ session: sessionMeta(session), items });
});

/* ---------------- save queue ---------------- */

api.get('/queue', (_req, res) => {
  const { state } = ctx();
  res.json(queueSummary(state.data));
});

api.post('/queue/retry', (req, res) => {
  const { state } = ctx();
  const n = retryFailed(state.data, req.body?.id);
  state.save();
  res.json({ retried: n });
});

export { HttpError };
