import { installArtDefs } from '../../src/renderer/src/art/defs';
import { sets1 } from './sets1';
import { sets2 } from './sets2';
import { sets3 } from './sets3';
import { sets4 } from './sets4';
import './review.css';

// Round 2 shows only the two sets that need another look; round 1 stays in sets1-3.
const round1 = [...sets1, ...sets2, ...sets3];
void round1;
const sets = sets4;
installArtDefs();

const prism = `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="rv-prism" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb4ec"/><stop offset=".5" stop-color="#b8a4ff"/><stop offset="1" stop-color="#7ae0ff"/></linearGradient></defs></svg>`;
const letters = ['A', 'B', 'C', 'D', 'E'];

const nav = sets.map((s) => `<a href="#${s.id}">${s.id}</a>`).join('');
const body = sets
  .map(
    (s) => `<section id="${s.id}"><header><h2><span>${s.id}</span> ${s.title}</h2><p>${s.brief}</p></header>
  <div class="opts">${s.options
    .map(
      (o, i) => `<figure class="opt" data-pick="${s.id} ${letters[i]}"><div class="mock">${o.html}</div>
      <figcaption><b>${s.id} ${letters[i]} · ${o.title}</b><span>${o.note}</span></figcaption></figure>`,
    )
    .join('')}</div></section>`,
  )
  .join('');

const root = document.getElementById('app') ?? document.body;
root.innerHTML = `${prism}<nav>${nav}<span class="picks" id="picks">Click one option per set to build your reply</span><button type="button" id="copy">Copy reply</button></nav>
<main><h1>Basic Incremental · Beta review gate, round 2</h1><p class="lead">Recorded from round 1: A1 D, A2 A, A3 A, A4 B, A5 B, A6 E, A7 A, A8 A, A9 E, A10 C, A11 B, A12 D, A14 D, A16 B. Below: A13 redrawn as you asked, and A15 rebuilt on the evolution art you already approved.</p>
<p class="lead">Two option sets, five options each (A–E). Click one option per set and copy the reply line at the top, or just write e.g. “A1 C, A2 B, …”. Mockups use the game's real art (gems, tiles, bosses, items, frames); motion is indicated, not final.</p>${body}</main>`;

const picks = new Map<string, string>();
document.querySelectorAll<HTMLElement>('.opt').forEach((el) =>
  el.addEventListener('click', () => {
    const [set, letter] = el.dataset.pick!.split(' ');
    picks.set(set!, letter!);
    document.querySelectorAll(`#${set} .opt`).forEach((o) => o.classList.toggle('chosen', o === el));
    const line = sets.map((s) => (picks.has(s.id) ? `${s.id} ${picks.get(s.id)}` : null)).filter(Boolean).join(', ');
    document.getElementById('picks')!.textContent = line;
  }),
);
const copy = document.getElementById('copy')!;
copy.addEventListener('click', () => {
  const text = document.getElementById('picks')!.textContent ?? '';
  navigator.clipboard.writeText(text).then(
    () => (copy.textContent = 'Copied'),
    () => {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById('picks')!);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      copy.textContent = 'Selected, press Ctrl+C';
    },
  );
});
