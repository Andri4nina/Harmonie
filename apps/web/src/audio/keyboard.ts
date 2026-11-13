// Clavier d'ordinateur → notes, par position physique des touches
// (KeyboardEvent.code). Une touche garde sa place quelle que soit la
// disposition (QWERTY, AZERTY, QWERTZ…) : seule l'étiquette affichée change,
// lue dans la disposition détectée.
//
// Rangée Z → / : touches blanches, rangée A → ' : touches noires, à partir
// de la note de base. Rangée Q → ] : blanches, rangée des chiffres : noires,
// une octave plus haut.

import { useEffect, useSyncExternalStore } from "react";

/** Décalage en demi-tons depuis la note de la touche Z. */
export const KEY_OFFSETS: Record<string, number> = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  Comma: 12, KeyL: 13, Period: 14, Semicolon: 15, Slash: 16,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21,
  Digit7: 22, KeyU: 23, KeyI: 24, Digit9: 25, KeyO: 26, Digit0: 27, KeyP: 28, BracketLeft: 29, Equal: 30,
  BracketRight: 31,
};

/** Étiquettes QWERTY, utilisées tant que la disposition n'est pas connue. */
const QWERTY: Record<string, string> = {
  KeyZ: "Z", KeyS: "S", KeyX: "X", KeyD: "D", KeyC: "C", KeyV: "V", KeyG: "G", KeyB: "B", KeyH: "H", KeyN: "N",
  KeyJ: "J", KeyM: "M", Comma: ",", KeyL: "L", Period: ".", Semicolon: ";", Slash: "/", KeyQ: "Q", Digit2: "2",
  KeyW: "W", Digit3: "3", KeyE: "E", KeyR: "R", Digit5: "5", KeyT: "T", Digit6: "6", KeyY: "Y", Digit7: "7",
  KeyU: "U", KeyI: "I", Digit9: "9", KeyO: "O", Digit0: "0", KeyP: "P", BracketLeft: "[", Equal: "=",
  BracketRight: "]",
};

/** Note MIDI jouée par une touche, ou `undefined` si la touche ne joue rien. */
export function noteForCode(code: string, base: number): number | undefined {
  const offset = KEY_OFFSETS[code];
  return offset === undefined ? undefined : base + offset;
}

/**
 * Pour chaque note, la touche qui la joue (la rangée du haut prime quand les
 * deux rangées se recouvrent).
 */
export function codesByNote(base: number): Map<number, string> {
  const map = new Map<number, string>();
  // KEY_OFFSETS liste la rangée du bas puis celle du haut : le haut écrase.
  for (const [code, offset] of Object.entries(KEY_OFFSETS)) map.set(base + offset, code);
  return map;
}

// ------------------------------------------------------------ disposition

let labels: Record<string, string> = { ...QWERTY };
const listeners = new Set<() => void>();
let detected = false;

function publish(next: Record<string, string>): void {
  labels = next;
  for (const listener of listeners) listener();
}

/** Lit la disposition du clavier (Chrome, Edge) ; sinon l'apprend à la frappe. */
function detect(): void {
  if (detected || typeof navigator === "undefined") return;
  detected = true;
  const keyboard = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard;
  void keyboard
    ?.getLayoutMap?.()
    .then((map) => {
      const next = { ...labels };
      for (const code of Object.keys(KEY_OFFSETS)) {
        const label = map.get(code);
        if (label) next[code] = label.toUpperCase();
      }
      publish(next);
    })
    .catch(() => undefined);
}

/** Retient le caractère réellement produit par une touche. */
export function learnKey(event: KeyboardEvent): void {
  if (!(event.code in KEY_OFFSETS) || event.key.length !== 1) return;
  const label = event.key.toUpperCase();
  if (labels[event.code] !== label) publish({ ...labels, [event.code]: label });
}

/** Étiquettes des touches dans la disposition de l'utilisateur. */
export function useKeyLabels(): Record<string, string> {
  useEffect(detect, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => labels,
    () => QWERTY,
  );
}

// ------------------------------------------------------------ écoute

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Écoute le clavier tant que `enabled` : `onDown(code)` à l'appui d'une touche
 * musicale, `onUp(code)` au relâchement (et pour toutes les touches tenues si
 * la fenêtre perd le focus). Ignore la saisie dans un champ et les raccourcis.
 */
export function useComputerKeyboard(enabled: boolean, onDown: (code: string) => void, onUp: (code: string) => void): void {
  useEffect(() => {
    if (!enabled) return;
    const down = new Set<string>();
    const keydown = (event: KeyboardEvent) => {
      if (!(event.code in KEY_OFFSETS) || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return;
      event.preventDefault();
      learnKey(event);
      if (event.repeat || down.has(event.code)) return;
      down.add(event.code);
      onDown(event.code);
    };
    const keyup = (event: KeyboardEvent) => {
      if (!down.delete(event.code)) return;
      onUp(event.code);
    };
    const releaseAll = () => {
      for (const code of down) onUp(code);
      down.clear();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    window.addEventListener("blur", releaseAll);
    return () => {
      releaseAll();
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
      window.removeEventListener("blur", releaseAll);
    };
  }, [enabled, onDown, onUp]);
}
