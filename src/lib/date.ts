import { siteConfig } from '@config';

/**
 * Date helpers.
 *
 * Everything formats in UTC on purpose. Content authors write a plain calendar
 * day (`2026-11-02`), and a reader in any timezone must see that same day — not
 * one shifted backwards because their offset is negative.
 */

const MS_PER_DAY = 86_400_000;

const longFormatter = new Intl.DateTimeFormat(siteConfig.locale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const shortFormatter = new Intl.DateTimeFormat(siteConfig.locale, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const monthFormatter = new Intl.DateTimeFormat(siteConfig.locale, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2 November 2026" */
export const formatDate = (date: Date): string => longFormatter.format(date);

/** "2 Nov 2026" */
export const formatDateShort = (date: Date): string => shortFormatter.format(date);

/** "November 2026" */
export const formatMonth = (date: Date): string => monthFormatter.format(date);

/** Machine-readable value for a <time datetime> attribute. */
export const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Today at UTC midnight, so comparisons against content dates are day-accurate. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Whole days from today to `date`. Negative when the date has passed. */
function daysFromToday(date: Date): number {
  return Math.round((date.getTime() - today().getTime()) / MS_PER_DAY);
}

export const isFuture = (date: Date): boolean => daysFromToday(date) > 0;

/**
 * How far away something is, in words: "in 3 weeks", "today", "2 months ago".
 * Used next to dates, never instead of them — a reader planning work needs the
 * actual day as well.
 */
export function relativeDays(date: Date): string {
  const days = daysFromToday(date);

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';

  const magnitude = Math.abs(days);
  const suffix = days > 0 ? 'in ' : '';
  const past = days < 0 ? ' ago' : '';

  let amount: string;
  if (magnitude < 14) amount = `${magnitude} days`;
  else if (magnitude < 60) amount = `${Math.round(magnitude / 7)} weeks`;
  else if (magnitude < 365) amount = `${Math.round(magnitude / 30)} months`;
  else {
    const years = magnitude / 365;
    amount = years < 1.5 ? 'a year' : `${Math.round(years)} years`;
  }

  return `${suffix}${amount}${past}`;
}

/** Calendar quarter containing `date`, as `{ year: 2026, quarter: 3 }`. */
export function quarterOf(date: Date): { year: number; quarter: number } {
  return {
    year: date.getUTCFullYear(),
    quarter: Math.floor(date.getUTCMonth() / 3) + 1,
  };
}

/** First day of a quarter, at UTC midnight. */
export function quarterStart(year: number, quarter: number): Date {
  return new Date(Date.UTC(year, (quarter - 1) * 3, 1));
}

/** First day of the quarter after this one — an exclusive end bound. */
export function quarterEnd(year: number, quarter: number): Date {
  return quarter === 4 ? quarterStart(year + 1, 1) : quarterStart(year, quarter + 1);
}

export const quarterLabel = (year: number, quarter: number): string => `Q${quarter} ${year}`;
