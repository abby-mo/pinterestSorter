import path from 'node:path';
import { config, hasCredentials } from './config';
import { JsonFile } from './store';
import { LivePinterestService } from './pinterest/live';
import { MockPinterestService } from './pinterest/mock';
import type { AppState, Board, Mode, Pin, PinterestService } from './types';

interface Settings {
  mode?: Mode;
}

export const settings = new JsonFile<Settings>(path.join(config.dataDir, 'settings.json'), () => ({}));

export function currentMode(): Mode {
  if (settings.data.mode) return settings.data.mode;
  if (config.mockModeEnv !== undefined && config.mockModeEnv !== '') {
    return config.mockModeEnv === 'true' ? 'mock' : 'live';
  }
  return hasCredentials() ? 'live' : 'mock';
}

export function setMode(mode: Mode) {
  settings.data.mode = mode;
  settings.flush();
}

const emptyState = (): AppState => ({ sessions: {}, queue: [] });

/** Review progress is kept separately for demo and real data. */
export const states: Record<Mode, JsonFile<AppState>> = {
  mock: new JsonFile(path.join(config.dataDir, 'state.mock.json'), emptyState),
  live: new JsonFile(path.join(config.dataDir, 'state.live.json'), emptyState),
};

export const services: Record<Mode, PinterestService> = {
  mock: new MockPinterestService(),
  live: new LivePinterestService(),
};

/* ---------- read cache (boards / pins), so resuming is fast ---------- */

const TTL = 10 * 60_000;
type Cached<T> = { at: number; value: Promise<T> };
const boardCache = new Map<Mode, Cached<Board[]>>();
const pinCache = new Map<string, Cached<Pin[]>>();

function cached<T>(map: Map<any, Cached<T>>, key: unknown, load: () => Promise<T>, refresh: boolean) {
  const hit = map.get(key);
  if (hit && !refresh && Date.now() - hit.at < TTL) return hit.value;
  const value = load();
  map.set(key, { at: Date.now(), value });
  value.catch(() => map.delete(key));
  return value;
}

export function getBoards(mode: Mode, refresh = false) {
  return cached(boardCache, mode, () => services[mode].listBoards(), refresh);
}

export function getBoardPins(mode: Mode, board: Board, refresh = false) {
  return cached(pinCache, `${mode}:${board.id}`, () => services[mode].listBoardPins(board), refresh);
}

export function invalidateBoards(mode: Mode) {
  boardCache.delete(mode);
}
