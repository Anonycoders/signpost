import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { generate } from './json-schema';
import { siteConfig } from '../site.config';

/**
 * What these tests are guarding is not the shape of some JSON. It is that the
 * file an editor reads says the same thing the validator does.
 *
 * A schema that drifts is worse than no schema: it offers a contributor a
 * stage that CI will reject, or accepts a field the build ignores, and it does
 * it in a tooltip that looks authoritative. The checks below are therefore
 * about agreement — with site.config.ts, and with what is committed.
 */

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const schemas = Object.fromEntries(generate().map((one) => [one.file, JSON.parse(one.json)]));
const streamline = schemas['streamline.schema.json'];
const team = schemas['team.schema.json'];

describe('the committed files', () => {
  /**
   * Comments are not JSON, however many editors quietly accept them. VS Code
   * parses its own `.vscode/*.json` leniently and would never complain, so the
   * day one of those files grows a `//` the only thing that notices is whatever
   * else tries to read it — which by then is someone else's tooling, not ours.
   */
  it('are JSON, in every file this repository ships as JSON', () => {
    const files = [
      'package.json',
      'tsconfig.json',
      '.vscode/settings.json',
      '.vscode/extensions.json',
      ...generate().map((one) => `schemas/${one.file}`),
    ];

    for (const file of files) {
      expect(() => JSON.parse(readFileSync(join(ROOT, file), 'utf8')), file).not.toThrow();
    }
  });

  it('match what the generator produces', () => {
    // If this fails, `npm run schema` was not run after a change to the
    // schemas or to site.config.ts — which is exactly what CI checks too.
    for (const one of generate()) {
      expect(readFileSync(join(ROOT, 'schemas', one.file), 'utf8')).toBe(one.json);
    }
  });
});

describe('the configured vocabulary', () => {
  it('offers this fork own lifecycle stages, not a hardcoded list', () => {
    expect(streamline.properties.status.enum).toEqual(siteConfig.lifecycle.map((one) => one.id));
  });

  it('offers this fork own categories', () => {
    expect(streamline.properties.category.enum).toEqual(siteConfig.categories.map((one) => one.id));
  });

  it('offers this fork own impact levels on an update', () => {
    expect(streamline.properties.updates.items.properties.impact.enum).toEqual(
      siteConfig.impactLevels.map((one) => one.id),
    );
  });

  it('keeps a phase off the stages a phase cannot be in', () => {
    // A phase rolls out; the thing being rolled out is what deprecates.
    const phase = streamline.properties.phases.items.properties.status.enum;

    expect(phase).not.toContain('deprecated');
    expect(phase).not.toContain('retired');
  });

  it('names a timeline key per stage and refuses any other', () => {
    expect(Object.keys(streamline.properties.timeline.properties)).toEqual(
      siteConfig.lifecycle.map((one) => one.id),
    );
    expect(streamline.properties.timeline.additionalProperties).toBe(false);
  });
});

describe('dates', () => {
  /**
   * The Zod schema takes a Date or a string, because YAML hands over an
   * unquoted 2026-01-15 already parsed. Emitting that union would tell an
   * editor a date field accepts any string at all, which is the one thing it
   * must not say — a typo in a date is the mistake this site can least afford.
   */
  it('are one YYYY-MM-DD string, not a union with anything goes', () => {
    const date = streamline.$defs['calendar-date'];

    expect(date.type).toBe('string');
    expect(date.pattern).toBe('^\\d{4}-\\d{2}-\\d{2}$');
    expect(date.anyOf).toBeUndefined();
  });

  it('are the same definition everywhere one appears', () => {
    // A field may add its own description on top — `date` says what that
    // particular date means — but the format it is checked against is one
    // definition, so there is nowhere for a second, looser one to hide.
    const ref = { $ref: '#/$defs/calendar-date' };

    expect(streamline.properties.timeline.properties.proposed).toMatchObject(ref);
    expect(streamline.properties.updates.items.properties.date).toMatchObject(ref);
    expect(streamline.properties.updates.items.properties.effective).toMatchObject(ref);
    expect(streamline.properties.phases.items.properties.timeline.properties.proposed).toMatchObject(
      ref,
    );
  });
});

describe('what an author is told', () => {
  it('describes every field of both files', () => {
    const undescribed = [
      ...Object.entries(streamline.properties).map(([name, value]) => [`streamline.${name}`, value]),
      ...Object.entries(team.properties).map(([name, value]) => [`team.${name}`, value]),
    ]
      .filter(([, value]) => !(value as { description?: string }).description)
      .map(([name]) => name);

    expect(undescribed).toEqual([]);
  });

  it('marks as required exactly what the validator requires', () => {
    expect(streamline.required).toEqual([
      'title',
      'team',
      'category',
      'status',
      'summary',
      'owners',
      'timeline',
    ]);
    expect(team.required).toEqual(['name', 'mission']);
  });
});
