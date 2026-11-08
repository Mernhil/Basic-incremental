// Generates art trials as SVG with Recraft's vector model.
// Needs RECRAFT_API_TOKEN in the project's .env (git-ignored). Never commit the key.
// Usage: node scripts/art/recraft-generate.mjs [--dry] [--style engraving] [--subject warden]
// Output: design/art-trials/recraft/<style>/<subject>.svg plus a prompts.json log.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'https://external.api.recraft.ai/v1/images/generations';
const OUT = 'design/art-trials/recraft';

/** The game's look, added to every prompt so the set stays consistent. */
const WORLD =
  'dark fantasy card game art, night-blue background #0b0f16, antique gold #d9b35a as the main line colour, ' +
  'serious and grown-up mood, detailed, centered subject, no text, no frame';

const SUBJECTS = {
  warden:
    'the Root Warden, a hulking ancient tree guardian boss made of gnarled bark and roots, broken stump crown, ' +
    'antler-like branches, slanted glowing amber eyes in hollow sockets, jagged maw, moss on the shoulders, ' +
    'long branch arms with root claws, roots spreading at its base, menacing front view',
  squire:
    'Ember Squire, a young knight in plate armour, three-quarter bust, closed great helm with a visor slit, ' +
    'a plume of living fire on the helm, sword held upright behind the shoulder, engraved pauldrons',
  crown:
    'the Ember Crown, an ornate royal crown with five points tipped with small flames, engraved filigree band, ' +
    'a large oval gem in the centre and smaller gems at the sides, a row of pearls',
  hit:
    'a sword slash impact effect: a bright curved slash arc with sparks and shards flying outward, ' +
    'on an empty dark background, game hit effect',
};

/**
 * Five directions to compare. V3 Vector takes a curated style by name; V4.1 Vector follows the
 * prompt; V4 Styles Vector copies the look of reference images (our engraving drawings).
 * Names from https://www.recraft.ai/docs/api-reference/styles
 */
const STYLES = {
  engraving: {
    model: 'recraftv3_vector',
    style: 'Engraving',
    note: 'fine line engraving',
    colors: true,
  },
  linocut: {
    model: 'recraftv3_vector',
    style: 'Linocut',
    note: 'carved print with bold black shapes',
    colors: true,
  },
  sharp_contrast: {
    model: 'recraftv3_vector',
    style: 'Sharp contrast',
    note: 'high-contrast light and shadow shapes',
    colors: true,
  },
  v41: {
    model: 'recraftv4_1_vector',
    note: 'detailed gold line engraving with hatching for shade, like a banknote',
  },
  references: {
    model: 'recraftv4_styles_vector',
    references: 'design/art-trials/style-refs',
    note: 'in the style of the references',
  },
};

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const dry = args.includes('--dry');
const onlyStyle = flag('style');
const onlySubject = flag('subject');

async function token() {
  if (process.env.RECRAFT_API_TOKEN) return process.env.RECRAFT_API_TOKEN;
  try {
    const env = await readFile('.env', 'utf8');
    const line = env.split(/\r?\n/).find((l) => l.startsWith('RECRAFT_API_TOKEN='));
    return line
      ?.slice('RECRAFT_API_TOKEN='.length)
      .trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

async function referenceUrls(dir) {
  const { readdir } = await import('node:fs/promises');
  const files = (await readdir(dir)).filter((f) => /.(png|jpe?g|webp)$/i.test(f)).slice(0, 10);
  if (files.length === 0) throw new Error(`No reference images in ${dir}`);
  return Promise.all(
    files.map(async (f) => {
      const type = f.toLowerCase().endsWith('png')
        ? 'png'
        : f.toLowerCase().endsWith('webp')
          ? 'webp'
          : 'jpeg';
      return `data:image/${type};base64,${(await readFile(join(dir, f))).toString('base64')}`;
    }),
  );
}

let styleId = null; // reused after the first reference-style request, so the style is created once

async function generate(key, prompt, style) {
  const body = { prompt, model: style.model, size: '1:1', response_format: 'url' };
  if (style.style) body.style = style.style;
  if (style.colors) {
    body.controls = {
      colors: [{ rgb: [217, 179, 90] }, { rgb: [241, 220, 155] }, { rgb: [200, 69, 47] }],
      background_color: { rgb: [11, 15, 22] },
    };
  }
  if (style.references) {
    if (styleId) body.style_id = styleId;
    else body.style_reference_urls = await referenceUrls(style.references);
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Recraft ${res.status}: ${JSON.stringify(result).slice(0, 400)}`);
  if (style.references && result.style_id) styleId = result.style_id;
  const url = result?.data?.[0]?.url;
  if (!url) throw new Error(`No image in the response: ${JSON.stringify(result).slice(0, 400)}`);
  const svg = await (await fetch(url)).text();
  return { url, svg };
}

const key = dry ? 'dry-run' : await token();
if (!key) {
  console.error(
    'RECRAFT_API_TOKEN is missing. Add it to .env in the project folder (one line: RECRAFT_API_TOKEN=...).',
  );
  process.exit(1);
}

const log = [];
for (const [styleKey, style] of Object.entries(STYLES)) {
  if (onlyStyle && onlyStyle !== styleKey) continue;
  const dir = join(OUT, styleKey);
  await mkdir(dir, { recursive: true });
  for (const [subjectId, subject] of Object.entries(SUBJECTS)) {
    if (onlySubject && onlySubject !== subjectId) continue;
    const prompt = `${subject}. ${style.note}, ${WORLD}`;
    if (dry) {
      console.log(
        `[dry] ${styleKey}/${subjectId} (${style.model}${style.style ? `, ${style.style}` : ''}): ${prompt.slice(0, 80)}…`,
      );
      continue;
    }
    try {
      const { svg } = await generate(key, prompt, style);
      await writeFile(join(dir, `${subjectId}.svg`), svg);
      log.push({ style: styleKey, subject: subjectId, prompt, bytes: svg.length });
      console.log(`ok   ${styleKey}/${subjectId} (${Math.round(svg.length / 1024)} KB)`);
    } catch (error) {
      log.push({ style: styleKey, subject: subjectId, prompt, error: String(error) });
      console.error(`fail ${styleKey}/${subjectId}: ${error.message}`);
    }
  }
}
if (!dry) await writeFile(join(OUT, 'prompts.json'), JSON.stringify(log, null, 2));
