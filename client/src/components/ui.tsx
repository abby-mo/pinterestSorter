import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'dark';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-pin-red text-white hover:bg-pin-red-dark disabled:bg-pin-red/40',
  secondary: 'bg-chip text-ink hover:bg-chip-hover disabled:text-muted',
  ghost: 'bg-transparent text-ink hover:bg-chip disabled:text-muted',
  dark: 'bg-ink text-white hover:bg-black disabled:bg-ink/40',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-14 px-7 text-base',
};

export function PillButton({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-pill font-semibold whitespace-nowrap transition-colors duration-150 select-none active:scale-[0.98] disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block size-6 animate-spin rounded-full border-[3px] border-chip border-t-pin-red ${className}`}
      aria-label="Loading"
    />
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" fill="#E60023" />
        <rect x="7" y="9" width="11" height="15" rx="3" fill="#fff" opacity=".55" transform="rotate(-10 12.5 16.5)" />
        <rect x="13" y="7" width="12" height="17" rx="3" fill="#fff" />
      </svg>
      <span className="text-lg font-bold tracking-tight">Pin Sorter</span>
    </span>
  );
}

/* --- tiny inline icon set --- */
const base = 'size-5 shrink-0';
export const Icon = {
  heart: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden>
      <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" />
    </svg>
  ),
  x: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  undo: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 010 11H11" />
    </svg>
  ),
  check: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  plus: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  board: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden>
      <path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" opacity=".9" />
    </svg>
  ),
  arrowLeft: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  cloud: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 18h10a4 4 0 00.6-7.95A6 6 0 006.2 9.1 4.5 4.5 0 007 18z" />
    </svg>
  ),
  alert: (c = base) => (
    <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </svg>
  ),
};
