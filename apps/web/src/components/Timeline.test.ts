import { describe, expect, it } from "vitest";
import { formatDuration } from "../app/api";
import { headFor } from "../theory/head";
import { chordPitchClass, keyLabel } from "./Timeline";

describe("frise d'analyse", () => {
  it("retrouve la fondamentale d'un accord par le moteur", () => {
    expect(chordPitchClass("Am7")).toBe(9);
    expect(chordPitchClass("F#m")).toBe(6);
    expect(chordPitchClass("pas un accord")).toBeNull();
  });

  it("nomme les tonalités en français", () => {
    expect(keyLabel("C major")).toBe("C majeur");
    expect(keyLabel("F# minor")).toBe("F# mineur");
  });

  it("écrit les durées en minutes et secondes", () => {
    expect(formatDuration(33_400)).toBe("0 min 33");
    expect(formatDuration(125_000)).toBe("2 min 05");
    expect(formatDuration(null)).toBe("durée inconnue");
  });
});

describe("pages d'application", () => {
  it("ne sont jamais indexées", () => {
    for (const path of ["/analyser", "/bibliotheque", "/analyser/3f1c"]) {
      const head = headFor(path);
      expect(head.indexable, path).toBe(false);
      expect(head.title, path).not.toContain("introuvable");
    }
  });
});
