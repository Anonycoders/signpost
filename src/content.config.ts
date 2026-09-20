import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

import { DOCS_DIR } from './lib/doc-links';
import { streamlineSchema, teamSchema } from './lib/schema';

/**
 * Content lives in `content/` at the repository root rather than under `src/`,
 * so contributors never have to open the application code to publish an update.
 *
 * Ids come from the file path:
 *   content/teams/devops.yaml                  -> "devops"
 *   content/streamlines/devops/k8s-1-31.yaml   -> "devops/k8s-1-31"
 *
 * Both collections are YAML, which is what makes `schemas/` useful: an editor
 * can only attach a JSON Schema to a whole file, never to a frontmatter block,
 * so the format is what buys a contributor completion and inline errors as
 * they type. The long prose lives in a `body:` block scalar, the same way an
 * update's body always has.
 */

const teams = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './content/teams' }),
  schema: teamSchema,
});

const streamlines = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './content/streamlines' }),
  schema: streamlineSchema,
});

/**
 * The written guides, which are pages of the site and files in the repository
 * at the same time. There is no schema and no frontmatter: these files have to
 * stay clean for someone reading them on GitHub, so the title and the summary
 * are read from the body instead.
 *
 * The glob is flat by design — anything a maintainer drops into `docs/` becomes
 * a page without being registered anywhere, and `docs/screenshots/` does not.
 * `CONTRIBUTING.md` lives at the root and stays a repository file: its reader
 * is on their way to opening a pull request.
 */
const docs = defineCollection({
  loader: glob({ pattern: '*.md', base: `./${DOCS_DIR}` }),
});

export const collections = { teams, streamlines, docs };
