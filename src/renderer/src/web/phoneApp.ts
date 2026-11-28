import { COPY } from '../copy';
import { markDesignScaled } from '../ui/designScale';
import { phoneViewportContent } from './phoneViewport';
import './touch.css';

/** True on a touch screen without a mouse (a phone or tablet); a desktop browser keeps its own size. */
const isCoarsePointer = (): boolean => window.matchMedia('(pointer: coarse)').matches;

/** Keeps the layout viewport at the design size, scaled to the screen (see `phoneViewportContent`). */
function installViewport(): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    document.head.append(meta);
  }
  const apply = (): void => {
    const long = Math.max(window.screen.width, window.screen.height);
    const short = Math.min(window.screen.width, window.screen.height);
    const portrait = window.matchMedia('(orientation: portrait)').matches;
    const content = phoneViewportContent({ long, short, portrait });
    if (meta.content !== content) meta.content = content;
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}

function installTurnScreen(): void {
  const screen = document.createElement('div');
  screen.className = 'turn-screen';
  screen.setAttribute('role', 'alert');
  const title = document.createElement('p');
  title.className = 'turn-screen__title';
  title.textContent = COPY.phone.turnTitle;
  const hint = document.createElement('p');
  hint.className = 'turn-screen__hint';
  hint.textContent = COPY.phone.turnHint;
  screen.append(title, hint);
  document.body.append(screen);
}

/** Asks the browser to keep the save (iOS and Chrome may otherwise clear a web app's storage). */
function keepStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}

/** Offline start: the service worker caches the built files (not in a dev server, not on file://). */
function registerWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const secure = window.isSecureContext;
  if (!secure) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

/**
 * The web build as an app: persistent storage, the offline worker, and, on a touch screen, the
 * design-size viewport, the turn-sideways screen and the touch rules (`web/touch.css`,
 * `shell/tooltip.ts`). Called only when the browser api was installed (never in the desktop app).
 */
export function installPhoneApp(): void {
  document.documentElement.classList.add('web-app');
  keepStorage();
  registerWorker();
  if (!isCoarsePointer()) return;
  document.documentElement.classList.add('phone');
  markDesignScaled();
  installViewport();
  installTurnScreen();
}
