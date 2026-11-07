import './toast.css';

/**
 * Short toasts for moments worth naming (rare drops, milestones). One polite live region so
 * screen readers hear them too. At most MAX_TOASTS stay; older ones leave first.
 */

const MAX_TOASTS = 4;
const TTL_MS = 4200;
let stack: HTMLElement | null = null;

function region(): HTMLElement {
  if (!stack?.isConnected) {
    stack = document.createElement('div');
    stack.className = 'st-toasts';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  return stack;
}

export type ToastKind = 'rare' | 'milestone' | 'info';

export function toast(
  title: string,
  detail = '',
  kind: ToastKind = 'info',
  /** A metal on the ladder (DESIGN.md 16, E1): colours the toast's edge. */
  metal?: string,
): void {
  const box = region();
  const el = document.createElement('div');
  el.className = `st-toast st-toast--${kind}`;
  if (metal) el.dataset['metal'] = metal;
  const head = document.createElement('strong');
  head.textContent = title;
  el.append(head);
  if (detail) {
    const p = document.createElement('span');
    p.textContent = detail;
    el.append(p);
  }
  box.append(el);
  while (box.children.length > MAX_TOASTS) box.firstElementChild?.remove();
  window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 300);
  }, TTL_MS);
}
