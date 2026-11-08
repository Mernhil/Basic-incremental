import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip } from '../shell/tooltip';
import { onSoundSettings, setSoundSettings, soundSettings } from './engine';
import './controls.css';

/** The quick mute toggle in the header (DESIGN.md §13). */
export function createMuteToggle(): HTMLButtonElement {
  const btn = h('button', 'snd-mute');
  btn.type = 'button';
  const sync = (): void => {
    const muted = soundSettings().muted;
    btn.setAttribute('aria-pressed', String(muted));
    btn.setAttribute('aria-label', muted ? COPY.sound.unmute : COPY.sound.mute);
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9h4l5-4v14l-5-4H4Z"/>${
      muted
        ? '<path d="m16.5 9.5 5 5m0-5-5 5"/>'
        : '<path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>'
    }</svg>`;
  };
  btn.addEventListener('click', () => setSoundSettings({ muted: !soundSettings().muted }));
  attachTooltip(btn, () => (soundSettings().muted ? COPY.sound.unmute : COPY.sound.mute));
  onSoundSettings(sync);
  sync();
  return btn;
}

/** The Sound panel of the Settings page: volumes, mute, mute when unfocused. */
export function soundSettingsFrame(): HTMLElement {
  const { el, body } = frame(COPY.sound.heading);
  body.classList.add('snd-settings');
  const slider = (label: string, key: 'master' | 'sfx'): HTMLElement => {
    const row = h('label', 'snd-row');
    const input = h('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '5';
    const value = h('span', 'snd-row__value bi-num');
    const sync = (): void => {
      const v = Math.round(soundSettings()[key] * 100);
      input.value = String(v);
      value.textContent = `${v}%`;
    };
    input.addEventListener('input', () => setSoundSettings({ [key]: Number(input.value) / 100 }));
    onSoundSettings(sync);
    sync();
    row.append(h('span', 'snd-row__label', label), input, value);
    return row;
  };
  const check = (label: string, key: 'muted' | 'muteUnfocused'): HTMLElement => {
    const row = h('label', 'snd-check');
    const input = h('input');
    input.type = 'checkbox';
    const sync = (): void => {
      input.checked = soundSettings()[key];
    };
    input.addEventListener('change', () => setSoundSettings({ [key]: input.checked }));
    onSoundSettings(sync);
    sync();
    row.append(input, h('span', '', label));
    return row;
  };
  body.append(
    slider(COPY.sound.master, 'master'),
    slider(COPY.sound.sfx, 'sfx'),
    check(COPY.sound.muteAll, 'muted'),
    check(COPY.sound.muteUnfocused, 'muteUnfocused'),
  );
  return el;
}
