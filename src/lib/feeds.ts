import { updateAnchor } from './anchor';
import { escapeXml, type AtomEntry } from './atom';
import { formatDate } from './date';
import { renderInlineMarkdown, renderMarkdown, toPlainInline, toPlainText } from './markdown';

/**
 * Turning updates into feed entries.
 *
 * Shared by the site-wide feed and the per-team ones so every entry is built
 * the same way — same id scheme, same summary, same wording for a change that
 * lands later than it was announced.
 *
 * Structural types rather than the content types, so this stays testable
 * without a content collection behind it.
 */

export interface FeedUpdate {
  date: Date;
  effective?: Date;
  title: string;
  body?: string;
  actions?: string[];
  impact: { label: string };
  streamline: {
    title: string;
    href: string;
    team: { name: string };
    category: { label: string };
    owners: Array<{ name: string }>;
  };
}

/** Absolute URL of the update's place on its streamline page. */
function updateUrl(update: FeedUpdate, site: URL): string {
  return new URL(`${update.streamline.href}#${updateAnchor(update)}`, site).href;
}

/**
 * The line a reader needs before the body: how much this matters, and the date
 * it happens. Feed readers show entries out of context, so the streamline name
 * has to be in the entry itself rather than only in the feed title.
 */
function heading(update: FeedUpdate): string {
  // Escaped here as HTML, and escaped again by the feed writer as XML. That is
  // not a mistake: the reader unwraps one layer when it parses the document and
  // the other when it renders the markup.
  const label = escapeXml(`${update.impact.label} · ${update.streamline.title}`);
  const when = update.effective ? ` — takes effect ${escapeXml(formatDate(update.effective))}` : '';

  return `<p><strong>${label}</strong>${when}</p>`;
}

/**
 * The actions as one flat sentence, for a summary that carries no markup.
 *
 * Numbered rather than strung together with a separator. An action is a line an
 * author punctuated as they saw fit, and "Redeploy.; Tell your team." reads
 * like a mistake — a number belongs to the list rather than to the sentence.
 *
 * Flattened the same way the body above it is, so an action written with a code
 * span arrives as the words it is about rather than as backticks.
 */
function actionSentence(actions: string[]): string {
  const numbered = actions.map((action, index) => `(${index + 1}) ${toPlainInline(action)}`);

  return `What you need to do: ${numbered.join(' ')}`;
}

/**
 * The same list as markup, for the entry body a reader displays.
 *
 * Rendered, not escaped: these are markup by the time they get here, the same
 * as the body beside them, and the feed writer escapes the whole document once
 * on the way out. The reader unwraps that layer when it parses the document and
 * finds the markup underneath.
 */
function actionList(actions: string[]): string {
  const items = actions.map((action) => `<li>${renderInlineMarkdown(action)}</li>`).join('');

  return `<p><strong>What you need to do</strong></p><ul>${items}</ul>`;
}

function toEntry(update: FeedUpdate, site: URL): AtomEntry {
  const link = updateUrl(update, site);
  const body = update.body ? renderMarkdown(update.body) : '';

  const actions = update.actions ?? [];

  const summaryParts = [
    update.effective ? `Takes effect ${formatDate(update.effective)}.` : null,
    update.body ? toPlainText(update.body) : null,
    actions.length > 0 ? actionSentence(actions) : null,
  ].filter((part): part is string => part !== null);

  return {
    // The permalink doubles as the entry id. It is stable for as long as the
    // site keeps its address, and a reader's unread state survives rebuilds.
    id: link,
    // Prefixed with the streamline, because a reader's list shows titles alone
    // and "Ingress v1beta1 is removed" on its own says nothing about what for.
    title: `${update.streamline.title}: ${update.title}`,
    updated: update.date,
    link,
    summary: summaryParts.length > 0 ? summaryParts.join(' ') : update.title,
    content: `${heading(update)}${body}${actions.length > 0 ? actionList(actions) : ''}`,
    authors: update.streamline.owners.map((owner) => owner.name),
    categories: [
      update.streamline.team.name,
      update.streamline.category.label,
      update.impact.label,
    ],
  };
}

/** Newest first, capped so a long-lived instance does not ship a huge document. */
export function toEntries(updates: FeedUpdate[], site: URL, limit = 50): AtomEntry[] {
  return [...updates]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, limit)
    .map((update) => toEntry(update, site));
}
