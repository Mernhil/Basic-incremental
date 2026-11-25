#!/usr/bin/env node
// Dev only: ask the local model (llama.cpp, OpenAI-compatible) from the terminal. Never packaged:
// electron-builder ships only out/** and package.json. See docs/LOCAL-AI.md.
//   npm run ai:local -- --ping
//   npm run ai:local -- "Summarise this file" src/game/forge.ts   (add --think for a slower, reasoned answer)
import { readFile } from 'node:fs/promises';

const BASE = process.env.LOCAL_AI_URL ?? 'http://127.0.0.1:8080/v1';
const MODEL = process.env.LOCAL_AI_MODEL ?? 'qwen-coder';
const DOWN = `The local AI server is not running at ${BASE}. Start C:\\LocalAI\\start-solo.bat (or start-with-comfyui.bat) and try again.`;

const args = process.argv.slice(2);

async function call(path, init) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer local' },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return await res.json();
  } catch (err) {
    if (err instanceof TypeError) {
      console.error(DOWN);
      process.exit(2);
    }
    throw err;
  }
}

if (args.length === 0 || args[0] === '--help') {
  console.log('Usage: npm run ai:local -- --ping | "prompt" [file ...]');
  process.exit(args.length === 0 ? 1 : 0);
}

if (args[0] === '--ping') {
  const models = await call('/models', { method: 'GET' });
  const ids = (models.data ?? []).map((m) => m.id).join(', ');
  console.log(`Local AI is running at ${BASE}. Models: ${ids || '(none listed)'}`);
  process.exit(0);
}

// Qwen thinks at length by default; quick answers skip it unless --think is passed.
const think = args.includes('--think');
const [prompt, ...files] = args.filter((a) => a !== '--think');
const parts = [prompt];
for (const file of files) {
  const text = await readFile(file, 'utf8');
  parts.push(`\n--- ${file} ---\n${text}`);
}

const reply = await call('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: parts.join('\n') }],
    temperature: 0.2,
    chat_template_kwargs: { enable_thinking: think },
  }),
});
const message = reply.choices?.[0]?.message;
console.log(message?.content || message?.reasoning_content || JSON.stringify(reply, null, 2));
