import {
  ascensionPreview,
  challengeViews,
  collectModifiers,
  leaveChallenge,
  startChallenge,
  type ChallengeView,
  type StartChallengeFailure,
} from '../../../game';
import type { Content } from '../../../data';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { effectText } from '../shell/modifierText';
import { toast } from '../stage/toast';
import type { PageContext } from './production';

/**
 * The Ascension challenges panel on the Shop page's Ascension counter (DESIGN.md §15): a plain
 * list of the challenges with their rule, target, completions and reward, and the buttons to start
 * (an Ascension under the rule, asked twice) or leave one. All rules live in game/challenges.ts.
 */

const t = COPY.challenges;

const problemText = (problem: StartChallengeFailure | null): string =>
  problem === null ? '' : (t.problems[problem] ?? '');

export function createChallengesPanel(
  ctx: PageContext,
  content: Content,
  /** Called after a challenge starts, so the page can show the usual Ascension result. */
  onStarted: (gainText: string) => void,
): { el: HTMLElement; render(): void } {
  const el = h('section', 'shop-challenges px-tile');
  const head = h('h3', 'shop-head', t.title);
  const note = h('p', 'shop-needs shop-needs--left');
  const list = h('ul', 'shop-challenge-list');
  el.append(head, note, list);

  let armed: string | null = null;
  let key = '';

  const rewardLine = (view: ChallengeView): string =>
    view.nextReward.map((m) => effectText(m)).join(', ');

  function row(view: ChallengeView, canStartNow: boolean): HTMLElement {
    const li = h('li', 'shop-challenge');
    li.dataset.status = view.status;
    li.dataset.challenge = view.id;
    const name = h('strong', 'shop-challenge__name', view.name);
    // a sticker pip for every completion (UI_RULES §2 Shop view); the count stays as text for readers
    const stickers = h('span', 'shop-challenge__stickers');
    stickers.append(h('span', 'sr-only', t.stickers(view.completions, view.max)));
    for (let i = 0; i < view.max; i++) {
      const pip = h('i', 'shop-challenge__pip');
      pip.setAttribute('aria-hidden', 'true');
      pip.classList.toggle('is-done', i < view.completions);
      stickers.append(pip);
    }
    const rule = h('span', 'shop-challenge__rule', view.rule);
    const lines: HTMLElement[] = [h('div', 'shop-challenge__head'), rule];
    lines[0]!.append(name, stickers);
    if (view.target) {
      const diff = view.target.difficulty;
      lines.push(
        h(
          'span',
          'shop-challenge__target',
          view.status === 'active' && view.floor !== null
            ? t.progress(view.target.dungeonName, diff, view.floor, view.target.floor)
            : t.target(view.target.dungeonName, diff, view.target.floor),
        ),
        h('span', 'shop-challenge__reward', t.reward(rewardLine(view))),
      );
    } else {
      lines.push(h('span', 'shop-challenge__target', t.allDone));
    }
    if (view.earned.length > 0) {
      lines.push(
        h('span', 'shop-challenge__earned', t.earned(view.earned.map(effectText).join(', '))),
      );
    }
    li.append(...lines);

    const button = h('button', 'shop-cancel shop-challenge__button');
    button.type = 'button';
    if (view.status === 'active') {
      button.textContent = t.leave;
      button.addEventListener('click', () => {
        armed = null;
        ctx.apply(leaveChallenge(ctx.state()));
      });
      li.append(button);
    } else if (view.status === 'available' || view.status === 'locked') {
      const armedNow = armed === view.id;
      button.textContent = armedNow ? t.confirm : t.start;
      const blocked = view.problem !== null || !canStartNow;
      button.setAttribute('aria-disabled', String(blocked));
      button.classList.toggle('is-no', blocked);
      if (view.problem !== null) li.append(h('span', 'shop-needs', problemText(view.problem)));
      else if (!canStartNow) li.append(h('span', 'shop-needs', t.problems['too-early']));
      button.addEventListener('click', () => {
        if (blocked) return;
        if (!armedNow) {
          armed = view.id;
          render();
          return;
        }
        armed = null;
        const result = startChallenge(ctx.state(), content, view.id);
        if (!result.ok) {
          render();
          return;
        }
        ctx.apply(result.state);
        toast(t.toast(view.name), t.toastDetail, 'milestone');
        onStarted(String(result.gained));
      });
      li.append(button);
    }
    return li;
  }

  function render(): void {
    const s = ctx.state();
    const views = challengeViews(s, content);
    el.hidden = views.length === 0;
    if (views.length === 0) return;
    const open = s.prestigeCount >= 1;
    note.textContent = open ? t.intro : t.closed;
    // a start is an Ascension: it needs the Starlight an Ascension needs
    const mods = collectModifiers(s, content);
    const can = open && ascensionPreview(s, content, mods).canAscend;
    const next = JSON.stringify([
      views.map((v) => [v.id, v.status, v.completions, v.floor, v.problem]),
      armed,
      can,
    ]);
    if (next === key) return;
    key = next;
    list.replaceChildren(...views.map((v) => row(v, can)));
  }

  return { el, render };
}
