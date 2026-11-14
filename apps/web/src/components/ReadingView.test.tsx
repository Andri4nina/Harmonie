import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "../app/api";
import { keyUsesFlats, tablatureFor, writtenChords, writtenNotes } from "../theory/engine";
import { chordName, noteName } from "../theory/labels";
import { ReadingView } from "./ReadingView";

function event(feature: string, start: number, end: number, payload: Record<string, unknown>, id = `${feature}-${start}`): TimelineEvent {
  return { id, feature, start_ms: start, end_ms: end, confidence: 0.8, certainty: "estimated", payload };
}

describe("noms des notes", () => {
  it("écrit en lettres ou en solfège, avec altérations", () => {
    expect(noteName("Eb4", "letters")).toBe("E♭4");
    expect(noteName("Eb4", "solfege")).toBe("Mi♭4");
    expect(noteName("F#3", "solfege", false)).toBe("Fa♯");
    expect(chordName("Am7", "solfege")).toBe("Lam7");
    expect(chordName("C/E", "solfege")).toBe("Do/Mi");
    expect(chordName("Bbmaj7", "letters")).toBe("B♭maj7");
  });
});

describe("écriture pour un instrument (moteur)", () => {
  it("transpose pour les saxophones et garde la guitare à l'octave près", () => {
    expect(writtenNotes("alto-saxophone", [60], false)).toEqual(["A4"]);
    expect(writtenNotes("tenor-saxophone", [60], false)).toEqual(["D5"]);
    expect(writtenNotes("piano", [61], true)).toEqual(["Db4"]);
    expect(writtenChords("alto-saxophone", ["C", "G7", "???"])).toEqual(["A", "E7", "???"]);
  });

  it("donne un doigté de guitare qui sonne juste", () => {
    const tab = tablatureFor("guitar", [40, 45, 64, 10]);
    expect(tab[0]).toEqual({ string: 0, stop: 0 });
    expect(tab[1]).toEqual({ string: 1, stop: 0 });
    expect(tab[2]).not.toBeNull();
    expect(tab[3]).toBeNull();
  });

  it("choisit les bémols selon la tonalité", () => {
    expect(keyUsesFlats("Eb major")).toBe(true);
    expect(keyUsesFlats("F minor")).toBe(true);
    expect(keyUsesFlats("E major")).toBe(false);
    expect(keyUsesFlats(null)).toBe(false);
  });
});

describe("vue de lecture", () => {
  const events = [
    event("chord", 0, 2000, { chord: "C", roman: "I" }),
    event("chord", 2000, 4000, { chord: "G", roman: "V" }),
    event("note", 0, 500, { midi: 64, pitch: "E4" }),
    event("note", 500, 1000, { midi: 67, pitch: "G4" }),
  ];
  const render = () =>
    renderToString(
      <ReadingView events={events} durationMs={4000} downbeatsMs={[0, 2000]} positionMs={0} playing={false} musicalKey="C major" onSeek={() => undefined} />,
    );

  it("affiche la grille d'accords par défaut", () => {
    const html = render();
    expect(html).toContain("Lire le morceau");
    expect(html).toContain("Grille d&#x27;accords");
    expect(html).toContain(">C<");
    expect(html).toContain(">G<");
  });
});
