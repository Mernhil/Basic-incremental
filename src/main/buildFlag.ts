/**
 * True only in the local dev build (`npm run dist:dev` sets `BI_DEV_BUILD=1` while building;
 * electron.vite.config.ts bakes it in as `__BI_DEV_BUILD__`). Every other build, tests included,
 * has it false. Nothing at run time can switch it on.
 */
declare const __BI_DEV_BUILD__: boolean | undefined;

export const DEV_BUILD: boolean = typeof __BI_DEV_BUILD__ !== 'undefined' && __BI_DEV_BUILD__;
