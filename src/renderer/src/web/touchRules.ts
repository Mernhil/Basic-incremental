/** True for an element a tap already does something on (so a short tap must not open its tooltip, a long press does). */
export function isActionTarget(tagName: string, role: string | null): boolean {
  if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY'].includes(tagName.toUpperCase()))
    return true;
  return role === 'button' || role === 'tab' || role === 'radio' || role === 'checkbox';
}
