import type { Status } from '../types';
import { Icon, PillButton } from '../components/ui';

export function ConnectPage({
  status,
  authError,
  onDemo,
}: {
  status: Status;
  authError: string | null;
  onDemo: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-72px)] max-w-xl flex-col items-center justify-center px-6 pb-16 text-center">
      <div className="relative mb-10 h-44 w-56" aria-hidden>
        <div className="absolute top-6 left-2 h-36 w-26 -rotate-12 rounded-2xl bg-[#E8D5C4] shadow-soft" />
        <div className="absolute top-2 right-2 h-36 w-26 rotate-12 rounded-2xl bg-[#C9D6DF] shadow-soft" />
        <div className="absolute top-0 left-1/2 flex h-40 w-28 -translate-x-1/2 items-end justify-center rounded-2xl bg-[#F6D6AD] pb-3 shadow-card">
          <span className="rounded-pill bg-pin-red px-3 py-1 text-xs font-bold text-white">Save</span>
        </div>
      </div>

      <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">
        Sort your pins,
        <br />
        one swipe at a time
      </h1>
      <p className="mt-4 text-lg text-muted">
        Swipe left to copy a pin to a board, right to skip. Your original boards are never changed.
      </p>

      {authError && (
        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-pin-red/10 px-4 py-3 text-left text-sm text-pin-red">
          {Icon.alert('size-5 mt-px')} {authError}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <PillButton
          variant="primary"
          size="lg"
          disabled={!status.hasCredentials}
          onClick={() => {
            window.location.href = '/api/auth/login';
          }}
        >
          Connect Pinterest
        </PillButton>
        <PillButton size="lg" onClick={onDemo}>
          Try demo mode
        </PillButton>
      </div>

      {!status.hasCredentials && (
        <p className="mt-6 max-w-md text-sm text-muted">
          To connect a real account, add <code className="rounded bg-chip px-1.5 py-0.5 text-ink">PINTEREST_APP_ID</code>{' '}
          and <code className="rounded bg-chip px-1.5 py-0.5 text-ink">PINTEREST_APP_SECRET</code> to{' '}
          <code className="rounded bg-chip px-1.5 py-0.5 text-ink">.env</code> and restart. The README explains how to
          get them.
        </p>
      )}
    </main>
  );
}
