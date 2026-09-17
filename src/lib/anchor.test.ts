import { describe, expect, it } from 'vitest';

import { slugify, updateAnchor } from './anchor';

/**
 * These strings end up in published feed entry ids, which must never change.
 * The tests therefore pin exact output rather than shape.
 */

describe('slugify', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Ingress v1beta1 is removed')).toBe('ingress-v1beta1-is-removed');
  });

  it('collapses punctuation rather than leaving it in a URL', () => {
    expect(slugify('Jenkins: what now? (part 2)')).toBe('jenkins-what-now-part-2');
  });

  it('folds accents to ASCII instead of dropping the letters', () => {
    expect(slugify('Über die Brücke')).toBe('uber-die-brucke');
  });

  it('never starts or ends with a dash', () => {
    expect(slugify('  — leading and trailing —  ')).toBe('leading-and-trailing');
  });

  it('truncates at a word boundary so the fragment stays readable', () => {
    const slug = slugify(
      'A very long update title that goes well past the limit we allow for anchors',
    );

    expect(slug).toBe('a-very-long-update-title-that-goes-well-past');
    expect(slug.endsWith('-')).toBe(false);
  });

  it('returns an empty string when there is nothing usable left', () => {
    expect(slugify('— ?! —')).toBe('');
  });
});

describe('updateAnchor', () => {
  it('combines the posting date with the title', () => {
    expect(
      updateAnchor({ date: new Date('2026-09-10T00:00:00Z'), title: 'Ingress v1beta1 is removed' }),
    ).toBe('update-2026-09-10-ingress-v1beta1-is-removed');
  });

  it('still yields a usable anchor for a title with no words in it', () => {
    expect(updateAnchor({ date: new Date('2026-09-10T00:00:00Z'), title: '!!!' })).toBe(
      'update-2026-09-10',
    );
  });

  it('is unchanged by an effective date, so published ids stay put', () => {
    const update = { date: new Date('2026-09-10T00:00:00Z'), title: 'Migrate by November' };
    const announcedEarly = { ...update, effective: new Date('2026-11-02T00:00:00Z') };

    expect(updateAnchor(announcedEarly)).toBe(updateAnchor(update));
  });
});
