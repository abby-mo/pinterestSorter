# Swipekeep

A local web app for sorting your Pinterest pins with a swipe interface.

- **Swipe left** (or press `←`) to **save**: the pin is copied onto your destination board.
- **Swipe right** (or press `→`) to **skip**.
- **Undo** with `Ctrl+Z` / `⌘Z` or the undo button.

When you stop, a masonry gallery shows everything you saved.

> **Your pins are never deleted, moved or edited.** Saving only *copies* a pin onto the board you pick. See [Data safety](#data-safety).

## Quick start (demo mode, no Pinterest account needed)

Requires Node.js 20.19 or newer.

```powershell
npm install
copy .env.example .env
npm run dev
```

Open <http://localhost:5173>. With `MOCK_MODE=true` (the default in `.env.example`) you get about 60 sample pins across 5 boards, in varied image shapes. You can switch between demo and real data at any time with the **Demo mode** toggle in the header.

Demo mode loads its sample photos from `picsum.photos`, so it needs an internet connection. It also fails about 8% of saves on purpose (`MOCK_FAILURE_RATE`) so you can watch the retry queue work.

## Pinterest API setup

1. **Create a developer app.** Go to <https://developers.pinterest.com/apps/>, sign in with your Pinterest account, and choose **Connect app**. Fill in the name and description. For "Website" you can use your GitHub repo URL.
2. **Wait for Trial access.** New apps are reviewed first and then get **Trial access**. Trial access can read your boards and pins.
3. **Add the redirect URI.** On the app's page, under **Redirect URIs**, add exactly:
   ```
   http://localhost:5173/api/auth/callback
   ```
4. **Copy your credentials.** Copy the **App ID** and **App secret key** into `.env`:
   ```env
   PINTEREST_APP_ID=1234567
   PINTEREST_APP_SECRET=abc123...
   MOCK_MODE=false
   ```
5. **Connect.** Restart `npm run dev`, turn off Demo mode, and click **Connect Pinterest**. The app asks for these scopes:
   `user_accounts:read, boards:read, boards:write, pins:read, pins:write`.

### Trial vs Standard access (read this before saving real pins)

Pinterest's **Trial** tier may block write calls (creating pins and boards) against your real account. Writes may only work in Pinterest's sandbox until you request an upgrade to **Standard** access from your app's page.

If a save is blocked, it shows up as **Failed** with a 403 message. It stays in the queue, so after you're upgraded you can click **Retry** and nothing is lost. Reading boards and swiping work fine on Trial.

## How it works

```
Browser (React, Vite :5173) --/api proxy--> Express (:3001) --> api.pinterest.com/v5
                                                  |
                                                  +-- data/  (tokens, progress, save queue)
```

- **OAuth tokens never reach the browser.** The Express server exchanges the code, stores tokens in `data/tokens.json`, and refreshes them automatically.
- **Progress is saved locally** in `data/state.live.json` (or `state.mock.json` for demo mode). A pin you've already decided on for a destination board won't show up again for that board, even across sessions or restarts. Picking the same source and destination again resumes that session.
- **Saves go through a queue saved on disk.** Each save waits `SAVE_DELAY_MS` (5 seconds by default) before it is sent.
  - **Undo within that window** cancels the save, and nothing reaches Pinterest.
  - **Undo after the save was sent** clears only the local decision. The app tells you the copy already exists, because it never deletes.
- **Rate limits and errors are retried.**
  - `429` responses pause all calls for `Retry-After` (or exponential backoff with jitter).
  - `5xx` and network errors are retried up to 8 times.
  - Failed saves stay listed with a **Retry** button.
  - Swiping is never blocked by the network.
- **Pagination:** every list follows Pinterest's `bookmark` cursor until all pages are read. "All pins" means every pin on every board except the destination, because the v5 API has no single "list all my pins" endpoint.

### Local API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/status` | Mode, connection, username |
| POST | `/api/mode` | Switch `mock` / `live` |
| GET | `/api/auth/login` · `/api/auth/callback` | Pinterest OAuth |
| POST | `/api/auth/logout` | Forget local tokens |
| GET / POST | `/api/boards` | List boards / create a destination board |
| GET / POST | `/api/sessions` | List sessions / start or resume one |
| GET | `/api/sessions/:id/pins` | Unreviewed pins + progress counts |
| POST | `/api/sessions/:id/decisions` | Record save/skip |
| POST | `/api/sessions/:id/undo` | Revert the last decision |
| GET | `/api/sessions/:id/saved` | Saved pins with sync status |
| GET | `/api/queue` · POST `/api/queue/retry` | Save queue status / retry failures |

### Pinterest endpoints used

| Call | Why |
|---|---|
| `GET /v5/user_account` | Show who's connected |
| `GET /v5/boards` | List your boards |
| `GET /v5/boards/{id}/pins` | Read pins to sort |
| `POST /v5/boards` | Create a destination board |
| `POST /v5/pins/{id}/save` | Re-pin a copy onto the destination board |
| `POST /v5/pins` | Fallback copy (same image + link) if re-pinning isn't available. Controlled by `SAVE_STRATEGY` |

## Data safety

All Pinterest traffic goes through `SafePinterestClient` ([server/src/pinterest/client.ts](server/src/pinterest/client.ts)). Before any request goes out, it is checked against an allowlist of the endpoints above. There is no code path for `DELETE`, `PATCH` or `PUT`, so pins can't be removed, moved or edited.

`npm test` checks that destructive calls are blocked before reaching the network, and that undo never deletes.

## Where your data lives

Everything is in `data/` (gitignored), or in the folder named by `DATA_DIR`:

| File | Contents |
|---|---|
| `tokens.json` | Pinterest OAuth tokens. **Treat as a password.** |
| `state.live.json` / `state.mock.json` | Sessions, decisions, save queue |
| `settings.json` | Demo-mode toggle |
| `mock-db.json` | Boards/copies created in demo mode |

This project folder is inside OneDrive, so `data/tokens.json` would be synced to the cloud. To keep it local, point `DATA_DIR` at a folder outside OneDrive, for example `DATA_DIR=C:/Users/<you>/AppData/Local/swipekeep`.

To start over, stop the app and delete the data folder. That only resets this app; it doesn't touch Pinterest.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Server + client with hot reload |
| `npm test` | Safety allowlist and queue tests |
| `npm run typecheck` | TypeScript checks for both packages |

## Project layout

```
server/src/
  index.ts            Express app, error handling, background save worker
  routes.ts           Local REST API
  auth.ts             OAuth login/callback/refresh, token storage
  queue.ts            Save queue: undo window, retries, backoff
  services.ts         Demo/live switch, board/pin cache
  store.ts            Atomic JSON file storage
  pinterest/client.ts SafePinterestClient (allowlist, rate limits, pagination)
  pinterest/live.ts   Pinterest v5 implementation
  pinterest/mock.ts   Demo data
client/src/
  pages/              Connect, Setup (board picker), Swipe, Summary
  components/         SwipeCard, Masonry, SyncStatus, Header, UI pieces
```

## Project website

`docs/` is a small static site, published with GitHub Pages (Settings → Pages → Deploy from branch → `main` / `/docs`). It's the website and privacy-policy URL registered with the Pinterest developer app:

- `https://abby-mo.github.io/pinterestSorter/`
- `https://abby-mo.github.io/pinterestSorter/privacy/`

If you edit [PRIVACY.md](PRIVACY.md), update `docs/privacy/index.html` to match.
