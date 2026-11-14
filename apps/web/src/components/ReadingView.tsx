import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEvent } from "../app/api";
import { instruments, keyUsesFlats, nodeView, tablatureFor, writtenChords, writtenNotes } from "../theory/engine";
import { chordName, instrumentLabel, noteName } from "../theory/labels";
import { Fretboard } from "./Fretboard";
import { Piano } from "./Piano";

/**
 * Lecture du morceau analysé, à la manière d'une partition qui défile :
 * grille d'accords, mélodie en noms de notes (A B C ou Do Ré Mi) ou en
 * tablature, écrite pour l'instrument choisi (transposition comprise).
 * Les calculs (doigtés, transpositions) viennent du moteur.
 */

type View = "chords" | "melody" | "tab";
type Names = "letters" | "solfege";

const PX_PER_SECOND = 120;
const STORE = "harmonie-lecture";

const NAME_FR: Record<string, string> = { C: "do", D: "ré", E: "mi", F: "fa", G: "sol", A: "la", B: "si" };

function readChoice(): { view: View; names: Names; instrument: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? "{}") as Partial<{ view: View; names: Names; instrument: string }>;
    return { view: saved.view ?? "chords", names: saved.names ?? "letters", instrument: saved.instrument ?? "guitar" };
  } catch {
    return { view: "chords", names: "letters", instrument: "guitar" };
  }
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="caption">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-full border border-line p-1">
        {options.map(([option, text]) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={`min-h-9 rounded-full px-3.5 text-sm transition-colors duration-150 ${
              value === option ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReadingView({
  events,
  durationMs,
  downbeatsMs,
  positionMs,
  playing,
  musicalKey,
  onSeek,
}: {
  events: TimelineEvent[];
  durationMs: number;
  downbeatsMs: number[];
  positionMs: number;
  playing: boolean;
  /** Tonalité estimée (« Eb major »), pour écrire en dièses ou en bémols. */
  musicalKey: string | null;
  onSeek: (ms: number) => void;
}) {
  const [choice, setChoice] = useState(readChoice);
  const update = (change: Partial<typeof choice>) => {
    const next = { ...choice, ...change };
    // Tablature : seulement pour un instrument à frettes.
    setChoice(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite.
    }
  };

  const all = useMemo(() => instruments().filter((i) => i.layout !== "percussion"), []);
  const fretted = all.filter((i) => i.layout === "strings" && i.fretted);
  const choices = choice.view === "tab" ? fretted : all;
  const instrument = choices.find((i) => i.id === choice.instrument) ?? choices[0];
  const flats = keyUsesFlats(musicalKey);

  const chords = useMemo(() => events.filter((e) => e.feature === "chord").sort((a, b) => a.start_ms - b.start_ms), [events]);
  const notes = useMemo(() => events.filter((e) => e.feature === "note").sort((a, b) => a.start_ms - b.start_ms), [events]);

  // Écriture pour l'instrument : accords, notes, doigtés (moteur).
  const chordSymbols = useMemo(
    () => (instrument ? writtenChords(instrument.id, chords.map((c) => String(c.payload.chord ?? ""))) : []),
    [instrument, chords],
  );
  const midis = useMemo(() => notes.map((n) => Number(n.payload.midi)), [notes]);
  const written = useMemo(() => (instrument ? writtenNotes(instrument.id, midis, flats) : []), [instrument, midis, flats]);
  const tab = useMemo(() => (instrument && choice.view === "tab" ? tablatureFor(instrument.id, midis) : []), [instrument, midis, choice.view]);

  const width = Math.max(320, (durationMs / 1000) * PX_PER_SECOND);
  const x = (ms: number) => (ms / 1000) * PX_PER_SECOND;
  const scroller = useRef<HTMLDivElement>(null);

  // La partition défile : la tête reste au premier tiers de la vue.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    const at = x(positionMs);
    if (at < element.scrollLeft + 40 || at > element.scrollLeft + element.clientWidth * 0.6) element.scrollLeft = at - element.clientWidth / 3;
  }, [positionMs, playing]);

  const currentIndex = chords.findIndex((c) => positionMs >= c.start_ms && positionMs < c.end_ms);
  const currentChord = currentIndex >= 0 ? chords[currentIndex] : undefined;
  const currentView = currentChord ? nodeView(`chord:${String(currentChord.payload.chord)}`) : null;

  const low = midis.length ? Math.min(...midis) : 60;
  const high = midis.length ? Math.max(...midis, low + 12) : 72;
  const strings = instrument?.strings ?? [];
  const melodyHeight = 150;
  const stringGap = 22;

  if (chords.length === 0 && notes.length === 0) return null;

  const transposing = instrument?.pitchedIn ?? null;

  return (
    <section className="glass flex flex-col gap-5 p-4 sm:p-6" aria-labelledby="lecture-titre">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="lecture-titre" className="section-title">
          Lire le morceau
        </h2>
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <Segmented<View>
            label="Vue"
            value={choice.view}
            options={[
              ["chords", "Grille d'accords"],
              ["melody", "Mélodie"],
              ["tab", "Tablature"],
            ]}
            onChange={(view) => update({ view })}
          />
          {choice.view !== "tab" && (
            <Segmented<Names>
              label="Noms des notes"
              value={choice.names}
              options={[
                ["letters", "A B C"],
                ["solfege", "Do Ré Mi"],
              ]}
              onChange={(names) => update({ names })}
            />
          )}
          <label className="flex flex-col gap-1">
            <span className="caption">Instrument</span>
            <select
              value={instrument?.id ?? ""}
              onChange={(event) => update({ instrument: event.target.value })}
              className="min-h-11 rounded-xl border border-line bg-[var(--glass-bg)] px-3 text-sm text-ivory outline-none focus:border-[var(--accent-line)]"
            >
              {choices.map((option) => (
                <option key={option.id} value={option.id}>
                  {instrumentLabel(option.id, option.name)}
                  {option.pitchedIn ? ` (en ${NAME_FR[option.pitchedIn[0] ?? ""] ?? option.pitchedIn}${option.pitchedIn.includes("b") ? " bémol" : ""})` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {transposing && choice.view !== "tab" && (
        <p className="caption">
          {instrumentLabel(instrument?.id ?? "", instrument?.name ?? "")} : accords et notes sont écrits pour être lus sur
          l'instrument, qui sonne plus bas que l'écrit.
        </p>
      )}

      <div ref={scroller} className="relative overflow-x-auto overscroll-x-contain rounded-[12px] border border-line bg-[var(--color-night)]">
        <div className="relative" style={{ width }}>
          {/* Barres de mesure. */}
          {downbeatsMs.map((ms) => (
            <span key={ms} className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-line)]" style={{ left: x(ms) }} aria-hidden="true" />
          ))}

          {/* Accords. */}
          <div className="relative" style={{ height: choice.view === "chords" ? 84 : 44 }}>
            {chords.map((chord, index) => {
              const symbol = chordSymbols[index] ?? String(chord.payload.chord);
              const active = index === currentIndex;
              return (
                <button
                  key={chord.id}
                  type="button"
                  onClick={() => onSeek(chord.start_ms)}
                  title={`${chordName(symbol, choice.names)}${typeof chord.payload.roman === "string" ? `, ${chord.payload.roman}` : ""}`}
                  className={`absolute top-2 flex flex-col justify-center overflow-hidden rounded-[10px] border px-2 text-left transition-colors duration-150 ${
                    active ? "border-brass bg-[var(--accent-soft)] text-brass" : "border-line bg-[var(--glass-bg)] text-ivory hover:border-[var(--accent-line)]"
                  } ${chord.certainty === "uncertain" ? "border-dashed" : ""}`}
                  style={{ left: x(chord.start_ms) + 2, width: Math.max(28, x(chord.end_ms - chord.start_ms) - 4), bottom: 6 }}
                >
                  <span className={`font-display truncate font-semibold ${choice.view === "chords" ? "text-xl" : "text-sm"}`}>
                    {chordName(symbol, choice.names)}
                  </span>
                  {choice.view === "chords" && typeof chord.payload.roman === "string" && (
                    <span className="truncate text-xs text-ivory-3">{chord.payload.roman}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Mélodie : noms placés selon la hauteur. */}
          {choice.view === "melody" && (
            <div className="relative border-t border-line" style={{ height: melodyHeight }}>
              {notes.map((note, index) => {
                const midi = midis[index] ?? 60;
                const top = 8 + (1 - (midi - low) / Math.max(1, high - low)) * (melodyHeight - 36);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onSeek(note.start_ms)}
                    className={`absolute rounded-md px-1 text-[0.75rem] font-semibold whitespace-nowrap ${
                      positionMs >= note.start_ms && positionMs < note.end_ms ? "bg-brass text-[var(--color-night)]" : "bg-[var(--accent-soft)] text-ivory"
                    }`}
                    style={{ left: x(note.start_ms), top, minWidth: Math.max(18, x(note.end_ms - note.start_ms) - 2) }}
                  >
                    {noteName(written[index] ?? "", choice.names)}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tablature : une ligne par corde, l'aiguë en haut, le numéro de case. */}
          {choice.view === "tab" && (
            <div className="relative border-t border-line" style={{ height: strings.length * stringGap + 24 }}>
              {[...strings].reverse().map((string, row) => (
                <span key={`${string.open}-${row}`} className="pointer-events-none absolute inset-x-0 h-px bg-[var(--color-ivory-3)]" style={{ top: 16 + row * stringGap }} aria-hidden="true" />
              ))}
              {notes.map((note, index) => {
                const position = tab[index];
                if (!position) return null;
                const row = strings.length - 1 - position.string;
                const active = positionMs >= note.start_ms && positionMs < note.end_ms;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => onSeek(note.start_ms)}
                    className={`absolute -translate-y-1/2 rounded-[5px] px-1 font-mono text-[0.8125rem] leading-[1.1] font-semibold ${
                      active ? "bg-brass text-[var(--color-night)]" : "bg-[var(--color-night)] text-ivory"
                    }`}
                    style={{ left: x(note.start_ms), top: 16 + row * stringGap }}
                  >
                    {position.stop}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tête de lecture. */}
          <span className="pointer-events-none absolute inset-y-0 w-0.5 bg-brass" style={{ left: x(positionMs) }} aria-hidden="true" />
        </div>
      </div>

      {choice.view === "tab" && strings.length > 0 && (
        <p className="caption">
          Cordes de haut en bas : {[...strings].reverse().map((s) => noteName(s.open.replace(/\d+$/, ""), "letters", false)).join(" ")}. Les chiffres
          sont les cases ; 0 = corde à vide.
        </p>
      )}

      {choice.view === "chords" && currentView && instrument && (
        <div className="rise-in">
          <p className="caption mb-2">
            {chordName(chordSymbols[currentIndex] ?? String(currentChord?.payload.chord ?? ""), choice.names)}, sur {instrumentLabel(instrument.id, instrument.name).toLowerCase()}
          </p>
          {instrument.layout === "strings" ? <Fretboard instrument={instrument} tones={currentView.tones} /> : <Piano tones={currentView.tones} played={[]} />}
        </div>
      )}

      {notes.length > 0 && choice.view !== "chords" && (
        <p className="caption">La mélodie est estimée à partir de l'enregistrement : vérifiez-la à l'oreille.</p>
      )}
    </section>
  );
}
