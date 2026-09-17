#!/usr/bin/env tsx
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateContent, type Problem } from './content-rules';

/**
 * Checks everything in content/ and reports what is wrong in a way a
 * contributor can act on without reading any of this repository's code.
 *
 * Run by CI on every pull request, and by `npm run build` so a broken file can
 * never reach the published site.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentDir = join(repoRoot, 'content');

// Colours only when a human is watching; CI logs stay clean.
const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string, text: string) => (useColour ? `[${code}m${text}[0m` : text);
const red = (text: string) => paint('31', text);
const yellow = (text: string) => paint('33', text);
const green = (text: string) => paint('32', text);
const dim = (text: string) => paint('2', text);
const bold = (text: string) => paint('1', text);

function groupByFile(problems: Problem[]): Map<string, Problem[]> {
  const grouped = new Map<string, Problem[]>();
  for (const problem of problems) {
    const existing = grouped.get(problem.file);
    if (existing) existing.push(problem);
    else grouped.set(problem.file, [problem]);
  }
  return grouped;
}

function report(problems: Problem[], marker: string) {
  for (const [file, fileProblems] of groupByFile(problems)) {
    console.error(`\n${marker} ${bold(file)}`);
    for (const problem of fileProblems) {
      const label = problem.field ? `${problem.field}: ` : '';
      console.error(`    ${label}${problem.message}`);
    }
  }
}

const { errors, warnings, counts } = validateContent(contentDir, repoRoot);

if (warnings.length > 0) {
  report(warnings, yellow('warning'));
}

if (errors.length > 0) {
  report(errors, red('error'));

  const fileCount = groupByFile(errors).size;
  console.error(
    `\n${red(`${errors.length} problem${errors.length === 1 ? '' : 's'}`)} in ${fileCount} file${
      fileCount === 1 ? '' : 's'
    }. Fix the lines above and push again.\n`,
  );
  process.exit(1);
}

const summary = `${counts.streamlines} streamline${counts.streamlines === 1 ? '' : 's'} across ${counts.teams} team${counts.teams === 1 ? '' : 's'}`;

if (warnings.length > 0) {
  console.log(
    `\n${green('Content is valid.')} ${summary}. ${dim(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} above — worth a look, but nothing is blocked.`)}\n`,
  );
} else {
  console.log(`${green('Content is valid.')} ${dim(summary)}.`);
}
