import express, { type NextFunction, type Request, type Response } from 'express';
import { config, hasCredentials } from './config';
import { authRouter, isConnected, NotConnectedError } from './auth';
import { PinterestApiError, SafetyViolation } from './pinterest/client';
import { processNext } from './queue';
import { api, HttpError } from './routes';
import { currentMode, services, states } from './services';
import { flushAll } from './store';
import type { Mode } from './types';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Basic CSRF guard: state-changing calls must come from our own frontend.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('x-pin-sorter') !== '1') {
    res.status(403).json({ error: 'Missing x-pin-sorter header' });
    return;
  }
  next();
});

app.use('/api/auth', authRouter);
app.use('/api', api);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if (err instanceof NotConnectedError) return void res.status(401).json({ error: err.message, code: 'not_connected' });
  if (err instanceof PinterestApiError) {
    return void res.status(err.status === 429 ? 429 : 502).json({ error: `Pinterest: ${err.message}`, status: err.status });
  }
  if (err instanceof SafetyViolation) {
    console.error(err);
    return void res.status(500).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: (err as Error)?.message ?? 'Unexpected error' });
});

/* ---------- background save worker ---------- */

// Anything mid-send when the app last stopped is retried.
for (const s of Object.values(states)) {
  for (const q of s.data.queue) if (q.status === 'sending') q.status = 'pending';
}

let busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    for (const mode of ['mock', 'live'] as Mode[]) {
      if (mode === 'live' && !isConnected()) continue;
      const state = states[mode];
      if (await processNext(state.data, services[mode])) state.save();
    }
  } catch (err) {
    console.error('[queue]', err);
  } finally {
    busy = false;
  }
}, 750);

/* ---------- start / stop ---------- */

const server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`Pin Sorter API on http://127.0.0.1:${config.port}  (mode: ${currentMode()})`);
  if (!hasCredentials()) console.log('No Pinterest credentials in .env, so demo mode is available only.');
  console.log(`Data directory: ${config.dataDir}`);
});

const shutdown = () => {
  flushAll();
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', flushAll);
