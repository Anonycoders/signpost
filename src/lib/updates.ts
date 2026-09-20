/**
 * Facts about an update that more than one thing has to agree on.
 *
 * Nothing is imported here on purpose. The site can ask these questions during
 * a build, and so can a plain Node script that has no Astro and no site
 * configuration around it — which is the only way the answers can be
 * guaranteed to match.
 */

/**
 * The day an update belongs to: when the change lands, falling back to when it
 * was written.
 *
 * Without this, a deprecation notice posted six weeks before the switch-off
 * drops into "recently changed" almost immediately, and the changes page stops
 * answering the question it exists to answer. Anything that files, sorts or
 * announces an update has to use the same day, or the site and the thing
 * beside it end up naming different dates for one event.
 */
export const landsOn = (update: { date: Date; effective?: Date }): Date =>
  update.effective ?? update.date;
