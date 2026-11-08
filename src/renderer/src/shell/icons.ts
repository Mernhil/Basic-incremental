/** Line icons for the sidebar and header. Drawn with currentColor, so the theme colours them. */
const PATHS = {
  home: '<path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  cards: '<rect x="7" y="4" width="11" height="15" rx="2"/><path d="M5 7v11a2 2 0 0 0 2 2h8"/>',
  production: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  dungeons: '<path d="M5 21V10a7 7 0 0 1 14 0v11"/><path d="M9 21v-7a3 3 0 0 1 6 0v7M3 21h18"/>',
  summon:
    '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  skills:
    '<circle cx="12" cy="5" r="2"/><circle cx="6" cy="13" r="2"/><circle cx="18" cy="13" r="2"/><circle cx="12" cy="20" r="2"/><path d="M11 7l-4 4M13 7l4 4M7 15l4 3.5M17 15l-4 3.5"/>',
  wardrobe:
    '<path d="M12 7a2 2 0 1 1 2-2"/><path d="M12 7v2l9 7a1 1 0 0 1-.6 1.8H3.6A1 1 0 0 1 3 16l9-7"/>',
  achievements: '<circle cx="12" cy="9" r="5"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5"/>',
  shop: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  wood: '<path d="M12 3l5 7h-3l4 6H6l4-6H7z"/><path d="M12 16v5"/>',
  ore: '<path d="M4 18l5-9 4 5 3-3 4 7z"/>',
  material: '<path d="M12 3l7 6-7 12-7-12z"/><path d="M5 9h14"/>',
  details: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  portal: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/>',
  // placeholder until the pixel Starlight coin arrives (pixel-art request)
  starlight: '<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2-2.2 7.3-2.2-7.3L2.5 12l7.3-2.2z"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, cls = 'shell-icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = PATHS[name];
  return svg;
}
