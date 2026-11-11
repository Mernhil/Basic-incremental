import './toast.css';

/**
 * Short toasts for moments worth naming (rare drops, milestones). One polite live region so
 * screen readers hear them too. At most MAX_TOASTS stay; older ones leave first. Where they sit and why: UI_RULES.md §2 "Toasts".
 */

const MAX_TOASTS = 3;
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
  /** One line, or a short list ("what you got"). */
  detail: string | readonly string[] = '',
  kind: ToastKind = 'info',
  /** A metal on the ladder (DESIGN.md §12): colours the toast's edge. */
  metal?: string,
): void {
  const box = region();
  const el = document.createElement('div');
  el.className = `st-toast st-toast--${kind}`;
  if (metal) el.dataset['metal'] = metal;
  const head = document.createElement('strong');
  head.textContent = title;
  el.append(head);
  if (typeof detail !== 'string') {
    const list = document.createElement('ul');
    list.className = 'st-toast__list';
    for (const line of detail) {
      const li = document.createElement('li');
      li.textContent = line;
      list.append(li);
    }
    if (detail.length > 0) el.append(list);
  } else if (detail) {
    const p = document.createElement('span');
    p.textContent = detail;
    el.append(p);
  }
  box.append(el);
  while (box.children.length > MAX_TOASTS) box.firstElementChild?.remove();
  window.setTimeout(() => {
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 240);
  }, TTL_MS);
}
