import { describe, expect, it } from "vitest";
import { choiceLabel, exercises, levelSummary, pick, progress, question, review, rhythmLabel } from "./ear";

describe("entraînement de l'oreille (moteur)", () => {
  it("expose six exercices et leurs niveaux", () => {
    const all = exercises();
    expect(all.map((e) => e.id)).toEqual(["intervals", "chords", "degrees", "progressions", "rhythm", "melody"]);
    expect(all[0]?.levels[0]?.items).toEqual(["interval:M3:asc", "interval:P5:asc", "interval:P8:asc"]);
  });

  it("reproduit une question à partir de sa graine", () => {
    expect(question("chords", 2, null, 99)).toEqual(question("chords", 2, null, 99));
    const q = question("intervals", 1, "interval:P5:asc", 5);
    expect(q.answer).toBe("P5");
    expect(Math.abs((q.steps[1]?.[0] ?? 0) - (q.steps[0]?.[0] ?? 0))).toBe(7);
  });

  it("nomme les réponses en français", () => {
    const q = question("chords", 2, "chord:Diminished", 1);
    const names = q.choices.map((c) => choiceLabel("chords", c).name);
    expect(names).toEqual(["majeur", "mineur", "diminué", "augmenté"]);
    expect(choiceLabel("intervals", { answer: "P8", symbol: "P8" }).name).toBe("octave");
    expect(choiceLabel("degrees", { answer: "7", symbol: "7" }, true).name).toBe("sous-tonique");
    expect(levelSummary("intervals", ["interval:m2:desc", "interval:M2:desc"])).toBe("2 réponses possibles, descendants");
  });

  it("place le rythme et la dictée dans le temps", () => {
    const rhythm = question("rhythm", 2, "rhythm:ee", 4);
    expect(rhythm.playing).toBe("timed");
    expect(rhythm.timing?.events.filter((e) => e.click)).toHaveLength(4);
    expect(rhythm.answer.split(" ")).toContain("ee");
    expect(rhythmLabel("q ee qr h")).toBe("noire, deux croches, soupir, blanche");
    const melody = question("melody", 1, null, 4);
    expect(melody.answer_length).toBe(3);
    expect(melody.answer.startsWith("1 ")).toBe(true);
  });

  it("espace les révisions et suit la maîtrise d'un niveau", () => {
    let card = review("chord:Major", undefined, true, 0);
    card = review("chord:Major", card, true, 0);
    card = review("chord:Major", card, true, 0);
    expect(card.streak).toBe(3);
    expect(progress("chords", 1, [card])).toEqual({ mastered: 1, total: 2 });
    expect(pick(["chord:Major", "chord:Minor"], [card], 1000, null)).toBe("chord:Minor");
  });
});
