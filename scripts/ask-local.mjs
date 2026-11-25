#!/usr/bin/env node
// Dev only: ask the local model (the "Local Chat" service, OpenAI-compatible) from the terminal.
// Never packaged: electron-builder ships only out/** and package.json. See docs/LOCAL-AI.md.
//   npm run ai:local -- --ping
//   npm run ai:local -- "Summarise this file" src/game/forge.ts
//   npm run ai:local -- --no-think --model qwen-fast "Draft 5 achievement names" src/data/content/achievements.json
import { readFile } from 'node:fs/promises';

const BASE = process.env.LOCAL_AI_URL ?? 'http://127.0.0.1:8080/v1';
const DOWN =
  "Local Chat isn't running: open the Local Chat app (taskbar) or start its background service.";
// the first request after a model switch or 30 min idle waits for the model to load (10-25 s);
// long answers on the Q8 model can take minutes. Node's own fetch also stops at 5 minutes.
const TIMEOUT_MS = 5 * 60 * 1000;

const USAGE = `Usage: npm run ai:local -- --ping
       npm run ai:local -- [--model <id>] [--no-think] "prompt" [file ...]
Models: qwen-coder (default, Q4), qwen-q8-quality (hard logic), qwen-fast (quick simple jobs).`;

async function call(path, init) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return await res.json();
  } catch (err) {
    const code = err?.cause?.code;
    if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ENOTFOUND') {
      console.error(DOWN);
      process.exit(2);
    }
    if (err?.name === 'TimeoutError' || code === 'UND_ERR_HEADERS_TIMEOUT') {
      console.error(`No answer from Local Chat within ${TIMEOUT_MS / 60000} minutes.`);
      process.exit(3);
    }
    throw err;
  }
}

// ---- arguments ----
const args = process.argv.slice(2);
let model = process.env.LOCAL_AI_MODEL ?? 'qwen-coder';
let think = true;
let ping = false;
const rest = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--ping') ping = true;
  else if (a === '--no-think') think = false;
  else if (a === '--model') model = args[++i] ?? model;
  else if (a === '--help' || a === '-h') {
    console.log(USAGE);
    process.exit(0);
  } else rest.push(a);
}

if (ping) {
  const models = await call('/models', { method: 'GET' });
  const ids = (models.data ?? []).map((m) => m.id).join(', ');
  console.log(
    `Local Chat is up at ${BASE}. Models: ${ids || '(none listed)'}. ` +
      'The model loads on first use (10-25 s after a switch or 30 min idle).',
  );
  process.exit(0);
}

if (rest.length === 0) {
  console.log(USAGE);
  process.exit(1);
}

const [prompt, ...files] = rest;
const parts = [prompt];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  parts.push(`\n--- ${file} ---\n${text}`);
}

const body = {
  model,
  messages: [{ role: 'user', content: parts.join('\n') }],
  temperature: 0.2,
};
if (!think) body.chat_template_kwargs = { enable_thinking: false };

const reply = await call('/chat/completions', { method: 'POST', body: JSON.stringify(body) });
const message = reply.choices?.[0]?.message;
console.log(message?.content || message?.reasoning_content || JSON.stringify(reply, null, 2));
