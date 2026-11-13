import { describe, expect, it } from "vitest";
import { KEY_OFFSETS, codesByNote, noteForCode } from "./keyboard";

const BLACK = new Set([1, 3, 6, 8, 10]);

describe("clavier d'ordinateur", () => {
  it("Z et Q jouent Do, à une octave d'écart", () => {
    expect(noteForCode("KeyZ", 48)).toBe(48);
    expect(noteForCode("KeyQ", 48)).toBe(60);
    expect(noteForCode("BracketRight", 48)).toBe(79);
    expect(noteForCode("Slash", 48)).toBe(64);
    expect(noteForCode("KeyA", 48)).toBeUndefined();
  });

  it("les rangées de lettres Z et Q donnent les blanches, les autres les noires", () => {
    const whites = ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash", "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"];
    for (const [code, offset] of Object.entries(KEY_OFFSETS)) {
      expect(BLACK.has(offset % 12), code).toBe(!whites.includes(code));
    }
  });

  it("la transposition décale toutes les touches", () => {
    expect(noteForCode("KeyQ", 50)).toBe(62);
    expect(codesByNote(50).get(62)).toBe("KeyQ");
    expect(codesByNote(48).get(61)).toBe("Digit2");
  });
});
