import { describe, expect, it } from 'vitest';

import { renderInlineMarkdown, renderMarkdown, toPlainInline, toPlainText } from './markdown';

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

  /**
   * The renderer escapes because its output is HTML. This output is not, so an
   * entity here is not a character being kept safe — it is a character written
   * in a language nothing downstream speaks. Deleting them, which is what this
   * used to do, took the word with it and said nothing.
   */
  describe('entities', () => {
    it('keeps a placeholder the sentence is about', () => {
      // The sample's own Kubernetes body: the command is the point of the
      // sentence, and the part a reader has to substitute used to vanish.
      expect(toPlainText('Run `kubectl deprecations --context <your-cluster>` first.')).toBe(
        'Run kubectl deprecations --context <your-cluster> first.',
      );
    });

    it('reads an ampersand as written', () => {
      expect(toPlainText('R&D switch it off on 2 November.')).toBe(
        'R&D switch it off on 2 November.',
      );
    });

    it('brings back quotes and apostrophes', () => {
      expect(toPlainText('The "beta" flag is the team\'s to remove.')).toBe(
        'The "beta" flag is the team\'s to remove.',
      );
    });

    it('decodes once and stops', () => {
      // An author who writes `&amp;lt;` means the five characters `&lt;` — it
      // is how you show an entity to a reader. Decoding twice would put a `<`
      // on the screen that nobody typed.
      expect(toPlainText('Write &amp;lt; to show a less-than sign.')).toBe(
        'Write &lt; to show a less-than sign.',
      );
    });

    it('decodes a numeric reference, and leaves a nonsense one alone', () => {
      expect(toPlainText('&#8212; and &#x2014; are both dashes')).toBe('— and — are both dashes');
      // Nothing a sentence can hold, so it stays visible rather than becoming
      // an invisible character in the middle of a line.
      expect(toPlainText('&#0; is not a character')).toBe('&#0; is not a character');
    });

    it('leaves an entity it does not know rather than deleting it', () => {
      // Visibly odd is something a writer can see and fix. A missing word is
      // not — which was the whole trouble with the old behaviour.
      expect(toPlainText('&copy; 2026, and the rest')).toBe('&copy; 2026, and the rest');
    });

    it('still refuses to carry markup through', () => {
      // Decoding happens after tags are stripped, never before, or a `&lt;`
      // would turn into markup and take the rest of the sentence with it.
      expect(toPlainText('Before\n\n<script>alert(1)</script>\n\nAfter')).toBe('Before After');
    });
  });

  /**
   * Stripping a tag leaves a space, or two paragraphs run together into a word
   * that is in neither of them. Leaving one where a word merely stopped being
   * bold is the opposite mistake, and the visible one: the sample's own body
   * reads "starting **1 October**." and arrived as "starting 1 October ."
   */
  describe('where the spaces go', () => {
    it('keeps punctuation against the word it follows', () => {
      expect(toPlainText('Waves start **1 October**. Check `kubectl` first.')).toBe(
        'Waves start 1 October. Check kubectl first.',
      );
    });

    it('still keeps two paragraphs apart', () => {
      expect(toPlainText('First paragraph\n\nSecond paragraph')).toBe(
        'First paragraph Second paragraph',
      );
    });

    it('still keeps two list items apart', () => {
      expect(toPlainText('- Redeploy\n- Tell your team')).toBe('Redeploy Tell your team');
    });
  });

  it('cuts a long body at a word boundary', () => {
    const text = toPlainText(`${'alpha bravo '.repeat(50)}end`, 40);

    expect(text.endsWith('…')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(41);
    // The cut lands after a whole word, never part-way through one.
    expect(text.slice(0, -1)).toMatch(/(alpha|bravo)$/);
  });
});

/**
 * The inline renderer is for a field that holds a line rather than a passage —
 * an action. What makes it the right tool is not what it adds but what it never
 * looks for: an author writing `1. Redeploy` gets the number they typed, and
 * nothing on this site can grow a heading inside one item of a list.
 */
describe('one line of Markdown', () => {
  it('renders the three things an instruction reaches for', () => {
    expect(renderInlineMarkdown('Pin **every** chart to `1.31` — see [the guide](/k8s/).')).toBe(
      'Pin <strong>every</strong> chart to <code>1.31</code> — see <a href="/k8s/">the guide</a>.',
    );
  });

  it('leaves block syntax as the characters they are', () => {
    // Each of these would become an element in a body. Here they are text,
    // because an action is already one item of a list somebody else is drawing.
    expect(renderInlineMarkdown('# Not a heading')).toBe('# Not a heading');
    expect(renderInlineMarkdown('1. Redeploy to staging')).toBe('1. Redeploy to staging');
    expect(renderInlineMarkdown('- Not a nested bullet')).toBe('- Not a nested bullet');
  });

  it('drops raw HTML, the same as a body does', () => {
    expect(renderInlineMarkdown('Run <script>alert(1)</script> nowhere')).toBe(
      'Run alert(1) nowhere',
    );
  });
});

/**
 * An action reaches two places that cannot show markup: the feed summary a
 * reader skims, and the chat message. Both get the words, and the words are
 * what the page shows — so the three consumers say the same sentence.
 */
describe('one line as plain text', () => {
  it('keeps what the line is about and loses what it is written in', () => {
    expect(toPlainInline('Pin **every** chart to `1.31` — see [the guide](/k8s/).')).toBe(
      'Pin every chart to 1.31 — see the guide.',
    );
  });

  it('keeps a placeholder inside a code span', () => {
    expect(toPlainInline('Run `kubectl deprecations --context <your-cluster>` first.')).toBe(
      'Run kubectl deprecations --context <your-cluster> first.',
    );
  });

  it('flattens through the same parser the page renders with', () => {
    // Not a detail: flattened through the block parser, `1. Redeploy` would
    // lose its number here while keeping it on the page, and a reader comparing
    // the chat message to the site would find two different instructions.
    expect(toPlainInline('1. Redeploy to staging')).toBe('1. Redeploy to staging');
  });
});
