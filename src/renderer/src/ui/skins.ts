import {
  cardShardIcon,
  SKIN_STYLES,
  STARLIGHT_VIEWBOX,
  starlightCoin,
  type SkinStyle,
} from '../art/cosmetics';
import { svg } from '../art/gems';

/** The four UI-skin slots (DESIGN.md §8): each recipe sets `--bi-skin-<slot>` on <html>. */
export type SkinSlot = 'starlight' | 'sticker' | 'nodes' | 'wardrobe';

/**
 * The style letter (a..e) worn in a UI-skin slot, read from the theme the game applied
 * (`applyGlobalTheme`), so pages follow the equipped item without knowing the data. Starter 'a'
 * when nothing is set.
 */
export function skinStyle(slot: SkinSlot, root: HTMLElement = document.documentElement): SkinStyle {
  const v = getComputedStyle(root).getPropertyValue(`--bi-skin-${slot}`).trim();
  return (SKIN_STYLES as readonly string[]).includes(v) ? (v as SkinStyle) : 'a';
}

/** The equipped Starlight coin as an inline <svg> (header chip, Ascension gate, shops). */
export function starlightSvg(): string {
  return svg(starlightCoin(skinStyle('starlight')), STARLIGHT_VIEWBOX);
}

/** The card-shard icon as an inline <svg> (shard shop). */
export function shardSvg(): string {
  return svg(cardShardIcon(), '0 0 32 32');
}
