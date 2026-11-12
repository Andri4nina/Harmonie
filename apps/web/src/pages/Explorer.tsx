import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";
import { play, stop } from "../audio/synth";
import { CircleOfFifths } from "../components/CircleOfFifths";
import { Fretboard } from "../components/Fretboard";
import { MusicGraph } from "../components/MusicGraph";
import { Piano } from "../components/Piano";
import { SearchBox } from "../components/SearchBox";
import { Icon, NodeChip, Panel, hueStyle } from "../components/ui";
import { usePlayer, useSettings } from "../state/store";
import { type NodeView, instruments, nodeView } from "../theory/engine";
import { FACT_LABEL, GROUP_LABEL, KIND_LABEL, detailLabel, factValue, labelOf } from "../theory/labels";

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
      </div>

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
              <span className={`mt-1 font-mono text-[10px] ${sounding ? "text-ink/70" : "text-fg-3"}`}>{tone.role}</span>
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
  const nodeId = useParams()["*"] ?? "";
  const view = useMemo(() => nodeView(nodeId), [nodeId]);
  const visit = useSettings((state) => state.visit);
  const instrumentId = useSettings((state) => state.instrumentId);
  const setInstrument = useSettings((state) => state.setInstrument);

  useEffect(() => {
    stop();
    if (view) visit(view.id);
  }, [view, visit]);

  if (!view) {
    return (
      <div className="flex flex-col gap-4">
        <SearchBox autoFocus />
        <Panel title="Introuvable">
          <p className="text-fg-2">
            « {nodeId} » ne correspond à aucun élément musical connu du moteur.{" "}
            <Link to="/explorer" className="text-[var(--accent)] underline underline-offset-4">
              Revenir à Do
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
                      : "text-fg-3 hover:bg-white/5 hover:text-fg"
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

      <Relations view={view} />
    </div>
  );
}
