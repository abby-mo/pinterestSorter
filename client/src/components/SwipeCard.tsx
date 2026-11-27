import { motion, useMotionValue, useTransform, type PanInfo, type TargetAndTransition } from 'motion/react';
import type { Decision, Pin } from '../types';
import { Icon } from './ui';

const DISTANCE = 110;
const VELOCITY = 550;

/** Stack position -> resting transform. 0 is the top (active) card. */
const REST = [
  { scale: 1, y: 0, opacity: 1 },
  { scale: 0.95, y: 16, opacity: 1 },
  { scale: 0.9, y: 32, opacity: 0.7 },
];

const spring = { type: 'spring' as const, stiffness: 320, damping: 30 };

/** Exit direction: -1 = left (save), 1 = right (skip). */
export const cardVariants = {
  exit: (dir: number): TargetAndTransition => ({
    x: dir * 700,
    rotate: dir * 22,
    opacity: 0,
    transition: { type: 'spring', stiffness: 170, damping: 26, opacity: { duration: 0.35 } },
  }),
};

function domain(link?: string) {
  if (!link) return null;
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function SwipeCard({
  pin,
  depth,
  enterFrom,
  onDecision,
}: {
  pin: Pin;
  depth: number;
  /** When the card comes back via Undo: the side it flies in from. */
  enterFrom?: number;
  onDecision: (d: Decision) => void;
}) {
  const active = depth === 0;
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-320, 0, 320], [-14, 0, 14]);
  const saveBadge = useTransform(x, [-DISTANCE, -24], [1, 0]);
  const skipBadge = useTransform(x, [24, DISTANCE], [0, 1]);
  const saveTint = useTransform(x, [-220, 0], [0.32, 0]);
  const skipTint = useTransform(x, [0, 220], [0, 0.28]);
  const badgeScale = useTransform(x, [-DISTANCE, 0, DISTANCE], [1, 0.8, 1]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -DISTANCE || info.velocity.x < -VELOCITY) onDecision('save');
    else if (info.offset.x > DISTANCE || info.velocity.x > VELOCITY) onDecision('skip');
  };

  const rest = REST[Math.min(depth, REST.length - 1)];
  const site = domain(pin.link);

  return (
    <motion.div
      className="absolute inset-0 touch-none"
      style={{ x, rotate, zIndex: 10 - depth, transformOrigin: '50% 90%' }}
      custom={0}
      variants={cardVariants}
      initial={enterFrom ? { x: enterFrom * 700, rotate: enterFrom * 22, opacity: 0 } : { ...REST[2], opacity: 0 }}
      animate={{ ...rest, x: 0, rotate: 0, transition: spring }}
      // Only the top card flies away; a background card pushed out by Undo just fades.
      exit={active ? 'exit' : { opacity: 0, transition: { duration: 0.15 } }}
      drag={active ? 'x' : false}
      dragSnapToOrigin
      dragElastic={0.9}
      dragTransition={{ bounceStiffness: 380, bounceDamping: 26 }}
      whileDrag={{ cursor: 'grabbing' }}
      onDragEnd={onDragEnd}
    >
      <article
        className={`flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-white shadow-card ${
          active ? 'cursor-grab' : 'pointer-events-none'
        }`}
        aria-hidden={!active}
      >
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: pin.dominantColor ?? '#efefef' }}>
          {/* Blurred fill so letterboxed images still feel full-bleed */}
          <img
            src={pin.thumbUrl}
            alt=""
            draggable={false}
            className="absolute inset-0 size-full scale-110 object-cover opacity-70 blur-2xl"
          />
          <img
            src={pin.imageUrl}
            alt={pin.title}
            draggable={false}
            className="relative size-full object-contain select-none"
          />

          <motion.div className="pointer-events-none absolute inset-0 bg-pin-red" style={{ opacity: saveTint }} />
          <motion.div className="pointer-events-none absolute inset-0 bg-ink" style={{ opacity: skipTint }} />

          <motion.span
            className="pointer-events-none absolute top-5 right-5 inline-flex items-center gap-1.5 rounded-pill bg-pin-red px-5 py-2.5 text-lg font-bold text-white shadow-card"
            style={{ opacity: saveBadge, scale: badgeScale }}
          >
            {Icon.heart('size-5')} Save
          </motion.span>
          <motion.span
            className="pointer-events-none absolute top-5 left-5 inline-flex items-center gap-1.5 rounded-pill bg-white/95 px-5 py-2.5 text-lg font-bold text-muted shadow-card"
            style={{ opacity: skipBadge, scale: badgeScale }}
          >
            Skip {Icon.x('size-4')}
          </motion.span>
        </div>

        <div className="shrink-0 px-5 pt-4 pb-5">
          <h2 className="line-clamp-2 text-[17px] leading-snug font-semibold text-ink">{pin.title}</h2>
          <div className="mt-1.5 flex items-center gap-2 text-sm text-muted">
            {Icon.board('size-4')}
            <span className="truncate">{pin.boardName}</span>
            {site && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{site}</span>
              </>
            )}
          </div>
        </div>
      </article>
    </motion.div>
  );
}
