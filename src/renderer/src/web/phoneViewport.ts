import { DESIGN_H, DESIGN_W } from '../ui/designZoom';

export interface PhoneScreen {
  /** The screen's longer and shorter side in CSS px (iOS reports them in portrait order). */
  long: number;
  short: number;
  portrait: boolean;
}

/**
 * The `viewport` meta content that makes the phone show the 1920 x 1080 design size, scaled to the
 * screen, with no page zoom API (iOS has none): the layout viewport is as wide as the design area
 * is at the zoom `designZoom` would pick (the height is then 1080, or more on a screen narrower
 * than 16:9; the layouts flex, as on the desktop). Portrait shows the plain device width, for
 * the "turn your phone sideways" screen.
 */
export function phoneViewportContent(screen: PhoneScreen): string {
  const tail = 'viewport-fit=cover, user-scalable=no, maximum-scale=1';
  if (screen.portrait) return `width=device-width, initial-scale=1, ${tail}`;
  const aspect = screen.short > 0 ? screen.long / screen.short : 0;
  const width = Math.max(DESIGN_W, Math.round(DESIGN_H * (Number.isFinite(aspect) ? aspect : 0)));
  return `width=${width}, ${tail}`;
}
