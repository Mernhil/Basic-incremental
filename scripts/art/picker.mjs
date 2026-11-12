// The interactive picker page (CLAUDE.md, Workflow): every choice between pictures is shown on
// one page. Each picture has a label (its group number and a letter, like 1a); a click marks it
// Keep, a right-click (or L on a focused picture) marks it Learn, and Copy list copies both lists
// to paste into the chat. A picture marked both is a stronger style reference than Learn only.
//
// Usage:
//   node scripts/art/picker.mjs <config.json> <out.html>
//   node scripts/art/picker.mjs --folder <dir> <out.html> [--title "Title"]
//
// Config: { "title", "intro"?, "scale"? (whole-number zoom of the pictures, default 1), "groups": [{ "title", "note"?, "items": [{ "src", "name"?, "sub"?,
// "strip"? }] }] }. `src` is a PNG path (relative to the config file), `strip` an optional
// pre-rendered animation strip (frames side by side, each as wide as the still, or 100 px when
// there is no still). In folder mode every sub-folder is a group and every PNG an item; a file
// `<name>-anim.png` is the strip of `<name>.png` (or an item of its own without a still).
// The page is one self-contained file: pictures are embedded, light and dark themes follow the
// system, animated strips play with CSS steps() and stand still under reduced motion.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Label of the item at `index` in group number `group` (1-based): 1a, 1b, ... 1z, 1aa, 1ab. */
export function labelFor(group, index) {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(97 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${group}${letters}`;
}

/** Width and height of a PNG from its header. */
export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('not a PNG file');
  }
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) };
}

const esc = (text) =>
  String(text ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const dataUri = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`;

/** Reads a folder (one level of sub-folders = groups) into a picker config. */
export function configFromFolder(dir, title = 'Pick pictures') {
  const entries = readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const folders = entries.filter((e) => statSync(e.path).isDirectory());
  const loose = entries.filter((e) => statSync(e.path).isFile());
  const groupOf = (name, files) => {
    const pngs = files.filter((f) => extname(f.name).toLowerCase() === '.png');
    const stills = pngs.filter((f) => !f.name.endsWith('-anim.png'));
    const strips = new Map(
      pngs.filter((f) => f.name.endsWith('-anim.png')).map((f) => [f.name.slice(0, -9), f.path]),
    );
    const items = stills.map((f) => {
      const base = basename(f.name, '.png');
      const strip = strips.get(base);
      strips.delete(base);
      return { src: f.path, name: base, ...(strip ? { strip } : {}) };
    });
    for (const [base, strip] of strips) items.push({ strip, name: base });
    return { title: name, items };
  };
  const groups = folders.map((f) =>
    groupOf(
      f.name,
      readdirSync(f.path).map((n) => ({ name: n, path: join(f.path, n) })),
    ),
  );
  if (loose.length) groups.unshift(groupOf(basename(resolve(dir)), loose));
  return { title, groups: groups.filter((g) => g.items.length) };
}

const CSS = `
:root{--bg:#ece8df;--panel:#f8f6f1;--ink:#1d2333;--muted:#5d6475;--line:#cfc8b8;--well:#d9d4c8;--well2:#cfc9bb;--gold:#a7781c;--keep:#2f7d4f;--keepbg:#e2f1e7;color-scheme:light;box-sizing:border-box}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#141a2b;--panel:#1c2338;--ink:#ece6d6;--muted:#a3a9bb;--line:#33405e;--well:#262f48;--well2:#222a41;--gold:#d8b25a;--keep:#6cd39a;--keepbg:#1b3a2c;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#141a2b;--panel:#1c2338;--ink:#ece6d6;--muted:#a3a9bb;--line:#33405e;--well:#262f48;--well2:#222a41;--gold:#d8b25a;--keep:#6cd39a;--keepbg:#1b3a2c;color-scheme:dark}
*,*::before,*::after{box-sizing:inherit}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,"Segoe UI",sans-serif;font-size:16px;line-height:1.45}
.wrap{max-width:1240px;margin:0 auto;padding:40px 24px 140px}
h1{font-size:clamp(28px,4vw,42px);margin:0 0 10px}
.intro p{max-width:64ch;color:var(--muted);margin:0 0 8px}
.grp{margin-top:28px}.grp header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin-bottom:12px}
.grp h3{margin:0;font-size:18px;display:flex;align-items:baseline;gap:10px}
.num{display:inline-grid;place-items:center;min-width:34px;height:34px;padding:0 6px;border-radius:8px;background:var(--ink);color:var(--bg);font-weight:800}
.grp p{margin:0;color:var(--muted);font-size:14px}
.grid{display:flex;flex-wrap:wrap;align-items:flex-start;gap:10px}
.tile{all:unset;box-sizing:border-box;flex:none;min-width:150px;max-width:100%;overflow-x:auto;cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:30px 8px 10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;text-align:center}
.tile:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.tile:hover{border-color:var(--gold)}
.tile[aria-pressed="true"]{background:var(--keepbg);border:2px solid var(--keep);padding:29px 7px 9px}
.tile[aria-pressed="true"]::after{content:"Keep";position:absolute;top:7px;right:8px;font-size:12px;font-weight:800;color:var(--keep)}
.lab{position:absolute;top:6px;left:8px;font-weight:800;font-size:17px}
.tile[data-learn="true"]{box-shadow:inset 0 0 0 3px var(--gold)}
.tile[data-learn="true"]::before{content:"Learn";position:absolute;top:7px;right:8px;font-size:12px;font-weight:800;color:var(--gold)}
.tile[aria-pressed="true"][data-learn="true"]::after{right:52px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pic{display:block;image-rendering:pixelated;background-color:var(--well);background-image:conic-gradient(var(--well) 25%,var(--well2) 0 50%,var(--well) 0 75%,var(--well2) 0);background-size:20px 20px;border-radius:4px;max-width:none;flex:none}
.sp{background-repeat:no-repeat;animation:play var(--dur,.88s) steps(var(--n,8)) infinite}
@keyframes play{from{background-position:0 0}to{background-position:var(--end,-800px) 0}}
@media (prefers-reduced-motion:reduce){.sp{animation:none}}
.nm{font-weight:600;font-size:14px;line-height:1.25}.sub{font-size:12px;color:var(--muted)}
.bar{position:fixed;left:0;right:0;bottom:0;padding:12px 24px;background:var(--panel);border-top:2px solid var(--gold);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;z-index:10}
.bar .picks{flex:1 1 320px;min-width:0;font-size:15px}.bar .list{color:var(--muted);word-break:break-word}.bar .row{display:block}.bar .lrn b{color:var(--gold)}
.bar button{font:inherit;font-weight:600;font-size:14px;padding:8px 14px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--ink);cursor:pointer}
.bar button.primary{background:var(--ink);color:var(--bg);border-color:var(--ink)}
body.only .tile[aria-pressed="false"]:not([data-learn="true"]){display:none}
body.only .grp:not(:has(.tile[aria-pressed="true"],.tile[data-learn="true"])){display:none}
`;

const SCRIPT = `(function(){
  var KEY='picker-keep:'+document.title, LKEY='picker-learn:'+document.title, tiles=[].slice.call(document.querySelectorAll('.tile')), kept={}, learn={};
  try{(JSON.parse(localStorage.getItem(KEY))||[]).forEach(function(id){kept[id]=1})}catch(e){}
  try{(JSON.parse(localStorage.getItem(LKEY))||[]).forEach(function(id){learn[id]=1})}catch(e){}
  tiles.forEach(function(t){var s=document.createElement('span');s.className='sr';t.appendChild(s)});
  function order(a,b){var na=parseInt(a),nb=parseInt(b);return na-nb||a.localeCompare(b)}
  function render(){
    tiles.forEach(function(t){var id=t.dataset.id;t.setAttribute('aria-pressed',kept[id]?'true':'false');t.setAttribute('data-learn',learn[id]?'true':'false');t.querySelector('.sr').textContent=learn[id]?', marked Learn':''});
    var ids=Object.keys(kept).sort(order), lids=Object.keys(learn).sort(order);
    document.getElementById('count').textContent=ids.length+' kept';
    document.getElementById('list').textContent=ids.length?ids.join(', '):'Nothing marked yet.';
    document.getElementById('lcount').textContent=lids.length+' to learn';
    document.getElementById('llist').textContent=lids.length?lids.join(', '):'Nothing marked yet.';
    try{localStorage.setItem(KEY,JSON.stringify(ids));localStorage.setItem(LKEY,JSON.stringify(lids))}catch(e){}
  }
  function toggleLearn(id){if(learn[id])delete learn[id];else learn[id]=1;render()}
  tiles.forEach(function(t){
    t.addEventListener('click',function(){var id=t.dataset.id;if(kept[id])delete kept[id];else kept[id]=1;render()});
    t.addEventListener('contextmenu',function(e){e.preventDefault();toggleLearn(t.dataset.id)});
    t.addEventListener('keydown',function(e){if(e.key==='l'||e.key==='L'){e.preventDefault();toggleLearn(t.dataset.id)}});
  });
  document.getElementById('clear').addEventListener('click',function(){kept={};learn={};render()});
  var only=document.getElementById('only');
  only.addEventListener('click',function(){var on=document.body.classList.toggle('only');only.setAttribute('aria-pressed',on);only.textContent=on?'Show all':'Show only marked'});
  var copy=document.getElementById('copy');
  copy.addEventListener('click',function(){
    var ids=Object.keys(kept).sort(order), lids=Object.keys(learn).sort(order), txt='Keep: '+(ids.join(', ')||'none')+'\\nLearn: '+(lids.join(', ')||'none');
    function done(){copy.textContent='Copied';setTimeout(function(){copy.textContent='Copy list'},1400)}
    function fallback(){var ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch(e){}document.body.removeChild(ta)}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done,fallback)}else fallback();
  });
  render();
})();`;

function tileHtml(label, item, baseDir, scale = 1) {
  const still = item.src ? readFileSync(resolve(baseDir, item.src)) : null;
  const strip = item.strip ? readFileSync(resolve(baseDir, item.strip)) : null;
  const size = still ? pngSize(still) : { w: 100, h: strip ? pngSize(strip).h : 120 };
  const dw = size.w * scale;
  const dh = size.h * scale;
  let pic;
  if (strip) {
    const total = pngSize(strip);
    const frames = Math.max(1, Math.round(total.w / size.w));
    // the strip replaces the still on the tile: it plays frame by frame
    pic = `<span class="pic sp" role="img" aria-label="${esc(item.name)}" style="width:${dw}px;height:${dh}px;background-image:url(${dataUri(strip)});background-size:${total.w * scale}px ${total.h * scale}px;--n:${frames};--end:-${total.w * scale}px;--dur:${(frames * 0.11).toFixed(2)}s"></span>`;
  } else {
    pic = `<img class="pic" src="${dataUri(still)}" alt="${esc(item.name)}" width="${dw}" height="${dh}">`;
  }
  return `<button class="tile" data-id="${label}" aria-pressed="false"><span class="lab">${label}</span>${pic}<span class="nm">${esc(item.name)}</span>${item.sub ? `<span class="sub">${esc(item.sub)}</span>` : ''}</button>`;
}

/** The whole picker page for a config (paths in it are relative to `baseDir`). */
export function buildPickerHtml(config, baseDir = '.') {
  const total = config.groups.reduce((n, g) => n + g.items.length, 0);
  const groups = config.groups
    .map((g, gi) => {
      const tiles = g.items
        .map((item, ii) => tileHtml(labelFor(gi + 1, ii), item, baseDir, config.scale ?? 1))
        .join('');
      return `<section class="grp" id="g${gi + 1}"><header><h3><span class="num">${gi + 1}</span>${esc(g.title)}</h3>${g.note ? `<p>${esc(g.note)}</p>` : ''}</header><div class="grid">${tiles}</div></section>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(config.title)}</title><style>${CSS}</style></head>
<body>
<div class="wrap"><div class="intro"><h1>${esc(config.title)}</h1>
<p>${total} pictures in ${config.groups.length} groups. Each has a label made of its group number and a letter, like 1a.</p>
<p>${esc(config.intro ?? 'Click a picture to mark it Keep. Right-click it (or press L on a focused picture) to mark it Learn: a style you like, kept as a reference for the pixel-art tool. A picture can be both, which is a stronger reference. Your picks collect in the bar at the bottom; copy them and paste them into the chat.')}</p></div>
${groups}
</div>
<div class="bar"><div class="picks"><span class="row"><b id="count">0 kept</b>: <span class="list" id="list"></span></span><span class="row lrn"><b id="lcount">0 to learn</b>: <span class="list" id="llist"></span></span></div>
<button id="only" aria-pressed="false">Show only marked</button><button id="clear">Clear</button><button id="copy" class="primary">Copy list</button></div>
<script>${SCRIPT}</script>
</body></html>
`;
}

function main(argv) {
  const args = argv.slice(2);
  const titleAt = args.indexOf('--title');
  const title = titleAt >= 0 ? args.splice(titleAt, 2)[1] : undefined;
  const folderAt = args.indexOf('--folder');
  let config;
  let baseDir = '.';
  let out;
  if (folderAt >= 0) {
    const dir = args[folderAt + 1];
    out = args[folderAt + 2];
    config = configFromFolder(dir, title);
  } else {
    const file = args[0];
    out = args[1];
    config = JSON.parse(readFileSync(file, 'utf8'));
    baseDir = dirname(resolve(file));
  }
  if (!out) {
    console.error(
      'usage: node scripts/art/picker.mjs <config.json> <out.html>\n       node scripts/art/picker.mjs --folder <dir> <out.html> [--title "Title"]',
    );
    process.exit(2);
  }
  writeFileSync(out, buildPickerHtml(config, baseDir));
  console.log(`wrote ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv);
