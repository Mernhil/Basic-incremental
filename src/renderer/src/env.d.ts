import type { AppApi } from '../../preload/api';

declare global {
  interface Window {
    api: AppApi;
  }
  /** True only in the local dev build (scripts/dist-dev.mjs); Vite replaces it at build time. */
  const __BI_DEV_BUILD__: boolean;
}
