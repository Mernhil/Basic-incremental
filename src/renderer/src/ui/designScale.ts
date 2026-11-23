/**
 * One design size for the whole UI. The game is laid out at 1920 x 1080 CSS px; the window shows
 * it through the page zoom (Electron `webFrame`), so every screen, the header included, scales
 * together: at 1280 x 720 the dungeon fight is the 1920 x 1080 picture at 2/3, same proportions.
 * Zoom keeps pointer coordinates, hit tests and canvases right, because `innerWidth`,
 * `getBoundingClientRect` and `clientX` all stay in the same (design) CSS px.
 * A window that is not 16:9 gets a design area larger than 1920 x 1080 on one side (the layouts
 * flex; the painted backgrounds cover it), so there is never an empty band.
 * The browser (phone) build has no page zoom and keeps its own size.
 */
import { designZoom } from './designZoom';

let scaled = false;

/** True once the page zoom is carrying the design size (the desktop app). */
export const isDesignScaled = (): boolean => scaled;

/** Once, early: keeps the page zoom at the window's fit, now and on every resize. */
export function installDesignScale(): void {
  const api = window.api;
  if (scaled || !api?.setUiZoom || !api.getUiZoom) return;
  scaled = true;
  const fit = (): void => {
    const current = api.getUiZoom!();
    // the window's own size: the page's CSS size times the zoom it is under now
    const z = designZoom(window.innerWidth * current, window.innerHeight * current);
    if (Math.abs(z - current) > 1e-4) api.setUiZoom!(z);
  };
  fit();
  window.addEventListener('resize', fit);
}
