import { useEffect, useRef } from "react";
import type { TimelineEvent } from "../app/api";
import { nodeView } from "../theory/engine";
import { hueStyle } from "./ui";

/** Pixels par seconde : un accord d'une mesure à 120 BPM fait 96 px. */
export const PX_PER_SECOND = 48;

const CADENCE: Record<string, string> = {
  authentic: "Cadence parfaite",
  plagal: "Cadence plagale",
  half: "Demi-cadence",
  deceptive: "Cadence rompue",
};

export const CERTAINTY: Record<string, string> = {
  detected: "détecté",
  estimated: "estimé",
  uncertain: "incertain",
  corrected: "corrigé",
};

/** Classe de hauteur de la fondamentale d'un accord, d'après le moteur. */
export function chordPitchClass(name: string): number | null {
  return nodeView(`chord:${name}`)?.pitchClass ?? null;
}

const KEY_NAMES: Record<string, string> = { major: "majeur", minor: "mineur" };
export function keyLabel(key: string): string {
  const [tonic, mode] = key.split(" ");
  return `${tonic} ${KEY_NAMES[mode ?? ""] ?? mode ?? ""}`;
}

function at(ms: number): number {
  return (ms / 1000) * PX_PER_SECOND;
}

/**
 * Frise de l'analyse. Cliquer un accord place la lecture à son début et le
 * sélectionne pour correction. La frise suit la tête de lecture.
 */
export function Timeline({
  events,
  durationMs,
  beatsMs,
  downbeatsMs,
  positionMs,
  playing,
  selected,
  onSelect,
}: {
  events: TimelineEvent[];
  durationMs: number;
  beatsMs: number[];
  downbeatsMs: number[];
  positionMs: number;
  playing: boolean;
  selected: string | null;
  onSelect: (event: TimelineEvent) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const width = Math.max(at(durationMs), 320);
  const chords = events.filter((event) => event.feature === "chord");
  const keys = events.filter((event) => event.feature === "key_segment");
  const cadences = events.filter((event) => event.feature === "cadence");
  const notes = events.filter((event) => event.feature === "note");
  const midis = notes.map((event) => Number(event.payload.midi));
  const low = Math.min(...midis);
  const span = Math.max(1, Math.max(...midis) - low);
  const downbeats = new Set(downbeatsMs);

  // Pendant la lecture, la tête reste au premier tiers de la zone visible.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !playing) return;
    const x = at(positionMs);
    if (x < element.scrollLeft + 40 || x > element.scrollLeft + element.clientWidth * 0.7) {
      element.scrollLeft = x - element.clientWidth / 3;
    }
  }, [positionMs, playing]);

  return (
    <div ref={scroller} className="scroll-x relative -mx-1 px-1 pb-3">
      <div className="relative" style={{ width }}>
        <div className="caption mb-1">Accords</div>
        <div className="relative h-16">
          {chords.map((event) => {
            const name = String(event.payload.chord ?? "");
            const pitchClass = chordPitchClass(name);
            const isSelected = selected === event.id;
            const uncertain = event.certainty === "uncertain";
            return (
              <button
                key={event.id}
                type="button"
                data-hue
                style={{ ...(pitchClass === null ? {} : hueStyle(pitchClass)), left: at(event.start_ms), width: Math.max(at(event.end_ms - event.start_ms) - 2, 6) }}
                onClick={() => onSelect(event)}
                aria-pressed={isSelected}
                aria-label={`${name}, ${CERTAINTY[event.certainty] ?? event.certainty}`}
                className={`absolute inset-y-0 flex flex-col justify-center overflow-hidden rounded-[10px] border px-2 text-left transition-colors duration-150 ${
                  isSelected
                    ? "border-brass bg-[var(--accent-soft)]"
                    : `${uncertain ? "border-dashed" : ""} border-[var(--note-line)] bg-[var(--note-soft)] hover:border-[var(--note)]`
                }`}
              >
                <span className="font-display truncate text-[0.95rem] leading-tight font-medium">{name}</span>
                {typeof event.payload.roman === "string" && <span className="truncate text-xs text-ivory-2">{event.payload.roman}</span>}
              </button>
            );
          })}
        </div>

        {notes.length > 0 && (
          <>
            <div className="caption mt-3 mb-1">Ligne supérieure (mélodie probable)</div>
            <div className="relative h-20" role="img" aria-label={`Ligne supérieure : ${notes.length} notes`}>
              {notes.map((event) => (
                <span
                  key={event.id}
                  title={`${String(event.payload.pitch)}, ${CERTAINTY[event.certainty] ?? event.certainty}`}
                  className={`absolute h-1.5 rounded-full ${event.certainty === "uncertain" ? "bg-ivory/30" : "bg-ivory/70"}`}
                  style={{
                    left: at(event.start_ms),
                    width: Math.max(at(event.end_ms - event.start_ms) - 1, 3),
                    top: `${(1 - (Number(event.payload.midi) - low) / span) * 88}%`,
                  }}
                />
              ))}
            </div>
          </>
        )}

        <div className="caption mt-3 mb-1">Tonalité</div>
        <div className="relative h-7">
          {keys.map((event) => (
            <div
              key={event.id}
              className="absolute inset-y-0 flex items-center overflow-hidden rounded-lg border border-line px-2 text-sm text-ivory-2"
              style={{ left: at(event.start_ms), width: Math.max(at(event.end_ms - event.start_ms) - 2, 6) }}
            >
              <span className="truncate">{keyLabel(String(event.payload.key ?? ""))}</span>
            </div>
          ))}
        </div>

        <div className="caption mt-3 mb-1">Temps</div>
        <div className="relative h-6" aria-hidden="true">
          {beatsMs.map((beat) => (
            <span
              key={beat}
              className={`absolute bottom-0 w-px ${downbeats.has(beat) ? "h-full bg-ivory/55" : "h-1/2 bg-ivory/20"}`}
              style={{ left: at(beat) }}
            />
          ))}
          {cadences.map((event) => (
            <span
              key={event.id}
              title={CADENCE[String(event.payload.cadence)] ?? String(event.payload.cadence)}
              className="absolute top-0 size-2 -translate-x-1/2 rotate-45 bg-brass"
              style={{ left: at(event.start_ms) }}
            />
          ))}
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-brass"
          style={{ left: at(positionMs), transition: playing ? "none" : "left 120ms ease-out" }}
        />
      </div>
    </div>
  );
}
