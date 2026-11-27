import type { Board, Decision, Mode, Pin, QueueSummary, SaveStatus, SessionMeta, Status } from './types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(method !== 'GET' ? { 'x-pin-sorter': '1', 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json.error ?? `Request failed (${res.status})`, json.code);
  return json as T;
}

export const api = {
  status: () => call<Status>('GET', '/status'),
  setMode: (mode: Mode) => call<{ mode: Mode }>('POST', '/mode', { mode }),
  logout: () => call('POST', '/auth/logout'),

  boards: (refresh = false) => call<{ boards: Board[] }>('GET', `/boards${refresh ? '?refresh=1' : ''}`),
  createBoard: (name: string, privacy: 'PUBLIC' | 'SECRET') =>
    call<{ board: Board }>('POST', '/boards', { name, privacy }),

  sessions: () => call<{ sessions: SessionMeta[] }>('GET', '/sessions'),
  startSession: (source: string, destBoardId: string) =>
    call<{ session: SessionMeta }>('POST', '/sessions', { source, destBoardId }),
  sessionPins: (id: string, refresh = false) =>
    call<{ session: SessionMeta; pins: Pin[]; total: number; reviewed: number }>(
      'GET',
      `/sessions/${id}/pins${refresh ? '?refresh=1' : ''}`,
    ),
  decide: (id: string, pin: Pin, decision: Decision) =>
    call<{ session: SessionMeta }>('POST', `/sessions/${id}/decisions`, { pin, decision }),
  undo: (id: string) =>
    call<{ pin: Pin; decision: Decision; note: string | null; session: SessionMeta }>('POST', `/sessions/${id}/undo`),
  saved: (id: string) =>
    call<{ session: SessionMeta; items: Array<{ pin: Pin; status: SaveStatus; error: string | null }> }>(
      'GET',
      `/sessions/${id}/saved`,
    ),

  queue: () => call<QueueSummary>('GET', '/queue'),
  retryQueue: (id?: string) => call<{ retried: number }>('POST', '/queue/retry', { id }),
};
