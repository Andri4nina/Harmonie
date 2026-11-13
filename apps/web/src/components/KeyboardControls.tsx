import { useCallback, useRef } from "react";
import { useComputerKeyboard, useKeyLabels, noteForCode } from "../audio/keyboard";
import { noteOff, noteOn } from "../audio/synth";
import { PITCHED_SOUNDS } from "../audio/voices";
import { KEYBOARD_MAX, KEYBOARD_MIN, useSettings } from "../state/store";
import { instrumentLabel, solfege } from "../theory/labels";
import { Icon } from "./ui";

/** Choix de l'instrument qui joue les notes. */
export function SoundPicker({ value, onChange, label = "Son" }: { value: string; onChange: (sound: string) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2">
      <span className="caption">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 rounded-xl border border-line bg-[var(--glass-bg)] px-2.5 text-sm text-ivory outline-none focus:border-[var(--accent-line)]"
      >
        {PITCHED_SOUNDS.map((sound) => (
          <option key={sound} value={sound}>
            {instrumentLabel(sound, sound)}
          </option>
        ))}
      </select>
    </label>
  );
}

function Step({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full px-2 text-sm text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/**
 * Transposition du clavier d'ordinateur : demi-ton par demi-ton ou par
 * octave. Affiche la note des touches Z et Q dans la disposition détectée.
 */
export function KeyboardTranspose() {
  const base = useSettings((state) => state.keyboardBase);
  const setBase = useSettings((state) => state.setKeyboardBase);
  const labels = useKeyLabels();
  return (
    <div className="hidden flex-wrap items-center gap-1 pointer-fine:flex" role="group" aria-label="Clavier d'ordinateur">
      <Icon name="keyboard" className="mr-1 size-4 text-ivory-3" />
      <span className="caption mr-1 tabular-nums">
        {labels.KeyZ} = {solfege(base)} · {labels.KeyQ} = {solfege(base + 12)}
      </span>
      <span className="inline-flex rounded-full border border-line">
        <Step label="Transposer d'un demi-ton plus bas" onClick={() => setBase(base - 1)} disabled={base <= KEYBOARD_MIN}>
          −½
        </Step>
        <Step label="Transposer d'un demi-ton plus haut" onClick={() => setBase(base + 1)} disabled={base >= KEYBOARD_MAX}>
          +½
        </Step>
      </span>
      <span className="inline-flex rounded-full border border-line">
        <Step label="Une octave plus bas" onClick={() => setBase(base - 12)} disabled={base - 12 < KEYBOARD_MIN}>
          −8ve
        </Step>
        <Step label="Une octave plus haut" onClick={() => setBase(base + 12)} disabled={base + 12 > KEYBOARD_MAX}>
          +8ve
        </Step>
      </span>
      {base !== 48 && (
        <Step label="Revenir à Do3" onClick={() => setBase(48)}>
          Do3
        </Step>
      )}
    </div>
  );
}

/**
 * Joue l'instrument choisi au clavier d'ordinateur tant que `enabled`.
 * `onNote` est prévenu de chaque appui et relâchement (enregistrement).
 */
export function useKeyboardPlayer(
  enabled: boolean,
  sound?: string,
  onNote?: (midi: number, down: boolean) => void,
  map?: (midi: number) => number,
): void {
  // Note jouée par chaque touche tenue : une transposition pendant l'appui
  // ne change pas la note à relâcher.
  const held = useRef(new Map<string, number>());
  const down = useCallback(
    (code: string) => {
      const played = noteForCode(code, useSettings.getState().keyboardBase);
      if (played === undefined) return;
      const midi = map ? map(played) : played;
      held.current.set(code, midi);
      noteOn(`kb:${code}`, midi, sound ?? useSettings.getState().sound);
      onNote?.(midi, true);
    },
    [sound, onNote, map],
  );
  const up = useCallback(
    (code: string) => {
      noteOff(`kb:${code}`);
      const midi = held.current.get(code);
      held.current.delete(code);
      if (midi !== undefined) onNote?.(midi, false);
    },
    [onNote],
  );
  useComputerKeyboard(enabled, down, up);
}
