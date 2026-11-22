/// <reference types="vite/client" />
import cardClosed from './door-card-portal.png';
import cardOpen from './door-card-portal-open.png';
import focusClosed from './door-focus-portal.png';
import focusOpen from './door-focus-portal-open.png';
import heirloomClosed from './door-heirloom-gate.png';
import heirloomOpen from './door-heirloom-gate-open.png';

/**
 * The three Summon doors (user, 2026-11-22: the Card Portal in stone and gold, the Focus Portal
 * with eye-lens doors, the Heirloom Gate in iron and rose gold): 160 x 160 pictures in a closed and
 * an open state, shown at a whole scale (2x on a roomy page). Copied byte for byte from the art
 * controller's folder; never redrawn.
 */
export const DOOR_SIZE = 160;

export const DOOR_ART: Record<string, { closed: string; open: string }> = {
  card_portal: { closed: cardClosed, open: cardOpen },
  focus_portal: { closed: focusClosed, open: focusOpen },
  heirloom_gate: { closed: heirloomClosed, open: heirloomOpen },
};
