import { describe, expect, it } from 'vitest';

import { renderMarkdown, toPlainText } from './markdown';

/**
 * This renderer now handles every piece of prose on the site — update bodies,
 * which it always did, and the long body of a streamline, which used to go
 * through Astro's pipeline. The tests below are the two things that pipeline
 * did which a bare Markdown parser does not, plus the one it never did.
 *
 * The heading ids matter more than they look. A body is written in `##`
 * sections, and the link somebody pastes into a chat message to point a
 * colleague at one of them is an id on a heading. Losing them would break
 * links already shared, silently, with nothing failing anywhere.
 */

describe('headings', () => {
  it('gives each one the id GitHub would give it', () => {
    expect(renderMarkdown('## What happens on 31 March 2027')).toContain(
      '<h2 id="what-happens-on-31-march-2027">',
    );
  });

  it('keeps two headings on one page apart', () => {
    const html = renderMarkdown('## Next steps\n\n## Next steps\n');

    expect(html).toContain('id="next-steps"');
    expect(html).toContain('id="next-steps-1"');
  });

  it('starts over for the next body, so one page does not leak into the next', () => {
    // The slugger holds the ids it has already handed out. Shared across
    // renders it would number the second page's first heading "-1", and every
    // link into that page would be wrong from the second build onwards.
    renderMarkdown('## Next steps');

    expect(renderMarkdown('## Next steps')).toContain('id="next-steps"');
  });
});

describe('what it refuses to pass through', () => {
  it('drops raw HTML rather than rendering it', () => {
    const html = renderMarkdown('Before\n\n<script>alert(1)</script>\n\nAfter');

    expect(html).not.toContain('<script>');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });
});

describe('plain text', () => {
  it('keeps the words and loses the markup', () => {
    expect(toPlainText('## Heading\n\nSome **bold** prose.')).toBe('Heading Some bold prose.');
  });

  it('cuts a long body at a word boundary', () => {
    const text = toPlainText(`${'alpha bravo '.repeat(50)}end`, 40);

    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(41);
    // The cut lands after a whole word, never part-way through one.
    expect(text.slice(0, -1)).toMatch(/(alpha|bravo)$/);
  });
});
