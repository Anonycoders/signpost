import type { APIContext } from 'astro';

import { siteConfig } from '@config';
import { atomResponse, buildAtomFeed } from '@/lib/atom';
import { getStreamlinesForTeam, getTeams } from '@/lib/content';
import { toEntries } from '@/lib/feeds';
import { url } from '@/lib/url';

/**
 * One feed per team, for the common case: a team that depends on the platform
 * team next door and wants to hear from them without subscribing to everything.
 */

export async function getStaticPaths() {
  const teams = await getTeams();
  return teams.map((team) => ({ params: { slug: team.slug }, props: { team } }));
}

export async function GET(context: APIContext): Promise<Response> {
  const site = context.site ?? new URL('http://localhost:4321');
  const slug = context.params.slug ?? '';
  const team = (await getTeams()).find((candidate) => candidate.slug === slug);

  if (!team) {
    throw new Error(`No team found for "${slug}". This should be unreachable.`);
  }

  const updates = (await getStreamlinesForTeam(team.slug)).flatMap(
    (streamline) => streamline.updates,
  );

  return atomResponse(
    buildAtomFeed({
      id: new URL(team.href, site).href,
      title: `${siteConfig.name} — ${team.name}`,
      subtitle: team.mission,
      self: new URL(url(`/teams/${team.slug}/feed.xml`), site).href,
      alternate: new URL(team.href, site).href,
      author: team.name,
      language: siteConfig.locale,
      entries: toEntries(updates, site),
    }),
  );
}
