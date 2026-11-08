// Checks docs/DESIGN.md and docs/UI_RULES.md against its own rules ("How this document works"):
// every rule carries a status tag, and no amendment-style section creeps back in.
// Runs in `npm run lint`, so CI fails when the document drifts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Both documents follow the same rules (UI_RULES.md says so in its own "How this document works").
const FILES = ['DESIGN.md', 'UI_RULES.md'];

const TAG = /^\[(Built|Differs|To build|Proposed|Default(?:\s*[·-]\s*in game)?)\]\s/;
// Sections that explain the document or collect questions; they hold no rules.
const UNTAGGED_SECTIONS = /^(\d+\.\s*)?(How this document works|Open questions|Changelog)\b/i;
// Headings that mean "an old rule plus a patch": rewrite the rule in place instead.
const BANNED_HEADING =
  /\b(amendments?|addend(um|a)|errata|defaults for|updates?|changes since|patch notes|revisions?)\b/i;

const errors = [];
const counts = {};

for (const file of FILES) {
  const path = fileURLToPath(new URL(`../docs/${file}`, import.meta.url));
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const start = errors.length;
  let section = null;
  let checked = false;
  const required = { open: false, changelog: false };

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const title = heading[2];
      if (BANNED_HEADING.test(title)) {
        errors.push(
          `${n}: heading "${title}" looks like an amendment section; rewrite the rules in place`,
        );
      }
      if (heading[1].length === 2) {
        section = title;
        checked = !UNTAGGED_SECTIONS.test(title);
        if (/open questions/i.test(title)) required.open = true;
        if (/changelog/i.test(title)) required.changelog = true;
      }
      return;
    }
    if (section && /changelog/i.test(section) && /^[-*] /.test(line)) {
      if (
        !/^[-*] \d{4}-\d{2}-\d{2} /.test(line) &&
        !/^[-*] \d{4}-\d{2}-\d{2} and earlier/.test(line)
      ) {
        errors.push(`${n}: changelog lines start with a date (YYYY-MM-DD)`);
      }
      return;
    }
    if (!checked || line === '' || /^\s/.test(line) || line.startsWith('_')) return;
    if (line.startsWith('|')) {
      errors.push(
        `${n}: a table in a rule section must sit inside a tagged rule (indent it under the bullet)`,
      );
      return;
    }
    const body = line.replace(/^([-*]|\d+\.)\s+/, '');
    const tag = TAG.exec(body);
    if (!tag) {
      errors.push(`${n}: rule without a status tag in "${section}": ${line.slice(0, 80)}`);
      return;
    }
    const name = tag[1].startsWith('Default') ? 'Default' : tag[1];
    counts[name] = (counts[name] ?? 0) + 1;
  });

  if (!required.open) errors.push('missing the "Open questions" section');
  if (!required.changelog) errors.push('missing the "Changelog" section');
  for (let k = start; k < errors.length; k++) errors[k] = `${file} ${errors[k]}`;
}

if (errors.length > 0) {
  console.error(`docs/DESIGN.md or docs/UI_RULES.md break their own rules (${errors.length}):`);
  for (const e of errors) console.error(`  line ${e}`);
  console.error('See "How this document works" at the top of docs/DESIGN.md.');
  process.exit(1);
}

const summary = Object.entries(counts)
  .map(([k, v]) => `${v} ${k}`)
  .join(', ');
console.log(`docs/DESIGN.md + docs/UI_RULES.md: ok (${summary})`);
