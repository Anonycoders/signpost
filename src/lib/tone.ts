import type { Tone } from '@config';

/**
 * Tone -> class mappings.
 *
 * These are written out in full rather than built by string interpolation
 * because Tailwind detects utilities by scanning source text; a constructed
 * name like `bg-tone-${tone}-bg` would never be generated.
 */

/** Soft badge/chip styling: tinted background, matching border and readable text. */
export const toneChipClass: Record<Tone, string> = {
  gray: 'bg-tone-gray-bg text-tone-gray-ink border-tone-gray-border',
  blue: 'bg-tone-blue-bg text-tone-blue-ink border-tone-blue-border',
  violet: 'bg-tone-violet-bg text-tone-violet-ink border-tone-violet-border',
  green: 'bg-tone-green-bg text-tone-green-ink border-tone-green-border',
  amber: 'bg-tone-amber-bg text-tone-amber-ink border-tone-amber-border',
  red: 'bg-tone-red-bg text-tone-red-ink border-tone-red-border',
  teal: 'bg-tone-teal-bg text-tone-teal-ink border-tone-teal-border',
  pink: 'bg-tone-pink-bg text-tone-pink-ink border-tone-pink-border',
};

/** Solid fill, for timeline bars, dots and stage steppers. */
export const toneSolidClass: Record<Tone, string> = {
  gray: 'bg-tone-gray-solid',
  blue: 'bg-tone-blue-solid',
  violet: 'bg-tone-violet-solid',
  green: 'bg-tone-green-solid',
  amber: 'bg-tone-amber-solid',
  red: 'bg-tone-red-solid',
  teal: 'bg-tone-teal-solid',
  pink: 'bg-tone-pink-solid',
};

/**
 * Tinted panel: background and border only, no text colour.
 * For callouts, where the body has to stay in normal ink to read well at length.
 */
export const toneSurfaceClass: Record<Tone, string> = {
  gray: 'bg-tone-gray-bg border-tone-gray-border',
  blue: 'bg-tone-blue-bg border-tone-blue-border',
  violet: 'bg-tone-violet-bg border-tone-violet-border',
  green: 'bg-tone-green-bg border-tone-green-border',
  amber: 'bg-tone-amber-bg border-tone-amber-border',
  red: 'bg-tone-red-bg border-tone-red-border',
  teal: 'bg-tone-teal-bg border-tone-teal-border',
  pink: 'bg-tone-pink-bg border-tone-pink-border',
};

/** Text-only colour, for icons and inline emphasis. */
export const toneTextClass: Record<Tone, string> = {
  gray: 'text-tone-gray-ink',
  blue: 'text-tone-blue-ink',
  violet: 'text-tone-violet-ink',
  green: 'text-tone-green-ink',
  amber: 'text-tone-amber-ink',
  red: 'text-tone-red-ink',
  teal: 'text-tone-teal-ink',
  pink: 'text-tone-pink-ink',
};

/**
 * Raw CSS variable for a tone's solid colour, for the few places that need an
 * inline style (gradient stops, SVG fills computed at build time).
 */
export const toneSolidVar: Record<Tone, string> = {
  gray: 'var(--color-tone-gray-solid)',
  blue: 'var(--color-tone-blue-solid)',
  violet: 'var(--color-tone-violet-solid)',
  green: 'var(--color-tone-green-solid)',
  amber: 'var(--color-tone-amber-solid)',
  red: 'var(--color-tone-red-solid)',
  teal: 'var(--color-tone-teal-solid)',
  pink: 'var(--color-tone-pink-solid)',
};
