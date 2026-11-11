import type { Content } from '../../../data';
import { SaveError, formatDuration, importSaveString, type GameState } from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { soundSettingsFrame } from '../sound/controls';
import { onSoundSettings } from '../sound/engine';
import { reducedMotion } from '../stage/motion';
import { buildIssueUrl, issueBody, LOG_LINES, systemFromUserAgent } from '../settings/issueReport';
import { rendererLog } from '../settings/logBuffer';
import { AUTOSAVE_CHOICES, onPrefs, prefs, setPrefs } from '../settings/prefs';
import {
  autosaveLabel,
  numberChoices,
  saveSummary,
  summaryLine,
  type Choice,
} from './settingsModel';
import './settings.css';

/**
 * The Settings page (DESIGN.md §11), option B "two-column panels": Display and Save on the left,
 * Sound and Help on the right, as pixel panels (UI_RULES.md §2, "Shell look"). Choices are pixel
 * button groups with the chosen one gold, reduced motion is a pixel toggle, volumes are pixel
 * sliders. Import checks the save first and asks in the page before it replaces the game.
 */

export interface SettingsDeps {
  content: Content;
  state(): GameState;
  version: string;
  /** The current game as an export string (steps the loop first). */
  exportText(): string;
  /** Replaces the running game with an imported state and saves it. */
  replace(state: GameState): void;
  /** When the last successful save was written (ms epoch), or null. */
  lastSavedAt(): number | null;
}

let groupId = 0;

/** A labelled radio group drawn as a segmented control. */
function segmented<T extends string | number>(
  label: string,
  choices: Choice<T>[],
  current: () => T,
  set: (v: T) => void,
): { el: HTMLElement; sync(): void } {
  const group = h('div', 'set-seg');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', label);
  const name = `set-seg-${groupId++}`;
  const inputs: { input: HTMLInputElement; value: T }[] = [];
  for (const c of choices) {
    const opt = h('label', 'set-seg__opt px-btn--quiet');
    const input = h('input');
    input.type = 'radio';
    input.name = name;
    input.value = String(c.value);
    input.addEventListener('change', () => {
      if (input.checked) set(c.value);
    });
    opt.append(input, h('span', 'set-seg__label', c.label));
    if (c.example) opt.append(h('span', 'set-seg__example bi-num', c.example));
    inputs.push({ input, value: c.value });
    group.append(opt);
  }
  const sync = (): void => {
    for (const i of inputs) i.input.checked = i.value === current();
  };
  sync();
  return { el: group, sync };
}

/**
 * The reduced-motion pixel toggle. It switches between On and Off; while the preference follows
 * Windows it shows the Windows setting, and a quiet "Follow Windows" button brings that back.
 */
function motionToggle(): { control: HTMLElement; hint: HTMLElement; sync(): void } {
  const control = h('div', 'set-toggle-box');
  const toggle = h('button', 'set-toggle');
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', COPY.settings.motion);
  const knob = h('i', 'set-toggle__knob');
  knob.setAttribute('aria-hidden', 'true');
  toggle.append(knob);
  const follow = h('button', 'set-follow px-btn px-btn--quiet', COPY.settings.motionFollow);
  follow.type = 'button';
  const hint = h('span', 'set-row__hint');
  const effective = (): boolean => {
    const m = prefs().motion;
    return m === 'system' ? reducedMotion() : m === 'reduced';
  };
  toggle.addEventListener('click', () => setPrefs({ motion: effective() ? 'full' : 'reduced' }));
  follow.addEventListener('click', () => {
    setPrefs({ motion: 'system' });
    toggle.focus();
  });
  control.append(follow, toggle);
  const sync = (): void => {
    const on = effective();
    const system = prefs().motion === 'system';
    toggle.setAttribute('aria-checked', String(on));
    toggle.classList.toggle('is-on', on);
    follow.hidden = system;
    hint.textContent = system ? COPY.settings.motionFollows(on) : COPY.settings.motionHint;
  };
  sync();
  return { control, hint, sync };
}

/** A setting row: label (and hint) on the left, its control on the right. */
function row(label: string, control: HTMLElement, hint?: string | HTMLElement): HTMLElement {
  const el = h('div', 'set-row');
  const text = h('div', 'set-row__text');
  text.append(h('span', 'set-row__label', label));
  if (hint) text.append(typeof hint === 'string' ? h('span', 'set-row__hint', hint) : hint);
  el.append(text, control);
  return el;
}

function saveFileName(now: Date): string {
  const d = now.toISOString().slice(0, 10);
  return `basic-incremental-save-${d}.txt`;
}

export function createSettingsPage(root: HTMLElement, deps: SettingsDeps): { render(): void } {
  root.classList.add('set-page');
  // the panels carry the sighted headings; the page name stays for screen readers
  root.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const grid = h('div', 'set-grid');

  // ---- Display ----
  const display = frame(COPY.settings.display);
  const motion = motionToggle();
  const numbers = segmented(
    COPY.settings.numbers,
    numberChoices(),
    () => prefs().numbers,
    (v) => setPrefs({ numbers: v }),
  );
  numbers.el.classList.add('set-seg--examples');
  display.body.classList.add('set-body');
  display.body.append(
    row(COPY.settings.motion, motion.control, motion.hint),
    row(COPY.settings.numbers, numbers.el, COPY.settings.numbersHint),
  );

  // ---- Sound (the existing panel) ----
  const sound = soundSettingsFrame();
  // the pixel sliders fill up to their value (--v, in percent)
  const sliders = Array.from(sound.querySelectorAll<HTMLInputElement>('input[type="range"]'));
  const fill = (): void => {
    for (const r of sliders)
      r.style.setProperty('--v', String((Number(r.value) / Number(r.max)) * 100));
  };
  for (const r of sliders) r.addEventListener('input', fill);
  onSoundSettings(fill);
  fill();

  // ---- Save ----
  const saveFrame = frame(COPY.save.heading);
  saveFrame.body.classList.add('set-body');
  const lastSaved = h('span', 'frame__note set-saved');
  saveFrame.el.querySelector('.frame__title')?.append(lastSaved);
  const autosave = segmented(
    COPY.save.autosave,
    AUTOSAVE_CHOICES.map((s) => ({ value: s, label: autosaveLabel(s) })),
    () => prefs().autosaveSeconds,
    (v) => setPrefs({ autosaveSeconds: v }),
  );
  onPrefs(() => {
    motion.sync();
    numbers.sync();
    autosave.sync();
  });

  const button = (label: string, cls = 'px-btn px-btn--quiet'): HTMLButtonElement => {
    const b = h('button', cls, label);
    b.type = 'button';
    return b;
  };
  const copyBtn = button(COPY.save.copy);
  const fileBtn = button(COPY.save.toFile);
  const exportRow = h('div', 'set-actions');
  exportRow.append(copyBtn, fileBtn);

  const text = h('textarea', 'tools__text set-text');
  text.rows = 3;
  text.spellcheck = false;
  text.placeholder = COPY.save.placeholder;
  text.setAttribute('aria-label', COPY.save.placeholder);
  const loadBtn = button(COPY.save.fromFile);
  const importBtn = button(COPY.save.import);
  const picker = h('input');
  picker.type = 'file';
  picker.accept = '.txt,text/plain';
  picker.hidden = true;
  const importRow = h('div', 'set-actions');
  importRow.append(importBtn, loadBtn, picker);

  const message = h('p', 'set-message');
  message.setAttribute('role', 'status');
  const error = h('div', 'set-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const confirm = h('div', 'set-confirm');
  confirm.hidden = true;

  saveFrame.body.append(
    row(COPY.save.autosave, autosave.el),
    row(COPY.save.exportLabel, exportRow),
    h('div', 'set-divider'),
    h('span', 'set-row__label', COPY.save.importLabel),
    text,
    importRow,
    error,
    confirm,
    message,
  );

  const say = (msg: string): void => {
    message.textContent = msg;
  };
  const showError = (msg: string | null): void => {
    error.replaceChildren();
    error.hidden = msg === null;
    if (msg !== null) {
      error.append(h('strong', '', msg), h('span', '', COPY.save.importErrorHint));
    }
  };

  copyBtn.addEventListener('click', () => {
    const value = deps.exportText();
    showError(null);
    const fallback = (): void => {
      text.value = value;
      text.select();
      say(COPY.save.exportedNoClipboard);
    };
    if (!navigator.clipboard) return fallback();
    navigator.clipboard.writeText(value).then(() => say(COPY.save.exported), fallback);
  });
  fileBtn.addEventListener('click', () => {
    const name = saveFileName(new Date());
    const url = URL.createObjectURL(new Blob([deps.exportText()], { type: 'text/plain' }));
    const a = h('a');
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    say(COPY.save.exportedFile(name));
  });

  let pending: GameState | null = null;
  const closeConfirm = (): void => {
    pending = null;
    confirm.hidden = true;
    confirm.replaceChildren();
  };
  const check = (raw: string): void => {
    closeConfirm();
    say('');
    if (!raw.trim()) {
      showError(COPY.save.importEmpty);
      return;
    }
    try {
      pending = importSaveString(raw, deps.content).state;
    } catch (e) {
      showError(e instanceof SaveError ? e.message : COPY.save.importFailed);
      return;
    }
    showError(null);
    const imported = summaryLine(saveSummary(pending, deps.content));
    const current = summaryLine(saveSummary(deps.state(), deps.content));
    const replaceBtn = button(COPY.save.confirmReplace, 'button button--danger');
    const keepBtn = button(COPY.save.confirmKeep);
    const actions = h('div', 'set-actions');
    actions.append(replaceBtn, keepBtn);
    confirm.setAttribute('role', 'alertdialog');
    confirm.setAttribute('aria-label', COPY.save.confirmTitle);
    confirm.append(
      h('strong', 'set-confirm__title', COPY.save.confirmTitle),
      h('p', '', COPY.save.confirmImported(imported)),
      h('p', '', COPY.save.confirmCurrent(current)),
      actions,
    );
    confirm.hidden = false;
    keepBtn.addEventListener('click', () => {
      closeConfirm();
      importBtn.focus();
    });
    replaceBtn.addEventListener('click', () => {
      if (!pending) return;
      deps.replace(pending);
      closeConfirm();
      text.value = '';
      say(COPY.save.imported);
    });
    keepBtn.focus();
  };
  importBtn.addEventListener('click', () => check(text.value));
  loadBtn.addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    file.text().then(
      (raw) => {
        text.value = raw.trim();
        check(text.value);
      },
      () => showError(COPY.save.fileUnreadable),
    );
  });

  // ---- Help ----
  const help = frame(COPY.settings.help);
  help.body.classList.add('set-body');
  const reportBtn = button(COPY.settings.report, 'px-btn px-btn--gold');
  const reportMsg = h('p', 'set-message');
  reportMsg.setAttribute('role', 'status');
  const details = h('details', 'set-details');
  const summary = h('summary', '', COPY.settings.reportPreview);
  const preview = h('pre', 'set-preview');
  details.append(summary, preview);
  const issueInfo = () => ({
    appVersion: deps.version,
    save: saveSummary(deps.state(), deps.content),
    system: systemFromUserAgent(navigator.userAgent),
    log: rendererLog.tail(LOG_LINES),
  });
  details.addEventListener('toggle', () => {
    if (details.open) {
      const info = issueInfo();
      preview.textContent = issueBody(info, info.log);
    }
  });
  reportBtn.addEventListener('click', () => {
    // https links go to the default browser through the main process (shell.openExternal)
    window.open(buildIssueUrl(issueInfo()), '_blank');
    reportMsg.textContent = COPY.settings.reportOpened;
  });
  help.body.append(h('p', 'set-lead', COPY.settings.reportText), reportBtn, reportMsg, details);

  // two by two (UI_RULES §2 Settings grid): Display and Sound over Save and Help
  for (const panel of [display.el, sound, saveFrame.el, help.el]) panel.dataset.deal = '';
  grid.append(display.el, sound, saveFrame.el, help.el);
  root.append(grid);

  let savedText = '';
  return {
    render() {
      const at = deps.lastSavedAt();
      const ago = at === null ? null : Date.now() - at;
      const next =
        ago === null
          ? ''
          : ago < 2000
            ? COPY.save.savedJustNow
            : COPY.save.lastSaved(formatDuration(ago));
      if (next !== savedText) lastSaved.textContent = savedText = next;
    },
  };
}
