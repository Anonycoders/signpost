import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { streamlineSchema, teamSchema } from '../src/lib/schema';

/**
 * Turns the Zod schemas into JSON Schema, for editors.
 *
 * This is the half of content authoring that no amount of validation can
 * replace. `npm run validate` and CI tell a contributor what they got wrong
 * after they have written it; a schema attached to the file tells them while
 * they are typing, offers the field names, and lists the stages that exist.
 *
 * Generated rather than hand-written, for one reason that matters more than
 * saving the typing: the stages, the categories and the impact levels come
 * from `site.config.ts`. A fork that renames `deprecated` to `sunsetting` gets
 * a schema that offers `sunsetting`, and a hand-written one would have gone on
 * quietly offering a value the validator rejects.
 *
 * Which is also why the output is committed and CI re-runs this with
 * `--check`. Editors read a file from the working tree; nothing about opening
 * a repository runs a build step first, so a schema that only existed after
 * `npm run schema` would be missing exactly when it is wanted.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCHEMA_DIR = join(ROOT, 'schemas');

interface Generated {
  file: string;
  json: string;
}

/**
 * What a date is, once. `dateSchema` accepts a Date as well as a string,
 * because YAML hands over an unquoted `2026-01-15` already parsed — but an
 * author types the same eight digits either way, and that is the only thing an
 * editor should be checking them against.
 */
const CALENDAR_DATE = {
  type: 'string',
  format: 'date',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'A calendar date, written YYYY-MM-DD. For example 2026-03-01.',
};

function toJsonSchema(schema: z.ZodType, title: string, id: string): string {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    // The date branch is the only thing here JSON Schema cannot express, and
    // the override below replaces it outright — so nothing survives as `any`.
    unrepresentable: 'any',
    override: (ctx) => {
      // `.meta()` is on the classic schema wrapper; what `override` is handed
      // is the core one, so the id is read from the registry that `.meta()`
      // wrote it to.
      if (z.globalRegistry.get(ctx.zodSchema)?.id !== 'calendar-date') return;

      for (const key of Object.keys(ctx.jsonSchema)) delete ctx.jsonSchema[key];
      Object.assign(ctx.jsonSchema, CALENDAR_DATE);
    },
  });

  return `${JSON.stringify({ $id: id, title, ...json }, null, 2)}\n`;
}

export function generate(): Generated[] {
  return [
    {
      file: 'streamline.schema.json',
      json: toJsonSchema(
        streamlineSchema,
        'Signpost streamline',
        'https://github.com/Anonycoders/signpost/schemas/streamline.schema.json',
      ),
    },
    {
      file: 'team.schema.json',
      json: toJsonSchema(
        teamSchema,
        'Signpost team',
        'https://github.com/Anonycoders/signpost/schemas/team.schema.json',
      ),
    },
  ];
}

/** What is on disk, or null when nothing is. */
function current(file: string): string | null {
  try {
    return readFileSync(join(SCHEMA_DIR, file), 'utf8');
  } catch {
    return null;
  }
}

function main(): void {
  const check = process.argv.includes('--check');
  const stale = generate().filter((one) => current(one.file) !== one.json);

  if (!check) {
    for (const one of generate()) writeFileSync(join(SCHEMA_DIR, one.file), one.json);
    console.log(`Wrote ${generate().length} schemas to schemas/.`);
    return;
  }

  if (stale.length === 0) {
    console.log('Schemas are up to date.');
    return;
  }

  // The likeliest cause by a distance: site.config.ts gained or renamed a
  // stage, a category or an impact level, and the schema still offers the old
  // list. Say that, rather than printing a diff nobody asked for.
  console.error(
    [
      `Out of date: ${stale.map((one) => `schemas/${one.file}`).join(', ')}`,
      '',
      'The schemas are generated from src/lib/schema.ts and site.config.ts, and',
      'committed so an editor can read them without a build step. Run:',
      '',
      '    npm run schema',
      '',
      'and commit the result.',
    ].join('\n'),
  );
  process.exit(1);
}

// Only when run as a script — the tests import `generate` directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
