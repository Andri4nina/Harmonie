import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { saveFile } from "../app/files";
import { playTimed, stop } from "../audio/synth";
import { Icon, hueStyle } from "../components/ui";
import { usePlayer } from "../state/store";
import { KEYS, type Piece, STYLE_LABEL, type Style, compose, playback, toMidi, toMusicXml } from "../theory/compose";
import { randomSeed } from "../theory/ear";
import { nodeView } from "../theory/engine";
import { pathOf } from "../theory/routes";

const PLAYER_ID = "compose";

function keyName(key: string): string {
  const [tonic, mode] = key.split(" ");
  return `${tonic} ${mode === "minor" ? "mineur" : "majeur"}`;
}

/** Une mesure : l'accord, son degré, et la mélodie dessinée dans la case. */
function Bar({ piece, index, low, high, beat }: { piece: Piece; index: number; low: number; high: number; beat: number | null }) {
  const placed = piece.chords[index];
  if (!placed) return null;
  const notes = piece.melody.filter((n) => n.beat >= placed.beat && n.beat < placed.beat + placed.length);
  const view = nodeView(`chord:${placed.chord}`);
  const current = beat !== null && beat >= placed.beat && beat < placed.beat + placed.length;
  const span = Math.max(1, high - low);
  return (
    <div
      data-hue
      style={view ? hueStyle(view.pitchClass) : undefined}
      className={`relative flex min-h-36 flex-col rounded-[14px] border p-3 transition-colors duration-150 ${
        current ? "border-brass bg-[var(--accent-soft)]" : "border-line"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        {view ? (
          <Link to={pathOf(view.id)} className="font-display text-xl font-semibold hover:text-brass">
            {placed.chord}
          </Link>
        ) : (
          <span className="font-display text-xl font-semibold">{placed.chord}</span>
        )}
        <span className="caption">{placed.numeral}</span>
      </div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="mt-2 h-16 w-full flex-1" aria-hidden="true">
        {notes.map((note) => (
          <rect
            key={note.beat}
            x={((note.beat - placed.beat) / placed.length) * 100 + 0.8}
            width={(note.length / placed.length) * 100 - 1.6}
            y={(1 - (note.midi - low) / span) * 52 + 2}
            height={6}
            rx={3}
            className="fill-[var(--note)]"
            data-hue
            style={hueStyle(note.midi % 12)}
          />
        ))}
        {current && beat !== null && (
          <line x1={((beat - placed.beat) / placed.length) * 100} x2={((beat - placed.beat) / placed.length) * 100} y1={0} y2={60} className="stroke-brass" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <span className="caption mt-1">mesure {index + 1}</span>
    </div>
  );
}

export function Composer() {
  const [key, setKey] = useState("C");
  const [style, setStyle] = useState<Style>("pop");
  const [bars, setBars] = useState(8);
  const [bpm, setBpm] = useState(96);
  // Graine fixe au premier affichage : la page pré-rendue et le navigateur
  // montrent le même morceau.
  const [seed, setSeed] = useState(1);
  const [beat, setBeat] = useState<number | null>(null);
  const playing = usePlayer((state) => state.playingId === PLAYER_ID);

  const piece = useMemo(() => compose({ key, style, bars, bpm }, seed), [key, style, bars, bpm, seed]);
  const pitches = piece.melody.map((n) => n.midi);
  const low = Math.min(...pitches) - 1;
  const high = Math.max(...pitches) + 1;
  const total = piece.chords.length * piece.beats_per_bar;

  // Tête de lecture : position calculée depuis le départ de la lecture.
  useEffect(() => {
    if (!playing) {
      setBeat(null);
      return;
    }
    const started = performance.now() + 80;
    let frame = 0;
    const tick = () => {
      const elapsed = ((performance.now() - started) / 1000) * (piece.bpm / 60);
      setBeat(elapsed >= 0 && elapsed < total ? elapsed : null);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, piece, total]);

  useEffect(() => () => stop(), []);

  const listen = () => (playing ? stop() : playTimed(playback(piece), piece.bpm, PLAYER_ID));
  const renew = () => {
    stop();
    setSeed(randomSeed());
  };
  const title = `Harmonie ${STYLE_LABEL[style].name} en ${keyName(key)}`;
  const fileName = `harmonie-${style}-${key.replace(" ", "-").replace("#", "dièse").toLowerCase()}`;

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2rem,5.6vw,3.6rem)] leading-[1.06] font-semibold tracking-[-0.015em]">Composer</h1>
        <p className="mt-4 max-w-[62ch] text-ivory-2">
          Choisissez une tonalité et un style : Harmonie écrit une grille d'accords qui finit sur une cadence parfaite,
          et une mélodie qui pose les notes des accords sur les temps forts. Écoutez, recommencez, puis emportez le
          morceau dans votre logiciel de musique.
        </p>
      </section>

      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <label className="flex flex-col gap-1">
            <span className="caption">Tonalité</span>
            <select
              value={key}
              onChange={(event) => {
                stop();
                setKey(event.target.value);
              }}
              className="min-h-11 rounded-xl border border-line bg-[var(--glass-bg)] px-3 text-ivory outline-none focus:border-[var(--accent-line)]"
            >
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
                  aria-checked={style === option}
                  title={STYLE_LABEL[option].hint}
                  onClick={() => {
                    stop();
                    setStyle(option);
                  }}
                  className={`min-h-9 rounded-full px-3.5 text-sm ${style === option ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:text-ivory"}`}
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
                  aria-checked={bars === option}
                  onClick={() => {
                    stop();
                    setBars(option);
                  }}
                  className={`min-h-9 min-w-11 rounded-full px-3 text-sm ${bars === option ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:text-ivory"}`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <label className="flex min-w-48 flex-1 flex-col gap-1 sm:max-w-72">
            <span className="caption">Tempo : {bpm} à la noire</span>
            <input
              type="range"
              min={60}
              max={160}
              step={2}
              value={bpm}
              onChange={(event) => setBpm(Number(event.target.value))}
              className="min-h-11 accent-[var(--color-brass)]"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={listen} className="btn btn-primary">
            <Icon name={playing ? "stop" : "play"} className="size-4" />
            {playing ? "Arrêter" : "Écouter"}
          </button>
          <button type="button" onClick={renew} className="btn btn-ghost">
            Composer un autre morceau
          </button>
          <span className="mx-1 hidden h-6 w-px bg-[var(--color-line)] sm:block" aria-hidden="true" />
          <button type="button" onClick={() => void saveFile(`${fileName}.mid`, toMidi(piece), { name: "Fichier MIDI", extension: "mid", mime: "audio/midi" })} className="btn text-ivory-2 hover:bg-white/5">
            <Icon name="download" className="size-4" />
            MIDI
          </button>
          <button
            type="button"
            onClick={() => void saveFile(`${fileName}.musicxml`, toMusicXml(piece, title), { name: "Partition MusicXML", extension: "musicxml", mime: "application/vnd.recordare.musicxml+xml" })}
            className="btn text-ivory-2 hover:bg-white/5"
          >
            <Icon name="download" className="size-4" />
            Partition MusicXML
          </button>
        </div>
      </div>

      <section className="glass p-3 sm:p-5" aria-label={`Grille : ${piece.chords.map((c) => c.chord).join(", ")}`}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="section-title">
            {STYLE_LABEL[style].name} en {keyName(key)}
          </h2>
          <span className="caption">
            {piece.chords.map((c) => c.numeral).join(" – ")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {piece.chords.map((_, index) => (
            <Bar key={index} piece={piece} index={index} low={low} high={high} beat={beat} />
          ))}
        </div>
      </section>
      <p className="caption max-w-[62ch]">
        Le fichier MIDI contient trois pistes (mélodie, accords, basse) et s'ouvre dans tout séquenceur. La partition
        MusicXML s'ouvre dans MuseScore, Finale, Sibelius ou Dorico, avec les symboles d'accords au-dessus de la portée.
      </p>
    </div>
  );
}
