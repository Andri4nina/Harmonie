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
    <section className="glass enter p-6" data-hue style={hueStyle(view.pitchClass)} key={view.id}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="eyebrow !text-[var(--accent)]">{KIND_LABEL[view.kind]}</div>
          <h1 className="mt-1 text-5xl font-semibold tracking-tight">{labelOf(view.id)}</h1>
        </div>
        <div className="flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => (playing ? stop() : play(view.playback.steps, view.playback.mode, view.id))}
            disabled={view.playback.steps.length === 0}
            aria-pressed={playing}
            className="flex items-center gap-2 rounded-2xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-ink transition-transform duration-150 hover:bg-[var(--accent-strong)] active:scale-95 disabled:opacity-40"
          >
            <Icon name={playing ? "stop" : "play"} className="size-4" />
            {playing ? "Arrêter" : PLAY_LABEL[view.playback.mode]}
          </button>
          <Spectrum />
        </div>
      </div>

      <p className="mt-4 max-w-3xl text-sm leading-relaxed text-fg-2">{introOf(view)}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {view.tones.map((tone) => {
          const sounding = playing && active.some((midi) => midi % 12 === tone.pitchClass);
          return (
            <div
              key={tone.note}
              data-hue
              style={hueStyle(tone.pitchClass)}
              className={`flex min-w-12 flex-col items-center rounded-xl border px-3 py-2 transition-all duration-150 ${
                sounding
                  ? "-translate-y-0.5 border-[var(--accent)] bg-[var(--accent)] text-ink"
                  : "border-[var(--accent-line)] bg-[var(--accent-soft)]"
              }`}
            >
              <span className="font-mono text-lg leading-none font-semibold">{tone.note}</span>
              <span className={`mt-1 font-mono text-[10px] ${sounding ? "text-ink/70" : "text-fg-2"}`}>{tone.role}</span>
            </div>
          );
        })}
      </div>

      <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-3 border-t border-line pt-4">
        {view.facts.map((fact) => (
          <div key={fact.key}>
            <dt className="eyebrow">{FACT_LABEL[fact.key] ?? fact.key}</dt>
            <dd className="mt-1 font-mono text-sm">{factValue(fact.key, fact.value)}</dd>
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
    <Panel title="Instruments à vent">
      <p className="mb-4 max-w-3xl text-sm text-fg-2">
        Un instrument transpositeur ne joue pas la note qu'il lit. Pour faire entendre{" "}
        <span className="font-mono text-fg">{notes.join(" ")}</span>, voici ce que chacun doit lire.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="w-56">
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-fg-2">
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
    <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
      {view.groups.map((group) => (
        <Panel key={group.key} title={GROUP_LABEL[group.key] ?? group.key}>
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
        <Panel>
          <h1 className="text-2xl font-semibold">Page introuvable</h1>
          <p className="mt-2 text-fg-2">
            Cette adresse ne correspond à aucun élément musical connu du moteur.{" "}
            <Link to={pathOf("note:C")} className="text-[var(--accent)] underline underline-offset-4">
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
    <div className="flex flex-col gap-4">
      <SearchBox />
      <Hero view={view} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel title="Graphe musical">
          <MusicGraph view={view} />
        </Panel>
        <Panel title="Tonalités liées">
          <CircleOfFifths current={keys.current} related={keys.related} />
        </Panel>
      </div>

      <Panel title="Piano">
        <Piano tones={view.tones} played={played} />
      </Panel>

      {instrument && (
        <Panel
          title={instrument.name}
          aside={
            <div className="flex gap-1" role="group" aria-label="Instrument">
              {stringed.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={candidate.id === instrument.id}
                  onClick={() => setInstrument(candidate.id)}
                  className={`rounded-lg px-3 py-1 text-xs transition-colors duration-150 ${
                    candidate.id === instrument.id
                      ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
                      : "text-fg-2 hover:bg-white/5 hover:text-fg"
                  }`}
                >
                  {candidate.name}
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
