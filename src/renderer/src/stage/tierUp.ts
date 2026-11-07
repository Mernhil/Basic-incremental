import type { Content } from '../../../data';
import type { TierUp } from '../../../game';
import { tierUpText } from '../pages/progressionModel';
import { createCard, type CardProps } from '../ui/card';
import { reducedMotion, replay } from './motion';
import { toast } from './toast';
import './tierUp.css';

/**
 * Tier-up moments (DESIGN.md 16, E1): every tier-up of anything plays the same kind of moment, a
 * metal flash and a short toast. A card evolution (E6, A15 E) gets its own bigger moment: a light
 * beam drops into the card, the Gold frame rebuilds with a crest flare, then the unique item
 * rises into the window.
 */

/** Toasts shown per batch; the rest are summed up in one more toast. */
const MAX_TOASTS = 3;

let flashEl: HTMLElement | null = null;

function metalFlash(metal: string): void {
  if (reducedMotion()) return;
  if (!flashEl?.isConnected) {
    flashEl = document.createElement('div');
    flashEl.className = 'st-metal-flash';
    flashEl.setAttribute('aria-hidden', 'true');
    document.body.append(flashEl);
  }
  flashEl.dataset['metal'] = metal;
  replay(flashEl, 'is-on', 700);
}

export interface TierUpHost {
  content: Content;
  sound?: (id: string) => void;
  /** Props of a card for the evolution moment (null when it cannot be drawn). */
  cardProps?: (cardId: string) => CardProps | null;
}

export function playTierUps(list: readonly TierUp[], host: TierUpHost): void {
  if (list.length === 0) return;
  const top = list.reduce((a, b) => (b.to > a.to ? b : a));
  metalFlash(top.metal);
  const masteries = list.some((u) => u.kind === 'gem_mastery' || u.kind === 'boss_mastery');
  host.sound?.(
    masteries || list.some((u) => u.kind === 'evolution') ? 'masteryTierUp' : 'milestone',
  );
  list.slice(0, MAX_TOASTS).forEach((u) => {
    const { title, detail } = tierUpText(u, host.content);
    toast(title, detail, 'milestone', u.metal);
  });
  if (list.length > MAX_TOASTS) toast(`+${list.length - MAX_TOASTS}`, '', 'milestone', top.metal);
  for (const u of list) {
    if (u.kind !== 'evolution') continue;
    const props = host.cardProps?.(u.id);
    if (props) showEvolution(props);
  }
}

/**
 * A single upgrade moment outside the TierUp list (a cosmetic level): the same metal flash,
 * toast and sound as a tier-up.
 */
export function playUpgradeMoment(
  moment: { title: string; detail: string; metal: string; big: boolean },
  sound?: (id: string) => void,
): void {
  metalFlash(moment.metal);
  sound?.(moment.big ? 'masteryTierUp' : 'milestone');
  toast(moment.title, moment.detail, 'milestone', moment.metal);
}

/** The ★6 evolution moment (A15 E). Click or Escape skips it. */
export function showEvolution(props: CardProps): void {
  const overlay = document.createElement('div');
  overlay.className = `st-evo${reducedMotion() ? ' st-evo--still' : ''}`;
  overlay.setAttribute('role', 'presentation');
  const stage = document.createElement('div');
  stage.className = 'st-evo__stage';
  const beam = document.createElement('i');
  beam.className = 'st-evo__beam';
  const flare = document.createElement('i');
  flare.className = 'st-evo__flare';
  const card = createCard(props);
  stage.append(beam, card.el, flare);
  overlay.append(stage);
  document.body.append(overlay);
  let done = false;
  const close = (): void => {
    if (done) return;
    done = true;
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 300);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  overlay.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  window.setTimeout(close, 3600);
}
