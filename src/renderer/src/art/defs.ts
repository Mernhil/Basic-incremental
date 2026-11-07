/** DOM side of the gem art: the shared SVG filters and the idle-motion CSS. */
import { OUTLINE } from './gems';
import './art.css';

/** Adds the shared filters (blur, sticker outlines) to the document once. */
export function installArtDefs(doc: Document = document, radius = 2.6): void {
  if (doc.getElementById('bi-art-defs')) return;
  const stk = (name: string, col: string): string =>
    `<filter id="bi-art-stk-${name}" x="-30%" y="-30%" width="160%" height="160%"><feComponentTransfer in="SourceAlpha" result="a"><feFuncA type="discrete" tableValues="0 1"/></feComponentTransfer><feMorphology in="a" operator="dilate" radius="${radius}" result="d"/><feFlood flood-color="${col}"/><feComposite in2="d" operator="in" result="w"/><feOffset in="d" dx="1" dy="2.4" result="o"/><feFlood flood-color="#000" flood-opacity=".45"/><feComposite in2="o" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const holder = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  holder.id = 'bi-art-defs';
  holder.setAttribute('width', '0');
  holder.setAttribute('height', '0');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'absolute';
  holder.innerHTML = `<defs><filter id="bi-art-blur" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>${Object.entries(
    OUTLINE,
  )
    .map(([n, c]) => stk(n, c))
    .join('')}</defs>`;
  doc.body.append(holder);
}
