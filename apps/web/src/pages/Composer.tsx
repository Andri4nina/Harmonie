import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { saveFile } from "../app/files";
import {
  isSequencerPlaying,
  sequencerPosition,
  setSequencerOptions,
  startSequencer,
  stopSequencer,
  useSequencerPlaying,
  useSequencerPosition,
} from "../audio/sequencer";
import { allNotesOff } from "../audio/synth";
import { DRUM_PIECES, PITCHED_SOUNDS } from "../audio/voices";
import { KeyboardTranspose, useKeyboardPlayer } from "../components/KeyboardControls";
import { PianoRoll, type Tool } from "../components/PianoRoll";
import { StepSequencer } from "../components/StepSequencer";
import { Icon } from "../components/ui";
import { type Generator, useComposer, withTrack } from "../state/composer";
import { useSettings } from "../state/store";
import {
  KEYS,
  MAX_TRACKS,
  type Project,
  STYLE_LABEL,
  type Style,
  compose,
  pieceToProject,
  projectToMidi,
  toMusicXml,
} from "../theory/compose";
import { randomSeed } from "../theory/ear";
import { instrumentLabel } from "../theory/labels";

const DEFAULT_GENERATOR: Generator = { key: "C", style: "pop", bars: 8, bpm: 96, seed: 1 };

/** Teintes des pistes : laiton, bleu, rose, ambre, violet, ciel (pas de vert). */
const TRACK_HUES = [75, 250, 350, 45, 295, 215];

const SNAPS: { value: number; label: string }[] = [
  { value: 1, label: "1 temps" },
  { value: 0.5, label: "½ temps" },
  { value: 0.25, label: "¼ temps" },
  { value: 1 / 3, label: "Triolet" },
  { value: 1 / 16, label: "Libre" },
];

function keyName(key: string): string {
  const [tonic, mode] = key.split(" ");
  return `${tonic} ${mode === "minor" ? "mineur" : "majeur"}`;
}

function generate(generator: Generator, bpm?: number): Project {
  const project = pieceToProject(compose({ key: generator.key, style: generator.style, bars: generator.bars, bpm: bpm ?? generator.bpm }, generator.seed));
  return project;
}

function snapNear(value: number, snap: number): number {
  return Math.round(value / snap) * snap;
}

function Toggle({ on, label, onClick, children, className = "" }: { on: boolean; label: string; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`inline-flex min-h-9 min-w-9 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm transition-colors duration-150 ${
        on ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory"
      } ${className}`}
    >
      {children}
    </button>
  );
}

const field =
  "min-h-9 rounded-xl border border-line bg-[var(--glass-bg)] px-2.5 text-sm text-ivory outline-none focus:border-[var(--accent-line)]";

export function Composer() {
  const stored = useComposer((state) => state.project);
  const generator = useComposer((state) => state.generator);
  const edited = useComposer((state) => state.edited);
  const trackIndex = useComposer((state) => state.track);
  const canUndo = useComposer((state) => state.past.length > 0);
  const canRedo = useComposer((state) => state.future.length > 0);
  const { setGenerator, load, edit, retime, undo, redo, selectTrack } = useComposer.getState();
  // Avant la relecture des données de l'appareil, la page montre le morceau
  // par défaut : identique au HTML pré-rendu.
  const fallback = useMemo(() => generate(DEFAULT_GENERATOR), []);
  const project = stored ?? fallback;
  const track = project.tracks[trackIndex] ?? project.tracks[0];
  const selected = project.tracks[trackIndex] ? trackIndex : 0;
  const drums = track?.sound === "drum-kit";

  const [tool, setTool] = useState<Tool>("pencil");
  const [snap, setSnap] = useState(0.25);
  const [zoom, setZoom] = useState(56);
  const [cursor, setCursor] = useState(0);
  const [loop, setLoop] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [recording, setRecording] = useState(false);
  const [newSound, setNewSound] = useState("guitar");
  const playing = useSequencerPlaying();
  const position = useSequencerPosition();
  const total = project.bars * project.beats_per_bar;

  useEffect(() => {
    void Promise.resolve(useComposer.persist.rehydrate()).then(() => {
      const state = useComposer.getState();
      if (!state.project) state.load(generate(state.generator));
    });
    return () => {
      stopSequencer();
      allNotesOff();
    };
  }, []);

  useEffect(() => setSequencerOptions({ loop, metronome }), [loop, metronome]);

  const toggle = useCallback(() => {
    if (isSequencerPlaying()) {
      stopSequencer();
      return;
    }
    startSequencer(() => useComposer.getState().project ?? fallback, cursor, () => setRecording(false));
  }, [cursor, fallback]);

  // Enregistrement au clavier d'ordinateur, aligné sur la grille.
  const pending = useRef(new Map<number, number>());
  const onNote = useCallback(
    (midi: number, down: boolean) => {
      if (!recording || !isSequencerPlaying()) return;
      const at = sequencerPosition();
      if (at === null) return;
      if (drums) {
        if (!down) return;
        const beat = snapNear(at, Math.max(snap, 0.25)) % total;
        edit((p) => withTrack(p, selected, (t) => ({ ...t, notes: [...t.notes, { midi, beat, length: 0.25, velocity: 104 }] })));
        return;
      }
      if (down) {
        pending.current.set(midi, at);
        return;
      }
      const start = pending.current.get(midi);
      pending.current.delete(midi);
      if (start === undefined) return;
      const end = at < start ? at + total : at;
      const beat = snapNear(start, snap) % total;
      const length = Math.max(snap, snapNear(end - start, snap));
      edit((p) => withTrack(p, selected, (t) => ({ ...t, notes: [...t.notes, { midi, beat, length: Math.min(length, total - beat), velocity: 100 }] })));
    },
    [recording, drums, snap, total, selected, edit],
  );
  // Batterie : chaque touche joue une pièce, de la grosse caisse à la ride.
  const drumMap = useCallback(
    (midi: number) => DRUM_PIECES[(((midi - useSettings.getState().keyboardBase) % DRUM_PIECES.length) + DRUM_PIECES.length) % DRUM_PIECES.length]!.midi,
    [],
  );
  useKeyboardPlayer(Boolean(track), track?.sound, onNote, drums ? drumMap : undefined);

  // Espace : lecture ; Ctrl+Z / Ctrl+Maj+Z (ou Ctrl+Y) : annuler, rétablir.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat) toggle();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    };
    // Un bouton qui a le focus ne doit pas, en plus, réagir à l'espace.
    const keyup = (event: KeyboardEvent) => {
      if (event.code === "Space" && (event.target as HTMLElement | null)?.tagName === "BUTTON") event.preventDefault();
    };
    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    return () => {
      window.removeEventListener("keydown", keydown);
      window.removeEventListener("keyup", keyup);
    };
  }, [toggle, undo, redo]);

  const compose_ = (change: Partial<Generator>, renew = false) => {
    const next = { ...generator, ...change, ...(renew ? { seed: randomSeed() } : {}) };
    setGenerator(next);
    load(generate(next, project.bpm));
    setCursor(0);
  };

  const exportFile = (...args: Parameters<typeof saveFile>) => {
    saveFile(...args).catch((error: unknown) => window.alert(`Le fichier n'a pas pu être enregistré : ${String((error as Error)?.message ?? error)}`));
  };
  const fileName = `harmonie-${generator.style}-${generator.key.replace(" ", "-").replace("#", "dièse").toLowerCase()}`;
  const exportMidi = () => {
    // Ce qui s'entend : pistes non coupées, notes dans la longueur du morceau.
    const audible = project.tracks.some((t) => t.solo) ? project.tracks.filter((t) => t.solo && !t.muted) : project.tracks.filter((t) => !t.muted);
    const clean: Project = { ...project, tracks: audible.map(({ name, sound, volume, notes }) => ({ name, sound, volume, notes: notes.filter((n) => n.beat < total) })) };
    exportFile(`${fileName}.mid`, projectToMidi(clean, generator.key), { name: "Fichier MIDI", extension: "mid", mime: "audio/midi" });
  };
  const exportScore = () => {
    const piece = { ...compose({ ...generator, bpm: project.bpm }, generator.seed), bpm: project.bpm };
    exportFile(`${fileName}.musicxml`, toMusicXml(piece, `Harmonie ${STYLE_LABEL[generator.style].name} en ${keyName(generator.key)}`), {
      name: "Partition MusicXML",
      extension: "musicxml",
      mime: "application/vnd.recordare.musicxml+xml",
    });
  };

  const addTrack = () => {
    if (project.tracks.length >= MAX_TRACKS) return;
    edit((p) => ({ ...p, tracks: [...p.tracks, { name: instrumentLabel(newSound, newSound), sound: newSound, volume: 0.8, notes: [] }] }));
    selectTrack(project.tracks.length);
  };
  const removeTrack = (index: number) => {
    edit((p) => ({ ...p, tracks: p.tracks.filter((_, i) => i !== index) }));
    selectTrack(Math.max(0, Math.min(index, project.tracks.length - 2)));
  };
  const resize = (bars: number) => {
    const next = Math.max(1, Math.min(32, bars));
    edit((p) => ({ ...p, bars: next }));
    setCursor((c) => Math.min(c, (next - 1) * project.beats_per_bar));
  };

  const shown = position ?? cursor;
  const barOf = Math.floor(shown / project.beats_per_bar) + 1;
  const beatOf = Math.floor(shown % project.beats_per_bar) + 1;

  return (
    <div className="flex flex-col gap-7 sm:gap-9">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em]">Composer</h1>
        <p className="mt-4 max-w-[64ch] text-ivory-2">
          Harmonie écrit une grille d'accords, une mélodie, une basse et une batterie. Retouchez ensuite chaque piste au
          rouleau de piano ou au pas à pas, jouez et enregistrez au clavier d'ordinateur, puis emportez le morceau en
          MIDI dans votre logiciel de musique.
        </p>
      </section>

      {/* Générateur */}
      <section aria-label="Générer un morceau" className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="flex flex-col gap-1">
          <span className="caption">Tonalité</span>
          <select value={generator.key} onChange={(event) => compose_({ key: event.target.value })} className={`${field} min-h-11`}>
            <optgroup label="Majeur">
              {KEYS.slice(0, 12).map((k) => (
                <option key={k} value={k}>
                  {keyName(k)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Mineur">
              {KEYS.slice(12).map((k) => (
                <option key={k} value={k}>
                  {keyName(k)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="caption" id="style-label">Style</span>
          <div role="radiogroup" aria-labelledby="style-label" className="inline-flex gap-1 rounded-full border border-line p-1">
            {(Object.keys(STYLE_LABEL) as Style[]).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={generator.style === option}
                title={STYLE_LABEL[option].hint}
                onClick={() => compose_({ style: option })}
                className={`min-h-9 rounded-full px-3.5 text-sm ${generator.style === option ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:text-ivory"}`}
              >
                {STYLE_LABEL[option].name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="caption" id="bars-label">Mesures</span>
          <div role="radiogroup" aria-labelledby="bars-label" className="inline-flex gap-1 rounded-full border border-line p-1">
            {[4, 8, 16].map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={generator.bars === option}
                onClick={() => compose_({ bars: option })}
                className={`min-h-9 min-w-11 rounded-full px-3 text-sm ${generator.bars === option ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:text-ivory"}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => compose_({}, true)} className="btn btn-ghost">
          Composer un autre morceau
        </button>
      </section>

      {/* Transport */}
      <section aria-label="Lecture" className="glass flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
        <button type="button" onClick={toggle} className="btn btn-primary min-w-30" title="Espace">
          <Icon name={playing ? "stop" : "play"} className="size-4" />
          {playing ? "Arrêter" : "Lire"}
        </button>
        <Toggle on={recording} label="Enregistrer au clavier d'ordinateur pendant la lecture" onClick={() => setRecording(!recording)}>
          <Icon name="record" className={`size-3.5 ${recording ? "text-[var(--color-danger)]" : ""}`} />
          <span className="hidden sm:inline">Enregistrer</span>
        </Toggle>
        <Toggle on={loop} label="Lecture en boucle" onClick={() => setLoop(!loop)}>
          <Icon name="loop" className="size-4" />
        </Toggle>
        <Toggle on={metronome} label="Métronome" onClick={() => setMetronome(!metronome)}>
          <span className="text-[0.8125rem] font-semibold">1 2 3 4</span>
        </Toggle>
        <span className="font-display min-w-24 text-sm tabular-nums text-ivory-2" aria-live="off">
          {barOf}.{beatOf} <span className="text-ivory-3">/ {project.bars}</span>
        </span>
        <label className="flex items-center gap-2">
          <span className="caption">Tempo</span>
          <input
            type="number"
            min={40}
            max={220}
            value={project.bpm}
            onChange={(event) => retime(Number(event.target.value) || project.bpm)}
            className={`${field} w-18 tabular-nums`}
          />
        </label>
        <span className="flex items-center gap-1">
          <span className="caption">Longueur</span>
          <button type="button" aria-label="Une mesure de moins" onClick={() => resize(project.bars - 1)} className="min-h-9 min-w-8 rounded-full text-ivory-2 hover:bg-[var(--hover)]">
            −
          </button>
          <span className="w-6 text-center text-sm tabular-nums">{project.bars}</span>
          <button type="button" aria-label="Une mesure de plus" onClick={() => resize(project.bars + 1)} className="min-h-9 min-w-8 rounded-full text-ivory-2 hover:bg-[var(--hover)]">
            +
          </button>
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Toggle on={false} label="Annuler (Ctrl+Z)" onClick={undo} className={canUndo ? "" : "pointer-events-none opacity-40"}>
            <Icon name="undo" className="size-4" />
          </Toggle>
          <Toggle on={false} label="Rétablir (Ctrl+Maj+Z)" onClick={redo} className={canRedo ? "" : "pointer-events-none opacity-40"}>
            <Icon name="redo" className="size-4" />
          </Toggle>
          <button type="button" onClick={exportMidi} className="btn text-ivory-2 hover:bg-[var(--hover)]">
            <Icon name="download" className="size-4" />
            MIDI
          </button>
          <button
            type="button"
            onClick={exportScore}
            disabled={edited}
            title={edited ? "La partition reprend le morceau généré : après une retouche, exportez en MIDI." : undefined}
            className="btn text-ivory-2 hover:bg-[var(--hover)]"
          >
            <Icon name="download" className="size-4" />
            MusicXML
          </button>
        </span>
      </section>

      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        {/* Pistes */}
        <section aria-label="Pistes" className="flex flex-col gap-2">
          <h2 className="section-title px-1">Pistes</h2>
          <ul className="flex flex-col gap-1.5">
            {project.tracks.map((item, index) => (
              <li
                key={index}
                className={`rounded-[12px] border p-2 transition-colors duration-150 ${index === selected ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-line"}`}
              >
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => selectTrack(index)} className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 text-left">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: `oklch(0.78 0.1 ${TRACK_HUES[index % TRACK_HUES.length]})` }} />
                    <span className="truncate font-medium">{item.name}</span>
                    <span className="caption shrink-0">{item.notes.length}</span>
                  </button>
                  <Toggle on={Boolean(item.muted)} label={`Couper ${item.name}`} onClick={() => edit((p) => withTrack(p, index, (t) => ({ ...t, muted: !t.muted })))}>
                    M
                  </Toggle>
                  <Toggle on={Boolean(item.solo)} label={`${item.name} en solo`} onClick={() => edit((p) => withTrack(p, index, (t) => ({ ...t, solo: !t.solo })))}>
                    S
                  </Toggle>
                </div>
                {index === selected && (
                  <div className="mt-2 flex flex-col gap-2 px-1.5 pb-1">
                    {item.sound !== "drum-kit" && (
                      <select
                        aria-label={`Instrument de ${item.name}`}
                        value={item.sound}
                        onChange={(event) => edit((p) => withTrack(p, index, (t) => ({ ...t, sound: event.target.value })))}
                        className={field}
                      >
                        {PITCHED_SOUNDS.map((sound) => (
                          <option key={sound} value={sound}>
                            {instrumentLabel(sound, sound)}
                          </option>
                        ))}
                      </select>
                    )}
                    <label className="flex items-center gap-2">
                      <span className="caption w-14">Volume</span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={item.volume}
                        onPointerDown={() => useComposer.getState().begin()}
                        onChange={(event) => useComposer.getState().live((p) => withTrack(p, index, (t) => ({ ...t, volume: Number(event.target.value) })))}
                        className="min-w-0 flex-1 accent-[var(--color-brass)]"
                      />
                    </label>
                    <button type="button" onClick={() => removeTrack(index)} disabled={project.tracks.length <= 1} className="inline-flex items-center gap-1.5 self-start text-sm text-ivory-3 hover:text-[var(--color-danger)] disabled:opacity-40">
                      <Icon name="trash" className="size-3.5" />
                      Supprimer la piste
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {project.tracks.length < MAX_TRACKS && (
            <div className="flex items-center gap-1.5">
              <select aria-label="Instrument de la nouvelle piste" value={newSound} onChange={(event) => setNewSound(event.target.value)} className={`${field} min-w-0 flex-1`}>
                {[...PITCHED_SOUNDS, "drum-kit"].map((sound) => (
                  <option key={sound} value={sound}>
                    {instrumentLabel(sound, sound)}
                  </option>
                ))}
              </select>
              <button type="button" onClick={addTrack} className="btn btn-ghost min-h-9 px-3">
                <Icon name="plus" className="size-4" />
                Piste
              </button>
            </div>
          )}
        </section>

        {/* Éditeur */}
        <section aria-label={drums ? "Séquenceur pas à pas" : "Rouleau de piano"} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="section-title">{drums ? "Pas à pas" : "Rouleau de piano"}</h2>
            {!drums && (
              <>
                <div role="radiogroup" aria-label="Outil" className="inline-flex gap-0.5 rounded-full border border-line p-0.5">
                  {(
                    [
                      ["pencil", "Crayon : poser, déplacer, allonger"],
                      ["eraser", "Gomme (ou clic droit avec le crayon)"],
                      ["select", "Sélection : encadrer des notes"],
                    ] as [Tool, string][]
                  ).map(([name, label]) => (
                    <Toggle key={name} on={tool === name} label={label} onClick={() => setTool(name)}>
                      <Icon name={name} className="size-4" />
                    </Toggle>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <span className="caption">Grille</span>
                  <select value={snap} onChange={(event) => setSnap(Number(event.target.value))} className={field}>
                    {SNAPS.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="inline-flex rounded-full border border-line">
                  <Toggle on={false} label="Dézoomer" onClick={() => setZoom((z) => Math.max(20, z / 1.25))}>
                    −
                  </Toggle>
                  <Toggle on={false} label="Zoomer" onClick={() => setZoom((z) => Math.min(200, z * 1.25))}>
                    +
                  </Toggle>
                </span>
              </>
            )}
            <span className="ml-auto">
              <KeyboardTranspose />
            </span>
          </div>
          {track &&
            (drums ? (
              <StepSequencer project={project} trackIndex={selected} position={position} />
            ) : (
              <PianoRoll hue={TRACK_HUES[selected % TRACK_HUES.length]!} project={project} trackIndex={selected} snap={snap} zoom={zoom} tool={tool} position={position} cursor={cursor} onCursor={setCursor} />
            ))}
          <p className="caption max-w-[72ch]">
            {drums
              ? "Clic : allumer ou éteindre un pas ; glisser pour en peindre plusieurs. Au clavier d'ordinateur, chaque touche joue une pièce de la batterie."
              : "Clic : poser une note (de la dernière longueur utilisée) ; glisser pour la déplacer, son bord droit pour l'allonger ; clic droit pour l'effacer. Flèches : déplacer la sélection (Maj : d'une octave), Suppr : l'effacer, Ctrl+A : tout sélectionner."}{" "}
            Espace : lire ou arrêter. Le fichier MIDI reprend ce qui s'entend : les pistes coupées n'y sont pas.
          </p>
        </section>
      </div>
    </div>
  );
}
