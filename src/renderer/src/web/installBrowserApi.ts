import type { AppApi } from '../../../preload/api';
import { rendererLog } from '../settings/logBuffer';
import { createBrowserApi } from './browserApi';

/** Replaced by Vite in the web build (`vite.web.config.ts`) with the `package.json` version. */
declare const __BI_WEB_VERSION__: string | undefined;

/** Installs the browser `window.api` unless the desktop shell already provided one. */
export function installBrowserApi(): void {
  if ((window as { api?: AppApi }).api) return;
  window.api = createBrowserApi({
    storage: window.localStorage,
    version: typeof __BI_WEB_VERSION__ === 'string' ? __BI_WEB_VERSION__ : '0.0.0',
    pageEvents: {
      onHide(callback) {
        window.addEventListener('pagehide', callback);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') callback();
        });
      },
    },
    logTail: (lines) => rendererLog.tail(lines),
    system: {
      os: navigator.platform || 'web',
      osRelease: navigator.userAgent,
      arch: 'web',
      electron: 'none (web build)',
      chrome: navigator.userAgent,
    },
  });
}
