import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router";
import { play, stop } from "../audio/synth";
import { CircleOfFifths } from "../components/CircleOfFifths";
import { Fretboard } from "../components/Fretboard";
import { MusicGraph } from "../components/MusicGraph";
import { Piano } from "../components/Piano";
import { SearchBox } from "../components/SearchBox";
import { Spectrum } from "../components/Spectrum";
import { Icon, NodeChip, Panel, hueStyle } from "../components/ui";
import { usePlayer, useSettings } from "../state/store";
import { type NodeView, instruments, nodeView, winds } from "../theory/engine";
import { introOf } from "../theory/head";
import {
  FACT_LABEL,
  GROUP_LABEL,
  KIND_LABEL,
  detailLabel,
  factValue,
  instrumentLabel,
  intervalLabel,
  labelOf,
} from "../theory/labels";
import { idOf, pathOf } from "../theory/routes";

const PLAY_LABEL: Record<string, string> = {
  melodic: "Écouter",
  harmonic: "Écouter l'accord",
  sequence: "Écouter la progression",
};

/** Clés « classe de hauteur:mode » des tonalités liées au nœud (pour le cercle). */
function relatedKeys(view: NodeView): { current?: string; related: Set<string> } {
  const keyOf = (id: string, pitchClass: number) => `${pitchClass}:${id.split(":")[2]}`;
  const related = new Set<string>();
  for (const group of view.groups) {
    for (const item of group.items) {
      if (item.kind === "key") related.add(keyOf(item.id, item.pitchClass));
    }
  }
  return { current: view.kind === "key" ? keyOf(view.id, view.pitchClass) : undefined, related };
}

function Hero({ view }: { view: NodeView }) {
  const playingId = usePlayer((state) => state.playingId);
  const active = usePlayer((state) => state.active);
  const playing = playingId === view.id;
  return (
    <section className="pt-4 sm:pt-8" key={view.id}>
      <p className="caption text-[0.9375rem]">{KIND_LABEL[view.kind]}</p>
      <h1 className="font-display engrave mt-1 text-[clamp(3.25rem,13vw,8.5rem)] leading-[0.92] font-medium tracking-[-0.025em] break-words">
        {labelOf(view.id)}
      </h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <p className="max-w-[62ch] text-ivory-2">{introOf(view)}</p>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => (playing ? stop() : play(view.playback.steps, view.playback.mode, view.id))}
            disabled={view.playback.steps.length === 0}
            aria-pressed={playing}
            className="btn btn-primary px-6"
          >
            <Icon name={playing ? "stop" : "play"} className="size-4" />
            {playing ? "Arrêter" : PLAY_LABEL[view.playback.mode]}
          </button>
          <div className="w-40 sm:w-56">
            <Spectrum />
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {view.tones.map((tone) => {
          const sounding = playing && active.some((midi) => midi % 12 === tone.pitchClass);
          return (
            <div
              key={tone.note}
              data-hue
              style={hueStyle(tone.pitchClass)}
              className={`flex min-w-14 flex-col items-center rounded-[10px] border px-3 py-2 transition-colors duration-150 ${
                sounding ? "border-[var(--note)] bg-[var(--note)] text-night" : "border-[var(--note-line)] bg-[var(--note-soft)]"
              }`}
            >
              <span className="font-display text-2xl leading-none font-semibold">{tone.note}</span>
              <span className={`mt-1 text-xs ${sounding ? "text-night/70" : "text-ivory-2"}`}>{tone.role}</span>
            </div>
          );
        })}
      </div>

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
        {view.facts.map((fact) => (
          <div key={fact.key} className="min-w-0">
            <dt className="caption">{FACT_LABEL[fact.key] ?? fact.key}</dt>
            <dd className="mt-0.5 break-words">{factValue(fact.key, fact.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Ce que lisent les instruments à vent pour faire entendre ces notes. */
function Winds({ view }: { view: NodeView }) {
  const notes = view.tones.map((tone) => tone.note);
  const rows = useMemo(() => winds(notes), [view.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel title="Instruments à vent" framed={false}>
      <p className="mb-4 max-w-[62ch] text-ivory-2">
        Un instrument transpositeur ne joue pas la note qu'il lit. Pour faire entendre{" "}
        <span className="font-display text-ivory">{notes.join(" ")}</span>, voici ce que chacun doit lire.
      </p>
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id} className="grid gap-x-6 gap-y-2 border-t border-line py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
            <div>
              <div className="font-medium">{instrumentLabel(row.id, row.name)}</div>
              <div className="caption">
                {row.interval
                  ? `sonne une ${intervalLabel(row.interval)} plus ${row.sounds_below ? "bas" : "haut"}`
                  : "en ut : lit ce qu'il joue"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {row.tones.map((tone, index) => {
                const target = nodeView(`note:${tone.written}`);
                return target ? <NodeChip key={index} id={target.id} pitchClass={target.pitchClass} /> : null;
              })}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Relations({ view }: { view: NodeView }) {
  const step = usePlayer((state) => (state.playingId === view.id ? state.step : null));
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
      {view.groups.map((group) => (
        <Panel key={group.key} title={GROUP_LABEL[group.key] ?? group.key} framed={false}>
          <div className="flex flex-wrap gap-2">
            {group.items.map((item, index) => (
              <NodeChip
                key={`${item.id}-${index}`}
                id={item.id}
                pitchClass={item.pitchClass}
                detail={detailLabel(group.key, item.detail)}
                active={group.key === "steps" && step === index}
              />
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}

export function Explorer() {
  const { pathname } = useLocation();
  const view = useMemo(() => {
    const id = idOf(pathname);
    return id ? nodeView(id) : null;
  }, [pathname]);
  const visit = useSettings((state) => state.visit);
  const ready = useSettings((state) => state.ready);
  const instrumentId = useSettings((state) => state.instrumentId);
  const setInstrument = useSettings((state) => state.setInstrument);

  useEffect(() => {
    stop();
  }, [view]);
  // L'historique n'est écrit qu'une fois les réglages relus, pour ne pas les écraser.
  useEffect(() => {
    if (view && ready) visit(view.id);
  }, [view, ready, visit]);

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <SearchBox autoFocus />
        <Panel framed={false}>
          <h1 className="font-display text-5xl font-medium">Page introuvable</h1>
          <p className="mt-3 max-w-[62ch] text-ivory-2">
            Cette adresse ne correspond à aucun élément musical connu du moteur.{" "}
            <Link to={pathOf("note:C")} className="text-brass underline underline-offset-4">
              Revenir à la note Do
            </Link>
            .
          </p>
        </Panel>
      </div>
    );
  }

  const stringed = instruments().filter((instrument) => instrument.layout === "strings");
  const instrument = stringed.find((candidate) => candidate.id === instrumentId) ?? stringed[0];
  const played = view.playback.steps.flat();
  const keys = relatedKeys(view);

  return (
    <div className="flex flex-col gap-10 sm:gap-12">
      <div className="flex flex-col gap-2">
        <SearchBox />
        <Hero view={view} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Graphe musical">
          <MusicGraph view={view} />
        </Panel>
        <Panel title="Tonalités liées">
          <div className="mx-auto max-w-[440px]">
            <CircleOfFifths current={keys.current} related={keys.related} />
          </div>
        </Panel>
      </div>

      <Panel title="Piano">
        <Piano tones={view.tones} played={played} />
      </Panel>

      {instrument && (
        <Panel
          title={instrumentLabel(instrument.id, instrument.name)}
          aside={
            <div className="flex flex-wrap gap-1" role="group" aria-label="Instrument">
              {stringed.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={candidate.id === instrument.id}
                  onClick={() => setInstrument(candidate.id)}
                  className={`min-h-9 rounded-full px-3.5 text-sm transition-colors duration-150 ${
                    candidate.id === instrument.id
                      ? "bg-[var(--accent-soft)] text-brass"
                      : "text-ivory-2 hover:bg-white/5 hover:text-ivory"
                  }`}
                >
                  {instrumentLabel(candidate.id, candidate.name)}
                </button>
              ))}
            </div>
          }
        >
          <Fretboard instrument={instrument} tones={view.tones} />
        </Panel>
      )}

      <Winds view={view} />
      <Relations view={view} />
    </div>
  );
}
