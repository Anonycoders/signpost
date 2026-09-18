import { describe, expect, it } from 'vitest';

import {
  docSlugForPath,
  docSummary,
  docTitle,
  readingMinutes,
  resolveDocHref,
  viewRouteForPageSource,
  type DocLinkContext,
} from './doc-links';

/**
 * The guides in `docs/` have to read correctly in two places at once: on
 * GitHub, where their links are plain repository paths, and on this site, where
 * those same links have to become routes and blob URLs. These tests pin down
 * the translation between the two.
 */

const root: DocLinkContext = {
  from: 'docs/using.md',
  base: '/',
  repository: 'https://github.com/example-org/signpost',
  branch: 'main',
};

const subpath: DocLinkContext = { ...root, base: '/signpost/' };

describe('resolveDocHref — links that are left alone', () => {
  it('leaves an in-page anchor untouched, so the tables of contents keep working', () => {
    expect(resolveDocHref('#the-roadmap', root)).toBe('#the-roadmap');
  });

  it('leaves an absolute URL untouched', () => {
    expect(resolveDocHref('https://pagefind.app/', root)).toBe('https://pagefind.app/');
  });

  it('leaves a protocol-relative URL untouched', () => {
    expect(resolveDocHref('//example.com/x', root)).toBe('//example.com/x');
  });

  it('leaves a mailto: link untouched', () => {
    expect(resolveDocHref('mailto:platform@example.com', root)).toBe(
      'mailto:platform@example.com',
    );
  });

  it('leaves an already-absolute site path untouched', () => {
    expect(resolveDocHref('/roadmap/', root)).toBe('/roadmap/');
  });

  it('leaves an empty href untouched', () => {
    expect(resolveDocHref('', root)).toBe('');
  });

  it('leaves a path that escapes the repository root untouched', () => {
    expect(resolveDocHref('../../elsewhere/file.md', root)).toBe('../../elsewhere/file.md');
  });
});

describe('resolveDocHref — links to another guide', () => {
  it('points a sibling doc at its page on this site', () => {
    expect(resolveDocHref('adopting.md', { ...root, from: 'docs/developing.md' })).toBe(
      '/docs/adopting/',
    );
  });

  it('keeps the anchor when it points at a section of another guide', () => {
    expect(
      resolveDocHref('adopting.md#5-deploy-to-pages', { ...root, from: 'docs/developing.md' }),
    ).toBe('/docs/adopting/#5-deploy-to-pages');
  });

  it('handles an explicitly relative sibling', () => {
    expect(resolveDocHref('./using.md', { ...root, from: 'docs/developing.md' })).toBe(
      '/docs/using/',
    );
  });

  it('handles a doc reached by going up and back down again', () => {
    expect(resolveDocHref('../docs/using.md', { ...root, from: 'docs/developing.md' })).toBe(
      '/docs/using/',
    );
  });

  it('carries the base path onto doc links on a subpath install', () => {
    expect(
      resolveDocHref('adopting.md#5-deploy-to-pages', { ...subpath, from: 'docs/developing.md' }),
    ).toBe('/signpost/docs/adopting/#5-deploy-to-pages');
  });
});

describe('resolveDocHref — links to a view', () => {
  it('points an index.astro source at the route it builds', () => {
    expect(resolveDocHref('../src/pages/roadmap/index.astro', root)).toBe('/roadmap/');
  });

  it('does the same for the other two views the reading guide links', () => {
    expect(resolveDocHref('../src/pages/changes/index.astro', root)).toBe('/changes/');
    expect(resolveDocHref('../src/pages/streamlines/index.astro', root)).toBe('/streamlines/');
  });

  it('points the top-level index at the home page', () => {
    expect(resolveDocHref('../src/pages/index.astro', root)).toBe('/');
  });

  it('carries the base path onto view links on a subpath install', () => {
    expect(resolveDocHref('../src/pages/roadmap/index.astro', subpath)).toBe('/signpost/roadmap/');
  });

  it('treats a dynamic route as source, because it names no single view', () => {
    expect(resolveDocHref('../src/pages/teams/[slug].astro', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/src/pages/teams/[slug].astro',
    );
  });

  it('treats an endpoint as source for the same reason', () => {
    expect(resolveDocHref('../src/pages/feed.xml.ts', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/src/pages/feed.xml.ts',
    );
  });
});

describe('resolveDocHref — links to a file in the repository', () => {
  it('points a config file at its blob on the configured repository', () => {
    expect(resolveDocHref('../site.config.ts', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/site.config.ts',
    );
  });

  it('points CONTRIBUTING.md at GitHub, since it is not rendered as a page', () => {
    expect(resolveDocHref('../CONTRIBUTING.md', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/CONTRIBUTING.md',
    );
  });

  it('keeps the anchor on a blob link', () => {
    expect(resolveDocHref('../CONTRIBUTING.md#changing-the-site-itself', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/CONTRIBUTING.md#changing-the-site-itself',
    );
  });

  it('handles a dotted directory', () => {
    expect(resolveDocHref('../.github/workflows/ci.yml', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/.github/workflows/ci.yml',
    );
  });

  it('uses the configured branch rather than assuming main', () => {
    expect(resolveDocHref('../site.config.ts', { ...root, branch: 'trunk' })).toBe(
      'https://github.com/example-org/signpost/blob/trunk/site.config.ts',
    );
  });

  it('tolerates a repository URL with a trailing slash', () => {
    expect(
      resolveDocHref('../site.config.ts', {
        ...root,
        repository: 'https://github.com/example-org/signpost/',
      }),
    ).toBe('https://github.com/example-org/signpost/blob/main/site.config.ts');
  });

  it('is not affected by the base path, which belongs to the site and not to GitHub', () => {
    expect(resolveDocHref('../site.config.ts', subpath)).toBe(
      'https://github.com/example-org/signpost/blob/main/site.config.ts',
    );
  });

  it('points a nested doc asset at its blob, since only docs/*.md are pages', () => {
    expect(resolveDocHref('screenshots/roadmap.png', root)).toBe(
      'https://github.com/example-org/signpost/blob/main/docs/screenshots/roadmap.png',
    );
  });
});

describe('docSlugForPath', () => {
  it('accepts Markdown directly inside docs/', () => {
    expect(docSlugForPath('docs/using.md')).toBe('using');
  });

  it('rejects Markdown elsewhere in the repository', () => {
    expect(docSlugForPath('CONTRIBUTING.md')).toBeNull();
    expect(docSlugForPath('README.md')).toBeNull();
  });

  it('rejects Markdown nested below docs/, matching the collection glob', () => {
    expect(docSlugForPath('docs/notes/draft.md')).toBeNull();
  });

  it('rejects a non-Markdown file in docs/', () => {
    expect(docSlugForPath('docs/diagram.png')).toBeNull();
  });
});

describe('viewRouteForPageSource', () => {
  it('maps an index page to its route', () => {
    expect(viewRouteForPageSource('src/pages/changes/index.astro')).toBe('/changes/');
  });

  it('maps the root index to the home page', () => {
    expect(viewRouteForPageSource('src/pages/index.astro')).toBe('/');
  });

  it('refuses anything that is not an index page', () => {
    expect(viewRouteForPageSource('src/pages/about.astro')).toBeNull();
    expect(viewRouteForPageSource('src/pages/streamlines/[...id].astro')).toBeNull();
    expect(viewRouteForPageSource('src/pages/feed.xml.ts')).toBeNull();
  });

  it('refuses a file outside src/pages', () => {
    expect(viewRouteForPageSource('src/components/Header.astro')).toBeNull();
  });
});

describe('docTitle', () => {
  it('reads the first level-one heading', () => {
    expect(docTitle('# Reading Signpost\n\nText.\n', 'x')).toBe('Reading Signpost');
  });

  it('is not fooled by a deeper heading that comes first', () => {
    expect(docTitle('## Contents\n\n# Real title\n', 'x')).toBe('Real title');
  });

  it('falls back when a doc has no level-one heading', () => {
    expect(docTitle('## Only a section\n', 'developing')).toBe('developing');
  });
});

describe('readingMinutes', () => {
  it('rounds to whole minutes at 200 words a minute', () => {
    expect(readingMinutes('word '.repeat(600))).toBe(3);
  });

  it('never claims a document takes no time at all', () => {
    expect(readingMinutes('# Title\n')).toBe(1);
    expect(readingMinutes('')).toBe(1);
  });

  it('is not thrown off by the blank lines between paragraphs', () => {
    const body = `${'word '.repeat(200)}\n\n\n${'word '.repeat(200)}`;
    expect(readingMinutes(body)).toBe(2);
  });
});

describe('docSummary', () => {
  it('takes the first paragraph after the title', () => {
    const body = '# Title\n\nWhat this site is.\nOn two lines.\n\n## Section\n';
    expect(docSummary(body)).toBe('What this site is. On two lines.');
  });

  it('reduces links and emphasis to their text', () => {
    const body = '# Title\n\nSee [the roadmap](../x.md) for **dates** and `config`.\n';
    expect(docSummary(body)).toBe('See the roadmap for dates and config.');
  });

  it('skips headings and code blocks looking for the first paragraph', () => {
    const body = '# Title\n\n## Contents\n\n```bash\nnpm run dev\n```\n\nThe real opening.\n';
    expect(docSummary(body)).toBe('The real opening.');
  });

  it('stops at a sentence boundary rather than running long', () => {
    const body = `# Title\n\n${'A'.repeat(100)}. ${'B'.repeat(200)}\n`;
    expect(docSummary(body)).toBe(`${'A'.repeat(100)}.`);
  });

  it('keeps whole sentences while they fit', () => {
    const short = 'One sentence. ';
    const body = `# Title\n\n${short.repeat(20)}\n`;
    const summary = docSummary(body);
    expect(summary.length).toBeLessThanOrEqual(180);
    expect(summary.endsWith('One sentence.')).toBe(true);
  });

  it('is not fooled by a full stop inside a file name', () => {
    const body = `# Title\n\nFor someone changing the code. ${'x'.repeat(200)} docs/adopting.md is the guide.\n`;
    expect(docSummary(body)).toBe('For someone changing the code.');
  });

  it('breaks at a word when the opening has no sentence that fits', () => {
    const body = `# Title\n\n${'word '.repeat(60)}\n`;
    const summary = docSummary(body);
    expect(summary.endsWith('word…')).toBe(true);
    expect(summary.length).toBeLessThanOrEqual(181);
  });

  it('returns an empty string for a doc with no prose', () => {
    expect(docSummary('# Title\n')).toBe('');
  });
});
