import type { APIContext } from 'astro';

import { siteConfig } from '@config';
import { atomResponse, buildAtomFeed } from '@/lib/atom';
import { getAllUpdates } from '@/lib/content';
import { toEntries } from '@/lib/feeds';
import { url } from '@/lib/url';

/**
 * Every update from every team, newest first.
 *
 * The whole point of the site is that nobody has to remember to check it, so
 * this is the subscription a reader sets up once and then forgets about.
 */
export async function GET(context: APIContext): Promise<Response> {
  const site = context.site ?? new URL('http://localhost:4321');
  const updates = await getAllUpdates();

  return atomResponse(
    buildAtomFeed({
      id: new URL(url('/'), site).href,
      title: `${siteConfig.name} — all updates`,
      subtitle: siteConfig.tagline,
      self: new URL(url('/feed.xml'), site).href,
      alternate: new URL(url('/changes'), site).href,
      author: siteConfig.organization,
      language: siteConfig.locale,
      entries: toEntries(updates, site),
    }),
  );
}
