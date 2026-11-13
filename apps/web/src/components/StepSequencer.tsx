import { useEffect, useRef } from "react";
import { noteOn } from "../audio/synth";
import { DRUM_PIECES } from "../audio/voices";
import { useComposer, withTrack } from "../state/composer";
import type { Project } from "../theory/compose";

const STEP = 0.25;
const CELL = 26;
const LABEL = 132;

/**
 * Séquenceur pas à pas de la batterie : une ligne par pièce, seize pas par
 * mesure de 4/4. Un clic allume ou éteint un pas ; glisser en allume (ou en
 * éteint) plusieurs d'affilée.
 */
export function StepSequencer({ project, trackIndex, position }: { project: Project; trackIndex: number; position: number | null }) {
  const { begin, live, edit } = useComposer.getState();
  const track = project.tracks[trackIndex];
  const steps = Math.round((project.bars * project.beats_per_bar) / STEP);
  const perBar = Math.round(project.beats_per_bar / STEP);
  const painting = useRef<{ on: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const current = position === null ? -1 : Math.floor(position / STEP + 1e-9);

  useEffect(() => {
    const element = scroller.current;
    if (!element || current < 0) return;
    const x = current * CELL;
    if (x > element.scrollLeft + element.clientWidth - LABEL - 40 || x < element.scrollLeft) element.scrollLeft = Math.max(0, x - 40);
  }, [current]);

  useEffect(() => {
    const stopPainting = () => (painting.current = null);
    window.addEventListener("pointerup", stopPainting);
    return () => window.removeEventListener("pointerup", stopPainting);
  }, []);

  if (!track) return null;
  const lit = new Set(track.notes.map((n) => `${n.midi}:${Math.round(n.beat / STEP)}`));

  const set = (midi: number, step: number, on: boolean) => {
    const key = `${midi}:${step}`;
    if (lit.has(key) === on) return;
    live((p) =>
      withTrack(p, trackIndex, (t) => ({
        ...t,
        notes: on
          ? [...t.notes, { midi, beat: step * STEP, length: STEP, velocity: step % 4 === 0 ? 112 : 96 }]
          : t.notes.filter((n) => !(n.midi === midi && Math.round(n.beat / STEP) === step)),
      })),
    );
    if (on) noteOn("step", midi, "drum-kit", 0.3);
  };

  const copyFirstBar = () =>
    edit((p) =>
      withTrack(p, trackIndex, (t) => {
        const bar = t.notes.filter((n) => n.beat < p.beats_per_bar);
        const notes = Array.from({ length: p.bars }, (_, i) => bar.map((n) => ({ ...n, beat: n.beat + i * p.beats_per_bar }))).flat();
        return { ...t, notes };
      }),
    );

  return (
    <div className="flex flex-col gap-3">
      <div ref={scroller} className="relative max-h-[min(64vh,600px)] overflow-auto overscroll-contain rounded-[12px] border border-line bg-[var(--color-night)]">
        <div style={{ width: LABEL + steps * CELL + project.bars * 6 }}>
          {DRUM_PIECES.map((piece) => (
            <div key={piece.midi} className="flex" style={{ height: CELL + 6 }}>
              <button
                type="button"
                onClick={() => noteOn("step", piece.midi, "drum-kit", 0.3)}
                className="sticky left-0 z-10 shrink-0 truncate border-r border-b border-line bg-[var(--color-velvet)] px-3 text-left text-[0.8125rem] text-ivory-2 hover:text-ivory"
                style={{ width: LABEL }}
              >
                {piece.name}
              </button>
              <div className="flex items-center border-b border-line" style={{ gap: 0 }}>
                {Array.from({ length: steps }, (_, step) => {
                  const on = lit.has(`${piece.midi}:${step}`);
                  // Groupes de quatre pas (un temps) en teintes alternées.
                  const shade = Math.floor((step % perBar) / 4) % 2 === 0;
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${piece.name}, mesure ${Math.floor(step / perBar) + 1}, pas ${(step % perBar) + 1}`}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        begin();
                        painting.current = { on: !on };
                        set(piece.midi, step, !on);
                      }}
                      onPointerEnter={() => painting.current && set(piece.midi, step, painting.current.on)}
                      className={`mx-[2px] shrink-0 rounded-[5px] border transition-colors duration-75 ${
                        on
                          ? "border-brass bg-brass"
                          : `${shade ? "bg-[color-mix(in_oklab,var(--color-ivory)_9%,transparent)]" : "bg-[color-mix(in_oklab,var(--color-ivory)_4%,transparent)]"} border-transparent hover:border-[var(--accent-line)]`
                      } ${step === current ? "ring-2 ring-[var(--color-ivory)]" : ""} ${step % perBar === 0 && step > 0 ? "ml-[6px]" : ""}`}
                      style={{ width: CELL - 4, height: CELL - 4 }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div>
        <button type="button" onClick={copyFirstBar} className="btn text-ivory-2 hover:bg-white/5">
          Répéter la première mesure partout
        </button>
      </div>
    </div>
  );
}
