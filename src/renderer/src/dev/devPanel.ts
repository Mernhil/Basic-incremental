/**
 * The dev cheats panel (DESIGN.md §2, Dev tools): a small floating panel in dev builds only that
 * calls the pure `game/dev` functions. `app.ts` loads this module with a dynamic import behind
 * `import.meta.env.DEV` and the main process's `devCheatsEnabled()`, so a release bundle never
 * contains it (`scripts/check-release-bundle.mjs`). Ctrl+Shift+D or the "Dev" button toggles it.
 *
 * Its words are a developer tool, not player copy, so they live here and not in `copy.ts`.
 */
import type { Content } from '../../../data';
import type { GameState } from '../../../game';
import {
  devAddAccountXp,
  devAdvanceTime,
  devGrant,
  devGrantCosmetic,
  devOptions,
  devSetCardRank,
  devSetDungeonCleared,
  devSetFloor,
  type DevResult,
} from '../../../game/dev';
import { DIFFICULTIES, GAME_SPEEDS, type Difficulty } from '../../../game';
import { h } from '../shell/shell';
import './devPanel.css';

export interface DevPanelContext {
  content: Content;
  state: () => GameState;
  /** Applies a new state the way a player action does (checks, celebrations, save). */
  apply: (next: GameState) => void;
  /** The game loop's speed multiplier (1 = normal). Never saved. */
  speed: () => number;
  setSpeed: (speed: number) => void;
  /** Backs up the save, starts a new game and reloads the view; resolves to the backup's file
   *  name (null when there was no save). */
  resetGame: (keepCosmetics: boolean) => Promise<string | null>;
}

const REASONS: Record<string, string> = {
  unknown: 'Unknown id.',
  invalid: 'Invalid value.',
};

export function installDevPanel(ctx: DevPanelContext): void {
  const options = devOptions(ctx.content);
  const root = h('aside', 'dev-panel');
  root.setAttribute('aria-label', 'Dev cheats');
  root.hidden = true;
  const toggle = h('button', 'dev-toggle', 'Dev');
  toggle.type = 'button';
  toggle.title = 'Dev cheats (Ctrl+Shift+D)';
  toggle.setAttribute('aria-expanded', 'false');
  const status = h('p', 'dev-panel__status');
  status.setAttribute('role', 'status');

  let open = false;
  const show = (next: boolean): void => {
    open = next;
    root.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.addEventListener('click', () => show(!open));
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      show(!open);
    }
  });

  const run = (label: string, cheat: (state: GameState) => DevResult): void => {
    const result = cheat(ctx.state());
    if (result.ok) {
      ctx.apply(result.state);
      status.textContent = `${label}: done.`;
    } else status.textContent = `${label}: ${REASONS[result.reason] ?? result.reason}`;
  };

  const select = (list: { id: string; name: string }[], extra?: [string, string]) => {
    const el = h('select', 'dev-panel__select');
    if (extra) el.append(Object.assign(h('option', '', extra[1]), { value: extra[0] }));
    for (const o of list) el.append(Object.assign(h('option', '', o.name), { value: o.id }));
    return el;
  };
  const input = (value: string, label: string) => {
    const el = h('input', 'dev-panel__input');
    el.value = value;
    el.setAttribute('aria-label', label);
    return el;
  };
  const button = (label: string, onClick: () => void) => {
    const b = h('button', 'dev-panel__button', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  const row = (title: string, ...controls: HTMLElement[]) => {
    const r = h('div', 'dev-panel__row');
    r.append(h('span', 'dev-panel__label', title), ...controls);
    return r;
  };

  // resources
  const resource = select(options.resources, ['all', 'Every resource']);
  resource.setAttribute('aria-label', 'Resource');
  const amount = input('1e6', 'Amount');
  const grant = button('Grant', () =>
    run('Grant', (s) =>
      devGrant(s, ctx.content, { resource: resource.value, amount: amount.value.trim() }),
    ),
  );

  // dungeons
  const dungeon = select(options.dungeons);
  dungeon.setAttribute('aria-label', 'Dungeon');
  const clear = button('Clear', () =>
    run('Clear', (s) => devSetDungeonCleared(s, ctx.content, dungeon.value, true)),
  );
  const unclear = button('Unclear', () =>
    run('Unclear', (s) => devSetDungeonCleared(s, ctx.content, dungeon.value, false)),
  );
  // floors: puts the chosen dungeon on a floor (DESIGN.md §6 Dungeon floors)
  const floor = input('1', 'Floor');
  const difficulty = select(
    DIFFICULTIES.map((d) => ({ id: d, name: d })),
    ['', 'Current difficulty'],
  );
  difficulty.setAttribute('aria-label', 'Difficulty');
  const setFloor = button('Set floor', () =>
    run('Floor', (s) =>
      devSetFloor(
        s,
        ctx.content,
        dungeon.value,
        Number(floor.value),
        difficulty.value === '' ? undefined : (difficulty.value as Difficulty),
      ),
    ),
  );

  // cards
  const card = select(options.cards);
  card.setAttribute('aria-label', 'Card');
  const tier = select(options.tiers.map((t) => ({ id: t, name: t })));
  tier.setAttribute('aria-label', 'Tier');
  const stars = input('6', 'Stars');
  stars.classList.add('dev-panel__input--short');
  const level = input('', 'Level (blank keeps it)');
  level.classList.add('dev-panel__input--short');
  level.placeholder = 'Lv';
  const setRank = button('Set', () =>
    run('Card', (s) =>
      devSetCardRank(s, ctx.content, card.value, {
        tier: tier.value as (typeof options.tiers)[number],
        stars: Number(stars.value),
        ...(level.value.trim() ? { level: Number(level.value) } : {}),
      }),
    ),
  );

  // account and cosmetics
  const xp = input('1e5', 'Account XP');
  const addXp = button('Add XP', () =>
    run('Account XP', (s) => devAddAccountXp(s, ctx.content, xp.value.trim())),
  );
  const cosmetic = select(options.cosmetics);
  cosmetic.setAttribute('aria-label', 'Cosmetic');
  const giveCosmetic = button('Grant', () =>
    run('Cosmetic', (s) => devGrantCosmetic(s, ctx.content, cosmetic.value)),
  );

  // game speed: the badge stays on screen while it is not 1x, so a sped-up game is never taken
  // for normal pace
  const badge = h('div', 'dev-speed-badge');
  badge.setAttribute('role', 'status');
  badge.hidden = true;
  const speedButtons = GAME_SPEEDS.map((x) => {
    const b = button(`${x}x`, () => {
      ctx.setSpeed(x);
      showSpeed();
      status.textContent = `Game speed: ${x}x.`;
    });
    b.setAttribute('aria-pressed', 'false');
    return [x, b] as const;
  });
  const showSpeed = (): void => {
    const now = ctx.speed();
    for (const [x, b] of speedButtons) {
      b.setAttribute('aria-pressed', String(x === now));
      b.classList.toggle('dev-panel__button--on', x === now);
    }
    badge.hidden = now === 1;
    badge.textContent = `${now}x`;
  };

  // reset: the second click confirms, in the panel (no dialog)
  let pending: HTMLButtonElement | null = null;
  let pendingTimer = 0;
  const disarm = (): void => {
    window.clearTimeout(pendingTimer);
    if (pending) {
      pending.textContent = pending.dataset['label'] ?? '';
      pending.classList.remove('dev-panel__button--danger');
    }
    pending = null;
  };
  const resetButton = (label: string, keepCosmetics: boolean) => {
    const b = button(label, () => {
      if (pending !== b) {
        disarm();
        pending = b;
        b.textContent = 'Click again to confirm';
        b.classList.add('dev-panel__button--danger');
        status.textContent = 'This starts a new game. The current save is backed up first.';
        pendingTimer = window.setTimeout(disarm, 10_000);
        return;
      }
      disarm();
      status.textContent = 'Backing up the save and starting a new game...';
      ctx.resetGame(keepCosmetics).catch((error: unknown) => {
        status.textContent = `Reset failed: ${error instanceof Error ? error.message : String(error)}`;
      });
    });
    b.dataset['label'] = label;
    return b;
  };

  // time
  const time = (label: string, seconds: number) =>
    button(label, () => run(`Advance ${label}`, (s) => devAdvanceTime(s, ctx.content, seconds)));

  root.append(
    h('h2', 'dev-panel__title', 'Dev cheats'),
    row('Resource', resource, amount, grant),
    row('Dungeon', dungeon, clear, unclear),
    row('Floor', floor, difficulty, setFloor),
    row('Card', card, tier, stars, level, setRank),
    row('Account', xp, addXp),
    row('Cosmetic', cosmetic, giveCosmetic),
    row('Speed', ...speedButtons.map(([, b]) => b)),
    row('Time', time('10 min', 600), time('1 h', 3600), time('8 h', 8 * 3600)),
    row('New game', resetButton('Reset game', false), resetButton('Reset, keep cosmetics', true)),
    status,
  );
  showSpeed();
  document.body.append(root, toggle, badge);
}
