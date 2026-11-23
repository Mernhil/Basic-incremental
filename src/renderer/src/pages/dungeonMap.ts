import type { CardElement, Dungeon, Trial } from '../../../data';
import {
  collectModifiers,
  bossMastery,
  clearUnlocks,
  Decimal,
  DIFFICULTIES,
  difficultyDrops,
  difficultyLootFactor,
  difficultyScale,
  effectiveDrops,
  fightStage,
  floorKind,
  floorPosition,
  floorSpec,
  isDifficultyUnlocked,
  isDungeonCleared,
  isDungeonUnlocked,
  isStageFloor,
  pickDungeon,
  setDifficulty,
  setOverflow,
  stageKey,
  stageLoot,
  stageStars,
  startFloorChallenge,
  trialRewards,
  type Difficulty,
  type GameState,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { sprite } from '../art/pixel/sprites';
import { keptIconMarkup } from '../ui/resourceIcons';
import { DUEL_COPY } from '../views/dungeon/copy';
import { bossElements } from './dungeonsModel';
import {
  defaultStage,
  layoutRoad,
  pathStops,
  plateProgress,
  sceneIsLight,
  sceneName,
  sceneScale,
  STOP_CLEAR,
  studsBetween,
  type MapStop,
  type Point,
} from './dungeonMapModel';
import { medalTip } from './progressionModel';
import type { PageContext } from './production';
import './dungeonMap.css';

/**
 * The winding map of the Dungeons panel (DESIGN.md §2 Dungeons): one plate per dungeon on the left;
 * in the middle the chosen dungeon's scene with its road of numbered stages and the four
 * difficulty badges; on the right the selected stage with its enemy, Fight and the drops.
 */

export interface DungeonMap {
  el: HTMLElement;
  /** Keeps the map current (call while the panel is open). */
  render(): void;
}

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
};

const ART = import.meta.glob<string>('../art/dungeon-map/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
const art = (name: string): string => ART[`../art/dungeon-map/${name}.png`] ?? '';

const FOE_W = 160;
const FOE_H = 172;

/** The opaque box of each picture, found once (art pixels of the 160 x 172 canvas). */
const BOXES = new Map<string, { x: number; y: number; w: number; h: number }>();

function opaqueBox(
  url: string,
  done: (box: { x: number; y: number; w: number; h: number }) => void,
): void {
  const known = BOXES.get(url);
  if (known) return done(known);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    if (!g) return;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width,
      y0 = c.height,
      x1 = -1,
      y1 = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3]! > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const box =
      x1 < 0
        ? { x: 0, y: 0, w: c.width, h: c.height }
        : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    BOXES.set(url, box);
    done(box);
  };
  img.src = url;
}

/**
 * A window `size` px square on an enemy's 160 x 172 picture, drawn whole pixels only: its head and
 * shoulders at 1x for a big figure; a small pack figure at the whole zoom the game itself uses
 * for it (`foeZoom`), so it fills the window. Never smoothed or stretched.
 */
function portrait(
  spriteId: string | undefined,
  size: number,
  cls = '',
  /** CSS px per art pixel: 1, or the whole art scale over the panel's zoom in the side panels. */
  px = 1,
): HTMLElement {
  const box = h('span', `wm-por ${cls}`.trim());
  box.style.width = `${size * px}px`;
  box.style.height = `${size * px}px`;
  const pic = spriteId ? (sprite(`foe-${spriteId}`) ?? sprite(`boss-${spriteId}`)) : undefined;
  if (!pic || !spriteId) {
    box.append(h('b', '', '?'));
    return box;
  }
  box.style.backgroundImage = `url(${pic.url})`;
  opaqueBox(pic.url, (b) => {
    const small = Math.max(b.w, b.h) < size * 0.6;
    const z = small ? Math.max(1, Math.min(4, Math.floor((size * 0.85) / Math.max(b.w, b.h)))) : 1;
    const cx = (b.x + b.w / 2) * z;
    const left = -Math.round(cx - size / 2);
    const top =
      b.h * z >= size ? -Math.max(0, b.y * z - 2) : -Math.round((b.y + b.h / 2) * z - size / 2);
    box.style.backgroundPosition = `${left * px}px ${top * px}px`;
    box.style.backgroundSize = `${FOE_W * z * px}px ${FOE_H * z * px}px`;
  });
  return box;
}

export function createDungeonMap(ctx: PageContext): DungeonMap {
  const { content } = ctx;

  const el = h('div', 'wm');
  const list = h('ol', 'wm-list__dungeons');
  list.setAttribute('aria-label', DUEL_COPY.listLabel);
  const trials = h('ol', 'wm-list__trials');
  const listCol = h('nav', 'wm-list px-panel');
  listCol.append(h('h3', 'wm-h', DUEL_COPY.chooseDungeon), list, trials);
  const pane = h('section', 'wm-map');
  const sideCol = h('aside', 'wm-side px-panel');
  el.append(listCol, pane, sideCol);

  // The side panels grow with the window (the same share of it as at 1280 x 720): the layout
  // zooms, and the pictures are drawn at a whole art scale (2x on a big window).
  let zoom = 1;
  let art2 = 1;
  function applyZoom(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    zoom = w >= 1800 && hgt >= 1000 ? 1.5 : w >= 1500 && hgt >= 840 ? 1.25 : 1;
    art2 = zoom >= 1.5 ? 2 : 1;
    el.style.setProperty('--wm-z', String(zoom));
    el.style.setProperty('--wm-s', String(art2 / zoom));
  }
  const sidePx = (): number => art2 / zoom;

  let picked: string | null = null;
  let selected: number | null = null;
  let selectedFor = '';
  let sig = '';
  let size = '';
  let updates: Array<() => void> = [];

  const sceneBox = h('div', 'wm-scene');
  const scroll = h('div', 'wm-scroll');
  const road = h('div', 'wm-road');
  scroll.append(road);
  const head = h('header', 'wm-head');
  const diffBox = h('div', 'wm-diff');
  diffBox.setAttribute('role', 'group');
  diffBox.setAttribute('aria-label', COPY.dungeons.difficultyLabel);
  const band = h('header', 'wm-band');
  band.append(head, diffBox);
  pane.append(sceneBox, scroll, band);

  const act = (next: GameState | null, focusKey?: string): void => {
    if (!next) return;
    ctx.apply(next);
    render();
    if (focusKey) el.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  };

  const chosenId = (s: GameState): string | null => picked ?? s.activeDungeonId;

  function signature(s: GameState): string {
    const id = chosenId(s);
    return JSON.stringify([
      id,
      s.activeDungeonId,
      s.clearedDungeons,
      s.prestigeCount,
      selected,
      content.dungeons.map((d) => {
        const p = floorPosition(s, d);
        return [p.difficulty, p.best, p.floor, p.challengeFloor];
      }),
      id && content.dungeonById.has(id)
        ? DIFFICULTIES.map((x) => isDifficultyUnlocked(s, content.dungeonById.get(id)!, x))
        : null,
      s.combat.overflow,
    ]);
  }

  // ---- the plates on the left ----
  function plate(entry: Dungeon | Trial, special: boolean, s: GameState): HTMLElement {
    const unlocked = isDungeonUnlocked(s, content, entry.id);
    const chosen = chosenId(s) === entry.id;
    const li = h('li', 'wm-plate-wrap');
    const b = h('button', `wm-plate px-tile${chosen ? ' is-picked' : ''}`) as HTMLButtonElement;
    b.type = 'button';
    b.dataset.key = `row-${entry.id}`;
    b.setAttribute('aria-pressed', String(chosen));
    b.disabled = !unlocked;
    if (!unlocked) b.classList.add('is-locked');
    const foe = special ? (entry as Trial).target : (entry as Dungeon).boss;
    const body = h('span', 'wm-plate__body');
    body.append(h('b', 'wm-plate__name', entry.name));
    if (special) {
      const t = entry as Trial;
      const best = s.combat.trialBest[t.id] ?? 0;
      body.append(
        h(
          'span',
          'wm-plate__sub',
          !unlocked
            ? COPY.dungeons.clearToUnlock(
                t.unlockedBy ? (content.dungeonById.get(t.unlockedBy)?.name ?? '') : '',
              )
            : best > 0
              ? COPY.dungeons.best(pct(best))
              : COPY.dungeons.special,
        ),
      );
      if (unlocked) {
        const medal = h('span', 'wm-medal');
        medal.setAttribute('role', 'img');
        const info = bossMastery(s, content, t.id);
        if (info) {
          medal.innerHTML = svg(masteryMedal(info.tier), MEDAL_VIEWBOX);
          medal.setAttribute('aria-label', medalTip(info));
          attachTooltip(medal, () => medalTip(info));
          body.append(medal);
        }
      }
    } else {
      const d = entry as Dungeon;
      const pos = floorPosition(s, d, 'normal');
      const prog = plateProgress({ unlocked, floors: d.floors, best: pos.best });
      body.append(h('span', 'wm-plate__sub', DUEL_COPY.stageCount(d.floors)));
      if (prog.kind === 'locked') {
        body.append(h('span', 'wm-tag wm-tag--locked', DUEL_COPY.locked));
        if (d.unlockedBy) {
          const hint = COPY.dungeons.clearToUnlock(
            content.dungeonById.get(d.unlockedBy)?.name ?? '',
          );
          li.title = hint;
          b.setAttribute('aria-label', `${d.name}, ${DUEL_COPY.locked}. ${hint}`);
        }
      } else if (prog.kind === 'finished') {
        body.append(h('span', 'wm-tag wm-tag--done', DUEL_COPY.finished));
      } else {
        const bar = h('span', 'wm-bar');
        const fill = h('i');
        fill.style.width = `${Math.round(prog.fraction * 100)}%`;
        bar.append(fill);
        body.append(bar, h('span', 'wm-plate__sub', DUEL_COPY.stageOf(prog.stage, prog.of)));
      }
      if (s.activeDungeonId === d.id)
        body.append(h('span', 'wm-tag wm-tag--cur', COPY.dungeons.fighting));
    }
    const bossSprite = special
      ? (foe as Trial['target']).art
      : ((foe as Dungeon['boss']).sprite ?? (foe as Dungeon['boss']).art);
    b.append(portrait(bossSprite, 56, '', sidePx()), body);
    b.addEventListener('click', () => {
      picked = entry.id;
      selected = null;
      render();
      el.querySelector<HTMLElement>(`[data-key="row-${entry.id}"]`)?.focus();
    });
    li.append(b);
    return li;
  }

  function buildList(s: GameState): void {
    list.replaceChildren(...content.dungeons.map((d) => plate(d, false, s)));
    trials.replaceChildren(...content.trials.map((t) => plate(t, true, s)));
  }

  // ---- the map in the middle ----
  function spriteOf(d: Dungeon, kind: MapStop['kind']): string | undefined {
    return kind === 'boss' ? (d.boss.sprite ?? d.boss.art) : d.miniBoss.sprite;
  }

  function stopLabel(d: Dungeon, difficulty: Difficulty, stop: MapStop): string {
    const what =
      stop.kind === 'boss'
        ? DUEL_COPY.bossKind
        : stop.kind === 'miniboss'
          ? DUEL_COPY.miniKind
          : DUEL_COPY.stageWord;
    const state =
      stop.state === 'done'
        ? DUEL_COPY.done
        : stop.state === 'current'
          ? DUEL_COPY.next
          : DUEL_COPY.locked;
    return `${DUEL_COPY.stageFloor(stop.floor)}, ${what}, ${state}`;
  }

  function buildMap(s: GameState): void {
    const id = chosenId(s);
    const d = id ? content.dungeonById.get(id) : undefined;
    pane.classList.toggle('is-empty', !d);
    head.replaceChildren();
    diffBox.replaceChildren();
    road.replaceChildren();
    pane.classList.remove('wm-map--light');
    if (!d) {
      sceneBox.style.backgroundImage = 'none';
      const t = id ? content.trialById.get(id) : undefined;
      head.append(h('h3', 'wm-title px-display', t?.name ?? COPY.arena.idleTitle));
      return;
    }
    const width = Math.floor(scroll.clientWidth);
    const height = Math.floor(scroll.clientHeight);
    if (width <= 0 || height <= 0) return;
    const pos = floorPosition(s, d);
    const difficulty = pos.difficulty;
    pane.classList.toggle('wm-map--light', sceneIsLight(d.id));

    // the scene: one whole-number scale that covers the pane
    const k = sceneScale(width, height);
    sceneBox.style.backgroundImage = `url(${art(`map-${sceneName(d.id)}`)})`;
    sceneBox.style.backgroundSize = `${368 * k}px ${316 * k}px`;

    // the title and the difficulty badges
    const title = h('h3', 'wm-title px-display', d.name);
    const at = Number.isFinite(pos.floors)
      ? pos.best >= pos.floors
        ? DUEL_COPY.pathDone(COPY.dungeons.difficulty[difficulty] ?? difficulty)
        : DUEL_COPY.stageOnTier(
            Math.min(pos.best + 1, pos.floors),
            pos.floors,
            COPY.dungeons.difficulty[difficulty] ?? difficulty,
          )
      : DUEL_COPY.depthOnTier(pos.best + 1, COPY.dungeons.difficulty[difficulty] ?? difficulty);
    head.append(title, h('span', 'wm-sub', at));
    DIFFICULTIES.forEach((diff, i) => {
      const open = isDifficultyUnlocked(s, d, diff);
      const b = h('button', `wm-badge${diff === difficulty ? ' is-on' : ''}`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.key = `difficulty-${diff}`;
      b.disabled = !open;
      b.setAttribute('aria-pressed', String(diff === difficulty));
      const img = h('img') as HTMLImageElement;
      img.src = art(`difficulty-${diff}`);
      img.alt = '';
      img.style.width = 'calc(48px * var(--wm-s, 1))';
      img.style.height = 'calc(48px * var(--wm-s, 1))';
      b.append(img, h('span', '', COPY.dungeons.difficulty[diff] ?? diff));
      attachTooltip(b, () =>
        !open && i > 0
          ? COPY.dungeons.difficultyLocked(
              COPY.dungeons.difficulty[DIFFICULTIES[i - 1]!] ?? DIFFICULTIES[i - 1]!,
            )
          : `${COPY.dungeons.difficultyTip[diff] ?? ''} ${DUEL_COPY.difficultyLoot(
              Math.round(
                (difficultyLootFactor(content, diff, collectModifiers(s, content)) - 1) * 100,
              ),
            )}`,
      );
      b.addEventListener('click', () => {
        const r = setDifficulty(ctx.state(), content, d.id, diff);
        selected = null;
        act(r.ok ? r.state : null, `difficulty-${diff}`);
      });
      diffBox.append(b);
    });

    // the road
    const kindOf = (floor: number) => floorKind(content, d, floor, difficulty);
    const stops = pathStops({ floors: pos.floors, best: pos.best, kindOf });
    const layout = layoutRoad(stops.length, width, height);
    road.style.height = `${layout.height}px`;
    const pts = layout.points;
    const studs: Point[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      studs.push(
        ...studsBetween(
          pts[i]!,
          pts[i + 1]!,
          STOP_CLEAR[stops[i]!.kind],
          STOP_CLEAR[stops[i + 1]!.kind],
        ),
      );
    }
    const studUrl = art('road_stud_1');
    for (const p of studs) {
      const stud = h('img', 'wm-stud') as HTMLImageElement;
      stud.src = studUrl;
      stud.alt = '';
      stud.style.left = `${p.x}px`;
      stud.style.top = `${p.y}px`;
      road.append(stud);
    }
    const sel = selected ?? defaultStage(pos.floors, pos.best);
    let currentEl: HTMLElement | null = null;
    stops.forEach((stop, i) => {
      const p = pts[i]!;
      const b = h('button', `wm-stop wm-stop--${stop.kind} is-${stop.state}`) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.key = `stop-${stop.floor}`;
      b.style.left = `${p.x}px`;
      b.style.top = `${p.y}px`;
      b.setAttribute('aria-label', stopLabel(d, difficulty, stop));
      b.setAttribute('aria-pressed', String(stop.floor === sel));
      if (stop.floor === sel) b.classList.add('is-selected');
      if (stop.kind === 'wave') {
        const img = h('img', 'wm-stop__img') as HTMLImageElement;
        img.src = art(
          stop.state === 'done'
            ? 'stop_done_1'
            : stop.state === 'current'
              ? 'stop_current_2'
              : 'stop_locked_1',
        );
        img.alt = '';
        b.append(img);
        // numbers show on locked stops only; a beaten stop has its tick, the next one its flag
        if (stop.state === 'locked') b.append(h('b', 'wm-stop__num', String(stop.floor)));
      } else {
        const pic = portrait(
          spriteOf(d, stop.kind),
          stop.kind === 'boss' ? 92 : 64,
          'wm-stop__pic',
        );
        b.append(
          pic,
          h(
            'span',
            'wm-stop__cap',
            `${stop.floor} ${stop.kind === 'boss' ? DUEL_COPY.bossKind : DUEL_COPY.miniKind}`,
          ),
        );
      }
      b.addEventListener('click', () => {
        selected = stop.floor;
        render();
        el.querySelector<HTMLElement>(`[data-key="stop-${stop.floor}"]`)?.focus();
      });
      road.append(b);
      if (stop.state === 'current') currentEl = b;
    });
    // the team's flag stands over the stage it pushes (the last one when the path is beaten),
    // clear of the stop's own picture
    if (s.activeDungeonId === d.id) {
      const flagFloor = stops.find((x) => x.state === 'current') ?? stops[stops.length - 1];
      const at = flagFloor ? pts[stops.indexOf(flagFloor)] : undefined;
      if (flagFloor && at) {
        const flag = h('span', 'wm-flag');
        flag.style.left = `${at.x}px`;
        flag.style.top = `${at.y - 92}px`;
        const img = h('img') as HTMLImageElement;
        img.src = art('team_banner_1');
        img.alt = '';
        flag.append(img);
        road.append(flag);
        const tag = h('span', 'wm-flag__text', DUEL_COPY.yourTeam);
        tag.style.left = `${at.x}px`;
        tag.style.top = `${at.y + STOP_CLEAR[flagFloor.kind] - 6}px`;
        road.append(tag);
      }
    }
    // a long road opens on the stage to beat
    const target = currentEl as HTMLElement | null;
    if (target) {
      requestAnimationFrame(() => {
        scroll.scrollTop = Math.max(0, target.offsetTop - scroll.clientHeight / 2);
      });
    } else {
      scroll.scrollTop = 0;
    }
  }

  // ---- the stage on the right ----
  function buildSide(s: GameState): void {
    const id = chosenId(s);
    const d = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    if (!d && !t) {
      sideCol.replaceChildren(h('p', 'wm-note', COPY.arena.idle));
      return;
    }
    if (t) {
      sideCol.replaceChildren(trialSide(t, s));
      return;
    }
    const dungeon = d!;
    const pos = floorPosition(s, dungeon);
    const difficulty = pos.difficulty;
    const floor = selected ?? defaultStage(pos.floors, pos.best);
    const kind = floorKind(content, dungeon, floor, difficulty);
    const state: MapStop['state'] =
      floor <= pos.best ? 'done' : floor === pos.best + 1 ? 'current' : 'locked';
    const spec = floorSpec(content, dungeon, difficulty, floor);
    const lead = spec.enemies[0];
    const spriteId =
      kind === 'boss'
        ? (dungeon.boss.sprite ?? dungeon.boss.art)
        : kind === 'miniboss'
          ? dungeon.miniBoss.sprite
          : dungeon.enemies.find((e) => e.id === lead?.id)?.sprite;
    const kindName =
      kind === 'boss'
        ? DUEL_COPY.bossKind
        : kind === 'miniboss'
          ? DUEL_COPY.miniKind
          : DUEL_COPY.waveOf(spec.enemies.length);

    const box = h('div', 'wm-stage');
    box.append(h('h3', 'wm-h', DUEL_COPY.stageHeading(floor)));
    const who = h('div', 'wm-who');
    who.append(portrait(spriteId, 84, 'wm-who__pic', sidePx()), h('span', 'wm-who__text', ''));
    const text = who.lastElementChild as HTMLElement;
    text.append(
      h('b', '', lead?.name ?? ''),
      h('span', 'wm-note', kindName),
      h('span', 'wm-note', DUEL_COPY.hpOf(fmt(spec.hp))),
    );
    box.append(who);

    // Fight: pick the dungeon, then Challenge the next stage
    const active = s.activeDungeonId === dungeon.id;
    const fight = h('button', 'px-btn wm-fight') as HTMLButtonElement;
    fight.type = 'button';
    fight.dataset.key = `fight-${dungeon.id}`;
    const note = h('p', 'wm-note wm-fightnote');
    note.setAttribute('role', 'status');
    if (state === 'locked') {
      fight.textContent = DUEL_COPY.locked;
      fight.disabled = true;
      fight.classList.add('px-btn--dark');
    } else if (!active) {
      fight.textContent = DUEL_COPY.fightHere;
      fight.classList.add('px-btn--gold');
      fight.setAttribute('aria-label', COPY.dungeons.fightLabel(dungeon.name));
      fight.addEventListener('click', () => {
        const r = pickDungeon(ctx.state(), content, dungeon.id);
        act(r.ok ? r.state : null, `fight-${dungeon.id}`);
      });
    } else if (state === 'current' && pos.challengeFloor === floor) {
      fight.textContent = DUEL_COPY.fightStage(floor);
      fight.classList.add('px-btn--gold');
      fight.addEventListener('click', () => {
        const r = startFloorChallenge(ctx.state(), content);
        if (r.ok) act(r.state, `fight-${dungeon.id}`);
        else note.textContent = DUEL_COPY.cannotChallenge;
      });
    } else {
      fight.textContent = DUEL_COPY.fightingHere;
      fight.disabled = true;
      fight.classList.add('px-btn--dark');
    }
    box.append(fight, note);

    // the boss's elements, then the drops
    if (kind === 'boss') box.append(bossElementNote(dungeon));
    box.append(drops(dungeon, difficulty, floor, kind, s));

    // the overflow switch of a boss or mini-boss stage
    if (isStageFloor(content, dungeon, difficulty, floor)) {
      const key = stageKey(dungeon.id, difficulty, floor);
      const row = h('div', 'wm-flow');
      const label = h('span', '', COPY.dungeons.overflowLabel);
      const sw = h('button', 'dp-switch') as HTMLButtonElement;
      sw.type = 'button';
      sw.setAttribute('role', 'switch');
      sw.dataset.key = `overflow-${key}`;
      sw.setAttribute(
        'aria-label',
        `${COPY.dungeons.overflowLabel}, ${dungeon.name} floor ${floor}`,
      );
      const on = stageStars(s, content, key)?.overflowOn === true;
      sw.setAttribute('aria-checked', String(on));
      attachTooltip(sw, () => (on ? COPY.dungeons.overflowTipOn : COPY.dungeons.overflowTipOff));
      sw.addEventListener('click', () => {
        const r = setOverflow(ctx.state(), content, key, !on);
        act(r.ok ? r.state : null, `overflow-${key}`);
      });
      row.append(label, sw);
      box.append(row);
    }

    const opens = clearUnlocks(content, dungeon.id);
    const opened = [...opens.dungeons, ...opens.mines].map(
      (x) =>
        content.dungeonById.get(x)?.name ??
        content.trialById.get(x)?.name ??
        content.mineById.get(x)?.name ??
        x,
    );
    if (opened.length > 0 && !isDungeonCleared(s, dungeon.id)) {
      box.append(h('p', 'wm-note', COPY.dungeons.opens(COPY.dungeons.and(opened))));
    }
    sideCol.replaceChildren(box);
  }

  function bossElementNote(d: Dungeon): HTMLElement {
    const { weakness, resistance } = content.combat.elements;
    const e = bossElements(d.boss as { element: CardElement }, {
      weakness: weakness.toNumber(),
      resistance: resistance.toNumber(),
    });
    const cap = (x: string): string => x.charAt(0).toUpperCase() + x.slice(1);
    const lines = [
      COPY.dungeons.bossElement(cap(e.own)),
      COPY.dungeons.bossWeak(cap(e.weak.element), e.weak.percent),
      ...(e.resist ? [COPY.dungeons.bossResists(cap(e.resist.element), e.resist.percent)] : []),
    ];
    const box = h('p', 'wm-note wm-elements');
    box.dataset.key = 'boss-elements';
    box.textContent = lines.join(' · ');
    return box;
  }

  /** The drops of a stage on the shown difficulty, with the rare item's pity on the boss's. */
  function drops(
    d: Dungeon,
    difficulty: Difficulty,
    floor: number,
    kind: MapStop['kind'],
    s: GameState,
  ): HTMLElement {
    const box = h('section', 'wm-drops');
    box.append(h('h3', 'wm-h', DUEL_COPY.dropsHere));
    const mods = collectModifiers(s, content);
    const table = effectiveDrops(d, mods, content);
    const scaled = stageLoot(
      difficultyDrops(table, difficultyScale(content, difficulty)),
      difficultyLootFactor(content, difficulty, mods),
    );
    const here = fightStage(s, content, d.id, mods, floor, difficulty)?.enemies[0];
    const purse = (n: number, multiplier = 1): Decimal =>
      new Decimal(n).mul(multiplier).mul(here?.purseScale ?? 1);
    const rareName = content.cosmeticById.get(d.drops.rare.itemId)?.name ?? d.drops.rare.itemId;
    const resName = (r: string): string => content.resourceById.get(r)?.name ?? r;
    const row = (label: string, value: string, cls = '', resource = ''): HTMLElement => {
      const li = h('li', `wm-drop ${cls}`.trim());
      const name = h('span', 'wm-drop__name', label);
      const icon = resource ? keptIconMarkup(resource) : null;
      if (icon) {
        const ico = h('span', 'wm-drop__ico');
        ico.setAttribute('aria-hidden', 'true');
        ico.innerHTML = icon;
        name.prepend(ico);
      }
      li.append(name, h('span', 'bi-num', value));
      return li;
    };
    const owned = s.inventory[d.drops.rare.itemId] ?? 0;
    const rows = h('ul', 'wm-droplist');
    if (kind === 'boss') {
      rows.append(
        row(
          owned > 0 ? `${rareName} (${COPY.dungeons.owned(owned)})` : rareName,
          pct(scaled.rare.chance),
          'wm-drop--rare',
        ),
      );
    }
    rows.append(
      ...scaled.currencies.map((c) =>
        row(
          resName(c.resource),
          c.min === c.max
            ? amountText(content, c.resource, purse(c.min, c.multiplier))
            : `${amountText(content, c.resource, purse(c.min, c.multiplier))} – ${amountText(content, c.resource, purse(c.max, c.multiplier))}`,
          '',
          c.resource,
        ),
      ),
      row(
        resName(scaled.material.resource),
        scaled.material.amount > 1
          ? `${pct(scaled.material.chance)} ×${scaled.material.amount}`
          : pct(scaled.material.chance),
        '',
        scaled.material.resource,
      ),
      ...scaled.extraMaterials.map((extra) =>
        row(
          resName(extra.resource),
          extra.chance < 1
            ? pct(extra.chance)
            : extra.min === extra.max
              ? fmt(new Decimal(extra.min))
              : `${fmt(new Decimal(extra.min))}–${fmt(new Decimal(extra.max))}`,
          '',
          extra.resource,
        ),
      ),
      ...(isDungeonCleared(s, d.id) || kind !== 'boss'
        ? []
        : d.drops.firstClear.map((p) =>
            row(COPY.dungeons.firstClear(resName(p.resource)), fmt(p.amount), '', p.resource),
          )),
    );
    box.append(rows);
    if (kind === 'boss') {
      const pity = h('div', 'wm-pity');
      const value = h('b', 'bi-num');
      const track = h('div', 'wm-pity__track');
      const fill = h('i');
      track.append(fill);
      pity.append(h('span', '', COPY.dungeons.pityIn(rareName)), value, track);
      updates.push(() => {
        const now = ctx.state();
        const threshold = effectiveDrops(d, collectModifiers(now, content), content).rare
          .pityThreshold;
        const have = now.pity[d.boss.id] ?? 0;
        const text = COPY.dungeons.pityKills(Math.max(1, threshold - have));
        if (value.textContent !== text) value.textContent = text;
        fill.style.transform = `scaleX(${Math.min(1, have / threshold).toFixed(3)})`;
      });
      box.append(pity);
    }
    box.append(h('p', 'wm-note', DUEL_COPY.harderMore));
    return box;
  }

  function trialSide(t: Trial, s: GameState): HTMLElement {
    const box = h('div', 'wm-stage');
    box.append(
      h('h3', 'wm-h', t.name),
      h('p', 'wm-note', COPY.dungeons.trialAbout(t.durationSeconds)),
    );
    const rows = h('ul', 'wm-droplist');
    rows.setAttribute('aria-label', COPY.dungeons.tiers);
    for (const tier of t.tiers) {
      const li = h('li', 'wm-drop');
      li.append(
        h('span', '', pct(tier.score)),
        h(
          'span',
          '',
          trialRewards({ ...t, tiers: [tier] }, tier.score, collectModifiers(s, content))
            .map(
              (r) => `${fmt(r.amount)} ${content.resourceById.get(r.resource)?.name ?? r.resource}`,
            )
            .join(', '),
        ),
      );
      rows.append(li);
    }
    const active = s.activeDungeonId === t.id;
    const fight = h(
      'button',
      `px-btn ${active ? 'px-btn--dark' : 'px-btn--gold'} wm-fight`,
      active ? DUEL_COPY.fightingHere : DUEL_COPY.fightHere,
    ) as HTMLButtonElement;
    fight.type = 'button';
    fight.disabled = active;
    fight.dataset.key = `fight-${t.id}`;
    fight.addEventListener('click', () => {
      const r = pickDungeon(ctx.state(), content, t.id);
      act(r.ok ? r.state : null, `fight-${t.id}`);
    });
    box.append(fight, rows);
    return box;
  }

  function render(): void {
    const s = ctx.state();
    if (picked && !content.dungeonById.has(picked) && !content.trialById.has(picked)) picked = null;
    applyZoom();
    const now = `${pane.clientWidth}x${pane.clientHeight}x${zoom}`;
    const key = signature(s);
    // another dungeon starts at its own stage
    if (selectedFor !== (chosenId(s) ?? '')) {
      selectedFor = chosenId(s) ?? '';
      selected = null;
    }
    if (key !== sig || now !== size) {
      sig = key;
      size = now;
      hideTip();
      updates = [];
      buildList(s);
      buildMap(s);
      buildSide(s);
    }
    for (const u of updates) u();
  }

  // the pane has no size until the panel is shown, and the window can change: rebuild on resize
  if (typeof ResizeObserver !== 'undefined') {
    let frame = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => render());
    }).observe(pane);
  }

  return { el, render };
}
