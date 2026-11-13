import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { noteOff, noteOn } from "../audio/synth";
import { useComposer, withTrack } from "../state/composer";
import type { Project, RollNote } from "../theory/compose";
import { solfege } from "../theory/labels";

export type Tool = "pencil" | "eraser" | "select";

const LOW = 24; // Do1
const HIGH = 96; // Do7
const ROW = 14;
const KEYS_WIDTH = 52;
const RULER = 24;
const VELOCITY = 56;
const BLACK = new Set([1, 3, 6, 8, 10]);
const EDGE = 7;

interface Drag {
  mode: "move" | "resize" | "erase" | "box" | "velocity";
  pointer: number;
  beat: number;
  midi: number;
  /** Notes touchées et leur état au début du geste. */
  originals: Map<number, RollNote>;
  box?: { x0: number; y0: number; x1: number; y1: number };
  preview?: number;
}

function snapDown(value: number, snap: number): number {
  return Math.floor(value / snap + 1e-9) * snap;
}

function snapNear(value: number, snap: number): number {
  return Math.round(value / snap) * snap;
}

/**
 * Rouleau de piano de la piste `trackIndex` : clic pour poser une note de la
 * dernière longueur utilisée, glisser pour la déplacer, bord droit pour
 * l'allonger, clic droit (ou gomme) pour effacer, rectangle de sélection,
 * vélocités en bas. Les notes des autres pistes apparaissent en filigrane.
 */
export function PianoRoll({
  project,
  trackIndex,
  snap,
  zoom,
  tool,
  position,
  cursor,
  onCursor,
  hue,
}: {
  hue: number;
  project: Project;
  trackIndex: number;
  snap: number;
  zoom: number;
  tool: Tool;
  position: number | null;
  cursor: number;
  onCursor: (beat: number) => void;
}) {
  const { begin, live, edit } = useComposer.getState();
  const track = project.tracks[trackIndex];
  const total = project.bars * project.beats_per_bar;
  const width = total * zoom;
  const height = (HIGH - LOW + 1) * ROW;
  const scroller = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [box, setBox] = useState<Drag["box"]>();
  const lastLength = useRef(1);

  useEffect(() => setSelected(new Set()), [trackIndex]);

  // Ouvre le rouleau sur les notes de la piste.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !track) return;
    const pitches = track.notes.map((n) => n.midi).sort((a, b) => a - b);
    const middle = pitches[Math.floor(pitches.length / 2)] ?? 60;
    element.scrollTop = (HIGH - middle) * ROW - element.clientHeight / 2 + RULER;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex]);

  // La vue suit la tête de lecture.
  useEffect(() => {
    const element = scroller.current;
    if (!element || position === null) return;
    const x = position * zoom;
    if (x > element.scrollLeft + element.clientWidth - KEYS_WIDTH - 40 || x < element.scrollLeft) element.scrollLeft = Math.max(0, x - 40);
  }, [position, zoom]);

  const ghosts = useMemo(
    () => project.tracks.flatMap((other, index) => (index === trackIndex || other.sound === "drum-kit" || other.muted ? [] : other.notes)),
    [project.tracks, trackIndex],
  );

  // Raccourcis : Suppr, flèches (Maj : octave), Ctrl+A, Échap.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelected(new Set(track?.notes.map((_, i) => i)));
        return;
      }
      if (event.key === "Escape") setSelected(new Set());
      if (selected.size === 0) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        edit((p) => withTrack(p, trackIndex, (t) => ({ ...t, notes: t.notes.filter((_, i) => !selected.has(i)) })));
        setSelected(new Set());
        return;
      }
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, event.shiftKey ? 12 : 1],
        ArrowDown: [0, event.shiftKey ? -12 : -1],
        ArrowLeft: [-snap, 0],
        ArrowRight: [snap, 0],
      };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      edit((p) =>
        withTrack(p, trackIndex, (t) => ({
          ...t,
          notes: t.notes.map((n, i) =>
            selected.has(i)
              ? { ...n, beat: Math.min(total - n.length, Math.max(0, n.beat + move[0])), midi: Math.min(127, Math.max(0, n.midi + move[1])) }
              : n,
          ),
        })),
      );
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [selected, trackIndex, snap, total, edit, track]);

  if (!track) return null;
  const sound = track.sound;

  const locate = (event: { clientX: number; clientY: number }) => {
    const rect = grid.current!.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return { x, y, beat: Math.max(0, Math.min(total, x / zoom)), midi: Math.max(LOW, Math.min(HIGH, HIGH - Math.floor(y / ROW))) };
  };

  const hit = (beat: number, midi: number): number => {
    for (let i = track.notes.length - 1; i >= 0; i--) {
      const n = track.notes[i]!;
      if (n.midi === midi && beat >= n.beat && beat < n.beat + n.length) return i;
    }
    return -1;
  };

  const erase = (beat: number, midi: number) => {
    const index = hit(beat, midi);
    if (index < 0) return;
    live((p) => withTrack(p, trackIndex, (t) => ({ ...t, notes: t.notes.filter((_, i) => i !== index) })));
    setSelected(new Set());
  };

  const preview = (midi: number) => {
    if (drag.current?.preview === midi) return;
    noteOn("roll", midi, sound, 0.26);
    if (drag.current) drag.current.preview = midi;
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    const at = locate(event);
    const index = hit(at.beat, at.midi);
    const base: Omit<Drag, "mode" | "originals"> = { pointer: event.pointerId, beat: at.beat, midi: at.midi };
    if (event.button === 2 || tool === "eraser") {
      event.preventDefault();
      begin();
      drag.current = { ...base, mode: "erase", originals: new Map() };
      erase(at.beat, at.midi);
    } else if (index >= 0) {
      const note = track.notes[index]!;
      const onEdge = at.x >= (note.beat + note.length) * zoom - EDGE && tool === "pencil";
      const group = selected.has(index) ? selected : new Set([index]);
      if (!selected.has(index)) setSelected(group);
      begin();
      drag.current = {
        ...base,
        mode: onEdge ? "resize" : "move",
        originals: new Map([...group].map((i) => [i, track.notes[i]!])),
      };
      if (!onEdge) preview(note.midi);
    } else if (tool === "select") {
      setSelected(new Set());
      drag.current = { ...base, mode: "box", originals: new Map(), box: { x0: at.x, y0: at.y, x1: at.x, y1: at.y } };
    } else {
      // Crayon : une note de la dernière longueur, aussitôt déplaçable.
      const length = Math.min(lastLength.current, total);
      const note: RollNote = { midi: at.midi, beat: Math.min(snapDown(at.beat, snap), total - length), length, velocity: 100 };
      begin();
      live((p) => withTrack(p, trackIndex, (t) => ({ ...t, notes: [...t.notes, note] })));
      const created = track.notes.length;
      setSelected(new Set([created]));
      drag.current = { ...base, beat: note.beat + Math.min(at.beat - note.beat, length / 2), mode: "move", originals: new Map([[created, note]]) };
      preview(note.midi);
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) {
      // Curseur : flèche d'étirement au bord droit d'une note.
      if (tool === "pencil" && grid.current) {
        const at = locate(event);
        const index = hit(at.beat, at.midi);
        const note = track.notes[index];
        grid.current.style.cursor = note && at.x >= (note.beat + note.length) * zoom - EDGE ? "ew-resize" : note ? "grab" : "crosshair";
      }
      return;
    }
    const at = locate(event);
    if (state.mode === "erase") {
      erase(at.beat, at.midi);
      return;
    }
    if (state.mode === "box" && state.box) {
      const next = { ...state.box, x1: at.x, y1: at.y };
      state.box = next;
      setBox(next);
      return;
    }
    const deltaBeat = snapNear(at.beat - state.beat, snap);
    const deltaMidi = at.midi - state.midi;
    live((p) =>
      withTrack(p, trackIndex, (t) => ({
        ...t,
        notes: t.notes.map((n, i) => {
          const original = state.originals.get(i);
          if (!original) return n;
          if (state.mode === "resize") {
            const end = snapNear(original.beat + original.length + (at.beat - state.beat), snap);
            const length = Math.max(snap, Math.min(total - original.beat, end - original.beat));
            lastLength.current = length;
            return { ...original, length };
          }
          return {
            ...original,
            beat: Math.max(0, Math.min(total - original.length, original.beat + deltaBeat)),
            midi: Math.max(LOW, Math.min(HIGH, original.midi + deltaMidi)),
          };
        }),
      })),
    );
    if (state.mode === "move" && state.originals.size === 1) {
      const original = [...state.originals.values()][0]!;
      preview(Math.max(LOW, Math.min(HIGH, original.midi + deltaMidi)));
    }
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (state.mode === "box" && state.box) {
      const { x0, x1, y0, y1 } = state.box;
      const [b0, b1] = [Math.min(x0, x1) / zoom, Math.max(x0, x1) / zoom];
      const [m0, m1] = [HIGH - Math.floor(Math.max(y0, y1) / ROW), HIGH - Math.floor(Math.min(y0, y1) / ROW)];
      setSelected(new Set(track.notes.flatMap((n, i) => (n.beat < b1 && n.beat + n.length > b0 && n.midi >= m0 && n.midi <= m1 ? [i] : []))));
      setBox(undefined);
    }
    if (state.mode === "move" && state.originals.size === 1) {
      const index = [...state.originals.keys()][0]!;
      const note = useComposer.getState().project?.tracks[trackIndex]?.notes[index];
      if (note) lastLength.current = note.length;
    }
    noteOff("roll");
    drag.current = null;
  };

  // Vélocité : glisser verticalement sur les barres du bas.
  const velocity = (event: ReactPointerEvent<HTMLDivElement>, starting: boolean) => {
    if (!starting && drag.current?.mode !== "velocity") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const value = Math.round(Math.max(1, Math.min(127, (1 - (event.clientY - rect.top - 4) / (VELOCITY - 8)) * 127)));
    if (starting) {
      begin();
      drag.current = { mode: "velocity", pointer: event.pointerId, beat: 0, midi: 0, originals: new Map() };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    live((p) =>
      withTrack(p, trackIndex, (t) => ({
        ...t,
        notes: t.notes.map((n, i) => {
          const near = Math.abs(n.beat * zoom - x) <= 5;
          return near && (selected.size === 0 || selected.has(i)) ? { ...n, velocity: value } : n;
        }),
      })),
    );
  };

  const keyRows = [];
  for (let midi = HIGH; midi >= LOW; midi--) keyRows.push(midi);
  const bar = project.beats_per_bar * zoom;
  const snapPx = snap * zoom;

  return (
    <div
      ref={scroller}
      className="relative max-h-[min(64vh,600px)] overflow-auto overscroll-contain rounded-[12px] border border-line bg-[var(--color-night)]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="relative" style={{ width: KEYS_WIDTH + width, height: RULER + height + VELOCITY }}>
        {/* Règle : un clic place le départ de la lecture. */}
        <div className="sticky top-0 z-30 flex" style={{ height: RULER }}>
          <div className="sticky left-0 z-10 shrink-0 border-r border-b border-line bg-[var(--color-velvet)]" style={{ width: KEYS_WIDTH }} />
          <div
            className="relative cursor-pointer border-b border-line bg-[var(--color-velvet)]"
            style={{ width }}
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onCursor(Math.max(0, Math.min(total - snap, snapDown((event.clientX - rect.left) / zoom, snap))));
            }}
          >
            {Array.from({ length: project.bars }, (_, i) => (
              <span key={i} className="absolute top-1 text-[0.6875rem] text-ivory-3 tabular-nums" style={{ left: i * bar + 4 }}>
                {i + 1}
              </span>
            ))}
            <span
              aria-label="Départ de la lecture"
              className="absolute bottom-0 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-brass"
              style={{ left: cursor * zoom - 6 }}
            />
            {position !== null && <span className="absolute inset-y-0 w-px bg-brass" style={{ left: position * zoom }} />}
          </div>
        </div>

        <div className="flex">
          {/* Touches : appuyer pour entendre. */}
          <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-[var(--color-velvet)]" style={{ width: KEYS_WIDTH }}>
            {keyRows.map((midi) => (
              <div
                key={midi}
                onPointerDown={() => noteOn("roll-key", midi, sound, 0.26)}
                onPointerUp={() => noteOff("roll-key")}
                onPointerLeave={() => noteOff("roll-key")}
                className={`flex cursor-pointer items-center justify-end pr-1.5 text-[0.625rem] leading-none select-none ${
                  BLACK.has(midi % 12) ? "bg-[color-mix(in_oklab,var(--color-ivory)_10%,transparent)] text-ivory-3" : "text-ivory-3"
                } ${midi % 12 === 0 ? "border-b border-line font-semibold text-ivory-2" : ""}`}
                style={{ height: ROW }}
              >
                {midi % 12 === 0 ? solfege(midi) : ""}
              </div>
            ))}
          </div>

          <div
            ref={grid}
            role="application"
            aria-label={`Rouleau de piano : ${track.name}, ${track.notes.length} notes`}
            className="relative touch-pan-x touch-pan-y select-none"
            style={{
              width,
              height,
              backgroundImage: [
                `repeating-linear-gradient(to right, var(--color-line) 0 1px, transparent 1px ${bar}px)`,
                `repeating-linear-gradient(to right, color-mix(in oklab, var(--color-ivory) 6%, transparent) 0 1px, transparent 1px ${zoom}px)`,
                snapPx >= 6 ? `repeating-linear-gradient(to right, color-mix(in oklab, var(--color-ivory) 3%, transparent) 0 1px, transparent 1px ${snapPx}px)` : "none",
              ].join(","),
            }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          >
            {keyRows.map((midi, row) =>
              BLACK.has(midi % 12) ? (
                <div key={midi} className="pointer-events-none absolute inset-x-0 bg-[color-mix(in_oklab,var(--color-ivory)_4%,transparent)]" style={{ top: row * ROW, height: ROW }} />
              ) : midi % 12 === 0 ? (
                <div key={midi} className="pointer-events-none absolute inset-x-0 border-b border-line" style={{ top: row * ROW, height: ROW }} />
              ) : null,
            )}
            {ghosts.map((n, i) =>
              n.midi >= LOW && n.midi <= HIGH ? (
                <div
                  key={`g${i}`}
                  className="pointer-events-none absolute rounded-[3px] bg-[color-mix(in_oklab,var(--color-ivory)_12%,transparent)]"
                  style={{ left: n.beat * zoom, top: (HIGH - n.midi) * ROW + 2, width: Math.max(2, n.length * zoom - 1), height: ROW - 4 }}
                />
              ) : null,
            )}
            {track.notes.map((n, i) =>
              n.midi >= LOW && n.midi <= HIGH ? (
                <div
                  key={i}
                  style={{ background: `oklch(0.76 0.1 ${hue})`, left: n.beat * zoom, top: (HIGH - n.midi) * ROW + 1, width: Math.max(3, n.length * zoom - 1), height: ROW - 2, opacity: 0.55 + (n.velocity / 127) * 0.45 }}
                  className={`pointer-events-none absolute touch-none overflow-hidden rounded-[3px] text-[0.5625rem] leading-[12px] text-[#161a2e] ${
                    selected.has(i) ? "outline-2 outline-offset-0 outline-[var(--color-ivory)]" : ""
                  }`}
                >
                  {n.length * zoom > 30 && <span className="pl-1 font-semibold">{solfege(n.midi)}</span>}
                </div>
              ) : null,
            )}
            {box && (
              <div
                className="pointer-events-none absolute border border-brass bg-[var(--accent-soft)]"
                style={{ left: Math.min(box.x0, box.x1), top: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }}
              />
            )}
            {position !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-brass" style={{ left: position * zoom }} />}
          </div>
        </div>

        {/* Vélocités. */}
        <div className="sticky bottom-0 z-30 flex border-t border-line" style={{ height: VELOCITY }}>
          <div className="sticky left-0 z-10 flex shrink-0 items-center justify-end border-r border-line bg-[var(--color-velvet)] pr-1.5 text-[0.625rem] text-ivory-3" style={{ width: KEYS_WIDTH }}>
            Vélocité
          </div>
          <div
            className="relative cursor-ns-resize touch-none bg-[var(--color-velvet)]"
            style={{ width }}
            onPointerDown={(event) => velocity(event, true)}
            onPointerMove={(event) => velocity(event, false)}
            onPointerUp={() => (drag.current = null)}
          >
            {track.notes.map((n, i) => (
              <span
                key={i}
                style={{
                  left: n.beat * zoom,
                  height: (n.velocity / 127) * (VELOCITY - 8),
                  background: selected.size === 0 || selected.has(i) ? `oklch(0.76 0.1 ${hue})` : "var(--color-line)",
                }}
                className="pointer-events-none absolute bottom-1 w-[3px] rounded-full"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
