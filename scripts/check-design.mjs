// Checks the shape of the design docs. Runs in `npm run lint`, so CI fails when a document drifts.
//
// docs/DESIGN.md holds only what the game's code cannot tell anyone (the game as built is described
// in docs/PROJECT_OVERVIEW.md). Its sections and what each bullet in them must carry:
//   "Direction"                 the user's standing decisions: their words and the date.
//   "Decided, not built yet"    [To build] or [Differs], with the user's words and the date.
//   "Open questions"            free text.
//   "Choices a chat made ..."   [Default · in game] with "Overview: <section>" naming a section that
//                               exists in the overview, or [Default] / [Proposed] when not built.
// A [Built] rule does not belong in DESIGN: the PR that builds a rule removes it here and describes it
// in the overview. The file also has a size limit, so it cannot grow back into a second overview.
//
// docs/UI_RULES.md keeps its own older shape: every rule carries a status tag, no amendment-style
// section, an Open questions section and a dated Changelog.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DESIGN_MAX_BYTES = 60_000;

// Headings that mean "an old rule plus a patch": rewrite the rule in place instead.
const BANNED_HEADING =
  /\b(amendments?|addend(um|a)|errata|defaults for|updates?|changes since|patch notes|revisions?|changelog)\b/i;
const USER_WORDS = /\(user, \d{4}-\d{2}-\d{2}/;
const ANY_TAG = /^\[(Built|Differs|To build|Proposed|Default(?:\s*[·-]\s*in game)?)\]/;

/** The kinds of section DESIGN.md has, by heading text. */
const DESIGN_SECTIONS = [
  { kind: 'how', match: /^how this document works\b/i },
  { kind: 'direction', match: /^(\d+\.\s*)?direction\b/i },
  { kind: 'decided', match: /^(\d+\.\s*)?decided, not built yet\b/i },
  { kind: 'open', match: /^(\d+\.\s*)?open questions\b/i },
  { kind: 'chat', match: /^(\d+\.\s*)?choices a chat made\b/i },
];

/** The `## ` section names of the overview, for the "Overview: <section>" pointers. */
export function overviewSections(overviewText) {
  return overviewText
    .split(/\r?\n/)
    .map((l) => /^##\s+(.*?)\s*$/.exec(l))
    .filter(Boolean)
    .map((m) => m[1]);
}

/** Errors in DESIGN.md, each as "<line>: <message>". */
export function checkDesign(text, sections) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  const seen = new Set();
  let kind = null;
  let title = '';

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      if (BANNED_HEADING.test(heading[2])) {
        errors.push(
          `${n}: heading "${heading[2]}" looks like an amendment section; rewrite the rule where it stands`,
        );
      }
      if (heading[1].length === 2) {
        title = heading[2];
        const found = DESIGN_SECTIONS.find((s) => s.match.test(title));
        kind = found ? found.kind : 'unknown';
        if (found) seen.add(found.kind);
        else
          errors.push(
            `${n}: section "${title}" is not one of DESIGN's sections (Direction; Decided, not built yet; Open questions; Choices a chat made that the user never confirmed). What the game does now goes in docs/PROJECT_OVERVIEW.md`,
          );
      }
      return;
    }
    // Only top-level bullets are rules; indented lines and plain paragraphs belong to the one above.
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!bullet || kind === null || kind === 'how' || kind === 'unknown') return;
    const body = bullet[1];
    const tag = ANY_TAG.exec(body);
    if (tag && tag[1] === 'Built') {
      errors.push(
        `${n}: a [Built] rule does not belong in DESIGN.md; remove it and describe it in docs/PROJECT_OVERVIEW.md`,
      );
      return;
    }
    if (kind === 'direction') {
      if (!USER_WORDS.test(body))
        errors.push(
          `${n}: a Direction line carries the user's words and date: (user, YYYY-MM-DD: "...")`,
        );
    } else if (kind === 'decided') {
      if (!tag || !['To build', 'Differs'].includes(tag[1]))
        errors.push(`${n}: a line in "${title}" starts with [To build] or [Differs]`);
      if (!USER_WORDS.test(body))
        errors.push(
          `${n}: a decided rule carries the user's words and date: (user, YYYY-MM-DD: "..."); without them it is a chat's choice and belongs in the last section`,
        );
    } else if (kind === 'chat') {
      if (!tag || !(tag[1].startsWith('Default') || tag[1] === 'Proposed')) {
        errors.push(
          `${n}: a line in "${title}" starts with [Default · in game], [Default] or [Proposed]`,
        );
        return;
      }
      if (/in game/.test(tag[1])) {
        const pointer = /Overview: (.+?)\.?\s*$/.exec(body);
        if (!pointer) {
          errors.push(
            `${n}: a choice that is in the game names its overview section: "Overview: <section>"`,
          );
        } else if (sections && !sections.includes(pointer[1].trim())) {
          errors.push(
            `${n}: "Overview: ${pointer[1].trim()}" is not a section of docs/PROJECT_OVERVIEW.md`,
          );
        }
      }
    }
  });

  for (const s of DESIGN_SECTIONS) {
    if (!seen.has(s.kind)) errors.push(`0: missing the section for "${s.kind}" (${s.match})`);
  }
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > DESIGN_MAX_BYTES) {
    errors.push(
      `0: the file is ${bytes} bytes, over the limit of ${DESIGN_MAX_BYTES}. DESIGN holds only what is not built, open, or unconfirmed; move what is built to the overview`,
    );
  }
  return errors;
}

const UI_TAG = /^\[(Built|Differs|To build|Proposed|Default(?:\s*[·-]\s*in game)?)\]\s/;
const UI_UNTAGGED_SECTIONS = /^(\d+\.\s*)?(How this document works|Open questions|Changelog)\b/i;
const UI_BANNED_HEADING =
  /\b(amendments?|addend(um|a)|errata|defaults for|updates?|changes since|patch notes|revisions?)\b/i;

/** Errors in UI_RULES.md (its older shape: a tag on every rule, Open questions, a dated Changelog). */
export function checkUiRules(text) {
  const errors = [];
  const lines = text.split(/\r?\n/);
  let section = null;
  let checked = false;
  const required = { open: false, changelog: false };

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const title = heading[2];
      if (UI_BANNED_HEADING.test(title)) {
        errors.push(
          `${n}: heading "${title}" looks like an amendment section; rewrite the rules in place`,
        );
      }
      if (heading[1].length === 2) {
        section = title;
        checked = !UI_UNTAGGED_SECTIONS.test(title);
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
    if (!UI_TAG.test(body)) {
      errors.push(`${n}: rule without a status tag in "${section}": ${line.slice(0, 80)}`);
    }
  });

  if (!required.open) errors.push('0: missing the "Open questions" section');
  if (!required.changelog) errors.push('0: missing the "Changelog" section');
  return errors;
}

function main() {
  const read = (file) =>
    readFileSync(fileURLToPath(new URL(`../docs/${file}`, import.meta.url)), 'utf8');
  const design = read('DESIGN.md');
  const errors = [
    ...checkDesign(design, overviewSections(read('PROJECT_OVERVIEW.md'))).map(
      (e) => `DESIGN.md line ${e}`,
    ),
    ...checkUiRules(read('UI_RULES.md')).map((e) => `UI_RULES.md line ${e}`),
  ];
  if (errors.length > 0) {
    console.error(`docs/DESIGN.md or docs/UI_RULES.md break their own rules (${errors.length}):`);
    for (const e of errors) console.error(`  ${e}`);
    console.error('See "How this document works" at the top of each file.');
    process.exit(1);
  }
  const kb = (Buffer.byteLength(design, 'utf8') / 1024).toFixed(0);
  console.log(`docs/DESIGN.md (${kb} KB) + docs/UI_RULES.md: ok`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
