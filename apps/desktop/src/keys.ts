/**
 * Houston sends special keys as KeyboardEvent.key names and plain characters as text.
 * These tables translate them for the two input backends.
 */

const functionKeys = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `f${i + 1}`]),
);

/** KeyboardEvent.key → robotjs key name. */
export const robotKeys: Record<string, string> = {
  Enter: 'enter',
  Backspace: 'backspace',
  Tab: 'tab',
  Escape: 'escape',
  Delete: 'delete',
  Insert: 'insert',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  ' ': 'space',
  Control: 'control',
  Shift: 'shift',
  Alt: 'alt',
  Meta: 'command',
  ...functionKeys,
};

/** robotjs only knows lowercase letters, digits and some symbols as single keys. */
export function robotKey(key: string): string | null {
  if (robotKeys[key]) return robotKeys[key];
  if (key.length === 1 && /[a-z0-9`\-=[\]\\;',./]/i.test(key)) return key.toLowerCase();
  return null;
}

/** KeyboardEvent.key → X11 keysym, as the Wayland RemoteDesktop portal expects. */
export const keysyms: Record<string, number> = {
  Enter: 0xff0d,
  Backspace: 0xff08,
  Tab: 0xff09,
  Escape: 0xff1b,
  Delete: 0xffff,
  Insert: 0xff63,
  ArrowUp: 0xff52,
  ArrowDown: 0xff54,
  ArrowLeft: 0xff51,
  ArrowRight: 0xff53,
  Home: 0xff50,
  End: 0xff57,
  PageUp: 0xff55,
  PageDown: 0xff56,
  Control: 0xffe3,
  Shift: 0xffe1,
  Alt: 0xffe9,
  Meta: 0xffeb,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 0xffbe + i])),
};

/** Keysym for a key name or a single character (Latin-1 directly, else Unicode keysyms). */
export function keysym(key: string): number | null {
  if (keysyms[key] !== undefined) return keysyms[key];
  const codePoint = [...key].length === 1 ? key.codePointAt(0)! : null;
  if (codePoint === null) return null;
  if ((codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff)) {
    return codePoint;
  }
  return 0x01000000 + codePoint;
}

/** Linux evdev button codes, for the portal. */
export const evdevButtons = [0x110, 0x112, 0x111] as const; // left, middle, right
