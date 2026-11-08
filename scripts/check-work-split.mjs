// Setup check for docs/WORK_SPLIT.md: fails if a required file is missing.
import { existsSync, readFileSync } from 'node:fs';

const required = [
  '.claude/agents/ui.md',
  '.claude/agents/pixel-art.md',
  '.claude/agents/mechanics.md',
  '.claude/skills/pixel-art/SKILL.md',
  'src/game/CLAUDE.md',
  'src/renderer/CLAUDE.md',
  'docs/ACTIVE_WORK.md',
];
const missing = required.filter((f) => !existsSync(f));
const eslint = existsSync('eslint.config.mjs') ? readFileSync('eslint.config.mjs', 'utf8') : '';
if (!eslint.includes("'**/game/*'")) missing.push('eslint.config.mjs: renderer import rule');
if (missing.length) {
  console.error('Work split setup incomplete:\n- ' + missing.join('\n- '));
  process.exit(1);
}
console.log('work split setup: ok');
