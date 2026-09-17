import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

import { streamlineSchema, teamSchema } from './lib/schema';

/**
 * Content lives in `content/` at the repository root rather than under `src/`,
 * so contributors never have to open the application code to publish an update.
 *
 * Ids come from the file path:
 *   content/teams/devops.yaml                  -> "devops"
 *   content/streamlines/devops/k8s-1-31.md     -> "devops/k8s-1-31"
 */

const teams = defineCollection({
  loader: glob({ pattern: '**/*.{yaml,yml}', base: './content/teams' }),
  schema: teamSchema,
});

const streamlines = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/streamlines' }),
  schema: streamlineSchema,
});

export const collections = { teams, streamlines };
