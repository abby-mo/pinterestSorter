import path from 'node:path';
import dotenv from 'dotenv';

export const ROOT_DIR = path.resolve(import.meta.dirname, '../..');
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const env = process.env;

export const config = {
  // Not plain PORT: many tools set PORT for the frontend dev server.
  port: Number(env.API_PORT ?? 3001),
  appId: env.PINTEREST_APP_ID?.trim() ?? '',
  appSecret: env.PINTEREST_APP_SECRET?.trim() ?? '',
  redirectUri: env.PINTEREST_REDIRECT_URI?.trim() || 'http://localhost:5173/api/auth/callback',
  apiBase: (env.PINTEREST_API_BASE?.trim() || 'https://api.pinterest.com/v5').replace(/\/+$/, ''),
  /** Token endpoint is always production; sandbox uses dashboard-issued tokens. */
  tokenUrl: 'https://api.pinterest.com/v5/oauth/token',
  authorizeUrl: 'https://www.pinterest.com/oauth/',
  mockModeEnv: env.MOCK_MODE?.trim().toLowerCase(),
  saveDelayMs: Number(env.SAVE_DELAY_MS ?? 5000),
  saveStrategy: (env.SAVE_STRATEGY?.trim() || 'auto') as 'auto' | 'save' | 'create',
  mockFailureRate: Number(env.MOCK_FAILURE_RATE ?? 0.08),
  dataDir: path.resolve(ROOT_DIR, env.DATA_DIR?.trim() || 'data'),
};

export const SCOPES = [
  'user_accounts:read',
  'boards:read',
  'boards:write',
  'pins:read',
  'pins:write',
].join(',');

export const hasCredentials = () => Boolean(config.appId && config.appSecret);
