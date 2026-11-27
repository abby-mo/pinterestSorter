import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import { config, hasCredentials, SCOPES } from './config';
import { JsonFile } from './store';

interface Tokens {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  refresh_expires_at?: number;
  scope?: string;
  username?: string;
}

/** Tokens live only on the server, in the local data directory. */
export const tokenStore = new JsonFile<Tokens>(path.join(config.dataDir, 'tokens.json'), () => ({}));

export class NotConnectedError extends Error {
  constructor(msg = 'Not connected to Pinterest') {
    super(msg);
    this.name = 'NotConnectedError';
  }
}

export const isConnected = () => Boolean(tokenStore.data.access_token);

async function tokenRequest(params: Record<string, string>) {
  const basic = Buffer.from(`${config.appId}:${config.appSecret}`).toString('base64');
  const res = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Token request failed (${res.status}): ${json.message ?? res.statusText}`);
  }
  const now = Date.now();
  const t = tokenStore.data;
  t.access_token = json.access_token as string;
  if (json.refresh_token) t.refresh_token = json.refresh_token as string;
  t.expires_at = now + Number(json.expires_in ?? 2_592_000) * 1000;
  if (json.refresh_token_expires_in) {
    t.refresh_expires_at = now + Number(json.refresh_token_expires_in) * 1000;
  }
  t.scope = (json.scope as string) ?? t.scope;
  tokenStore.flush();
}

let refreshing: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!tokenStore.data.refresh_token) return Promise.reject(new NotConnectedError());
  refreshing ??= tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: tokenStore.data.refresh_token,
  })
    .then(() => tokenStore.data.access_token!)
    .catch((err) => {
      console.error('[auth] refresh failed:', err.message);
      throw new NotConnectedError('Pinterest session expired. Please reconnect.');
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function getAccessToken(): Promise<string> {
  const t = tokenStore.data;
  if (!t.access_token) throw new NotConnectedError();
  if (t.expires_at && t.expires_at - 5 * 60_000 < Date.now()) return refreshAccessToken();
  return t.access_token;
}

const pendingStates = new Map<string, number>();

export const authRouter = Router();

authRouter.get('/login', (_req, res) => {
  if (!hasCredentials()) {
    res
      .status(400)
      .send('PINTEREST_APP_ID / PINTEREST_APP_SECRET are not set in .env. See README.md.');
    return;
  }
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, Date.now() + 10 * 60_000);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

authRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  const back = (err?: string) => res.redirect(err ? `/?auth_error=${encodeURIComponent(err)}` : '/');

  const expiry = state ? pendingStates.get(state) : undefined;
  if (state) pendingStates.delete(state);
  if (error) return back(error);
  if (!code || !expiry || expiry < Date.now()) return back('Invalid or expired login attempt. Try again.');

  try {
    await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.redirectUri });
    try {
      const me = await fetch(`${config.apiBase}/user_account`, {
        headers: { Authorization: `Bearer ${tokenStore.data.access_token}` },
      }).then((r) => r.json() as Promise<{ username?: string }>);
      tokenStore.data.username = me.username;
      tokenStore.flush();
    } catch {
      /* username is cosmetic */
    }
    back();
  } catch (err) {
    back((err as Error).message);
  }
});

authRouter.post('/logout', (_req, res) => {
  tokenStore.data = {};
  tokenStore.delete();
  res.json({ ok: true });
});
