import { createLogRing } from './logRing';

/**
 * The window's recent log lines for Report an issue (DESIGN.md §2): console output plus
 * uncaught errors and rejections, kept in a small ring. The console itself works as before.
 */
export const rendererLog = createLogRing();
let installed = false;

/** Mirrors console output and uncaught errors into `rendererLog`. Call once at startup. */
export function installLogCapture(): void {
  if (installed) return;
  installed = true;
  for (const level of ['info', 'warn', 'error', 'log'] as const) {
    const original = console[level].bind(console);
    console[level] = (...parts: unknown[]) => {
      rendererLog.push(level === 'log' ? 'info' : level, parts);
      original(...parts);
    };
  }
  window.addEventListener('error', (e: ErrorEvent) =>
    rendererLog.push('error', [e.error ?? e.message, `at ${e.filename}:${e.lineno}`]),
  );
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) =>
    rendererLog.push('error', ['Unhandled rejection:', e.reason]),
  );
  rendererLog.push('info', ['Window started']);
}
