import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../src/renderer/src/art/pixel/manifest';
import {
  KEPT_ICONS,
  keptIconMarkup,
  keptIconSprite,
  resourceIconMarkup,
} from '../src/renderer/src/ui/resourceIcons';
import { content } from './helpers';

/** The kept 32 x 32 icons (user, 2026-11-22): every resource but Money resolves to its own. */
describe('resource icons', () => {
  it('every resource but Money has a kept icon, and Money keeps its coin', () => {
    for (const r of content.resources) {
      if (r.id === 'money') {
        expect(keptIconSprite(r.id)).toBeNull();
        continue;
      }
      expect(keptIconSprite(r.id), r.id).toBe(`res-${r.id}`);
    }
    expect(KEPT_ICONS).not.toContain('money');
  });

  it('each kept icon is a baked 32 x 32 sprite the markup draws', () => {
    for (const id of KEPT_ICONS) {
      expect(MANIFEST[`res-${id}`], id).toMatchObject({ w: 32, h: 32 });
      expect(keptIconMarkup(id), id).toContain(`res-${id}`);
      // Heirloom shards are a drop that goes straight to the Heirlooms, not a stored resource.
      const r = content.resourceById.get(id);
      if (r) expect(resourceIconMarkup(r), id).toBe(keptIconMarkup(id));
    }
  });

  it('Money still draws its coin', () => {
    expect(resourceIconMarkup(content.resourceById.get('money')!)).not.toBeNull();
  });
});
