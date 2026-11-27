import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { Header } from './components/Header';
import { Spinner } from './components/ui';
import { ConnectPage } from './pages/ConnectPage';
import { SetupPage } from './pages/SetupPage';
import { SummaryPage } from './pages/SummaryPage';
import { SwipePage } from './pages/SwipePage';
import type { Status } from './types';

type View =
  | { name: 'loading' }
  | { name: 'connect' }
  | { name: 'setup' }
  | { name: 'swipe'; sessionId: string }
  | { name: 'summary'; sessionId: string };

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [view, setView] = useState<View>({ name: 'loading' });
  const [authError, setAuthError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setView(s.connected ? { name: 'setup' } : { name: 'connect' });
    } catch {
      setFatal('Cannot reach the Swipekeep server. Is `npm run dev` running?');
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (err) {
      setAuthError(err);
      window.history.replaceState(null, '', '/');
    }
    refresh();
  }, [refresh]);

  const toggleMode = async () => {
    if (!status) return;
    await api.setMode(status.mode === 'mock' ? 'live' : 'mock');
    setView({ name: 'loading' });
    refresh();
  };

  const notConnected = () => {
    setStatus((s) => (s ? { ...s, connected: false } : s));
    setView({ name: 'connect' });
  };

  if (fatal) {
    return <p className="flex h-full items-center justify-center p-8 text-center text-pin-red">{fatal}</p>;
  }

  return (
    <div className="min-h-full">
      <Header status={status} onToggleMode={toggleMode} onHome={() => status?.connected && setView({ name: 'setup' })} />
      {view.name === 'loading' && (
        <div className="flex h-[60vh] items-center justify-center">
          <Spinner />
        </div>
      )}
      {view.name === 'connect' && status && (
        <ConnectPage
          status={status}
          authError={authError}
          onDemo={async () => {
            await api.setMode('mock');
            refresh();
          }}
        />
      )}
      {view.name === 'setup' && (
        <SetupPage
          onStart={(sessionId) => setView({ name: 'swipe', sessionId })}
          onNotConnected={notConnected}
        />
      )}
      {view.name === 'swipe' && (
        <SwipePage
          key={view.sessionId}
          sessionId={view.sessionId}
          onFinish={() => setView({ name: 'summary', sessionId: view.sessionId })}
          onBack={() => setView({ name: 'setup' })}
          onNotConnected={notConnected}
        />
      )}
      {view.name === 'summary' && (
        <SummaryPage
          sessionId={view.sessionId}
          onKeepSorting={() => setView({ name: 'swipe', sessionId: view.sessionId })}
          onNewSession={() => setView({ name: 'setup' })}
        />
      )}
    </div>
  );
}
