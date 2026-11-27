import type { ReactNode } from 'react';
import type { Status } from '../types';
import { Logo } from './ui';

export function Header({
  status,
  onToggleMode,
  onHome,
  children,
}: {
  status: Status | null;
  onToggleMode: () => void;
  onHome: () => void;
  children?: ReactNode;
}) {
  const demo = status?.mode === 'mock';
  return (
    <header className="sticky top-0 z-40 flex h-[72px] items-center gap-3 bg-white/90 px-4 backdrop-blur sm:px-6">
      <button className="cursor-pointer rounded-pill p-1" onClick={onHome} aria-label="Home">
        <Logo />
      </button>
      <div className="flex flex-1 items-center justify-center gap-2">{children}</div>
      {status && (
        <label className="flex cursor-pointer items-center gap-2 rounded-pill py-1 pr-1 pl-3 text-sm font-semibold text-ink hover:bg-chip">
          Demo mode
          <span className={`relative h-6 w-10 rounded-pill transition-colors ${demo ? 'bg-pin-red' : 'bg-[#cdcdcd]'}`}>
            <span
              className={`absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform ${
                demo ? 'translate-x-4' : ''
              }`}
            />
          </span>
          <input type="checkbox" className="sr-only" checked={demo} onChange={onToggleMode} />
        </label>
      )}
    </header>
  );
}
