/** The design size of the whole UI and the zoom that fits it to a window (pure; the DOM side is designScale.ts). */
export const DESIGN_W = 1920;
export const DESIGN_H = 1080;

/** The zoom that fits the design size into a window `w` x `h` (device-independent px): the limit side shows exactly 1920 or 1080. */
export function designZoom(w: number, h: number): number {
  const z = Math.min(w / DESIGN_W, h / DESIGN_H);
  return Number.isFinite(z) && z > 0 ? Math.round(z * 1e4) / 1e4 : 1;
}
