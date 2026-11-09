import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { buildPickerHtml, labelFor, pngSize } from '../scripts/art/picker.mjs';

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

describe('picker page script', () => {
  it('labels pictures with the group number and a letter', () => {
    expect(labelFor(1, 0)).toBe('1a');
    expect(labelFor(17, 2)).toBe('17c');
    expect(labelFor(2, 25)).toBe('2z');
    expect(labelFor(2, 26)).toBe('2aa');
  });

  it('reads a PNG size from its header', () => {
    expect(pngSize(PNG)).toEqual({ w: 1, h: 1 });
    expect(() => pngSize(Buffer.from('nope'))).toThrow();
  });

  it('builds a page with Keep and Learn marks, the labels and a Copy list button', () => {
    const dir = mkdtempSync(join(tmpdir(), 'picker-'));
    writeFileSync(join(dir, 'a.png'), PNG);
    const html: string = buildPickerHtml(
      { title: 'Test', groups: [{ title: 'Group', items: [{ src: 'a.png', name: 'A' }] }] },
      dir,
    );
    expect(html).toContain('data-id="1a"');
    expect(html).toContain('Copy list');
    expect(html).toContain("'contextmenu'");
    expect(html).toContain('Learn');
  });
});
