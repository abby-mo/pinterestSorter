import type { ReactNode } from 'react';
import type { Board, Pin, SaveStatus } from '../types';
import { Icon } from './ui';

/** Classic Pinterest waterfall: CSS multi-column with unbroken items. */
export function Masonry({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`columns-2 gap-4 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 ${className}`}>{children}</div>
  );
}

export function MasonryItem({ children }: { children: ReactNode }) {
  return <div className="mb-5 break-inside-avoid">{children}</div>;
}

const statusLabel: Record<SaveStatus, string> = {
  pending: 'Saving soon',
  sending: 'Saving…',
  done: 'Saved',
  failed: 'Failed',
};

export function PinTile({ pin, status, error }: { pin: Pin; status?: SaveStatus; error?: string | null }) {
  return (
    <MasonryItem>
      <a
        href={pin.link ?? pin.imageUrl}
        target="_blank"
        rel="noreferrer"
        className="group block"
        title={error ?? pin.title}
      >
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{ aspectRatio: `${pin.width} / ${pin.height}`, backgroundColor: pin.dominantColor ?? '#efefef' }}
        >
          <img src={pin.thumbUrl} alt={pin.title} loading="lazy" className="size-full object-cover" />
          <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
          {status && status !== 'done' && (
            <span
              className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-semibold shadow-soft ${
                status === 'failed' ? 'bg-pin-red text-white' : 'bg-white/95 text-ink'
              }`}
            >
              {status === 'failed' ? Icon.alert('size-3.5') : Icon.cloud('size-3.5')}
              {statusLabel[status]}
            </span>
          )}
        </div>
        <p className="mt-2 line-clamp-2 px-1 text-sm leading-snug font-semibold">{pin.title}</p>
        <p className="px-1 text-xs text-muted">{pin.boardName}</p>
      </a>
    </MasonryItem>
  );
}

export function BoardTile({
  board,
  selected,
  disabled,
  disabledLabel,
  onSelect,
}: {
  board: Board;
  selected: boolean;
  disabled?: boolean;
  disabledLabel?: string;
  onSelect: () => void;
}) {
  return (
    <MasonryItem>
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        className="group block w-full cursor-pointer text-left disabled:cursor-not-allowed disabled:opacity-40"
      >
        <div
          className={`relative overflow-hidden rounded-2xl bg-chip transition-shadow ${
            selected ? 'ring-4 ring-pin-red ring-offset-2' : ''
          }`}
        >
          {board.coverUrl ? (
            <img src={board.coverUrl} alt="" loading="lazy" className="block w-full object-cover" />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center text-muted">{Icon.board('size-10')}</div>
          )}
          <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15" />
          {selected && (
            <span className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full bg-pin-red text-white shadow-soft">
              {Icon.check('size-4')}
            </span>
          )}
          {disabled && disabledLabel && (
            <span className="absolute top-2.5 left-2.5 rounded-pill bg-white px-2.5 py-1 text-xs font-semibold">
              {disabledLabel}
            </span>
          )}
        </div>
        <p className="mt-2 px-1 text-[15px] leading-tight font-semibold">{board.name}</p>
        <p className="px-1 text-xs text-muted">
          {board.pinCount} {board.pinCount === 1 ? 'pin' : 'pins'}
          {board.privacy === 'SECRET' ? ' · Secret' : ''}
        </p>
      </button>
    </MasonryItem>
  );
}
