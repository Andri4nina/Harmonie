import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { type Analysis, type TimelineEvent, correctEvent, formatDuration, getAnalysis, getAudio } from "../app/api";
import { AnalysisProgress } from "../components/AnalysisProgress";
import { Loader } from "../components/Loader";
import { CERTAINTY, Timeline, chordPitchClass, keyLabel } from "../components/Timeline";
import { Icon, Panel, hueStyle } from "../components/ui";
import { SignedIn } from "./Analyzer";

function clock(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Une mesure globale et sa certitude, en clair. */
function Fact({ label, value, event }: { label: string; value: string; event?: TimelineEvent }) {
  return (
    <div className="min-w-0">
      <dt className="caption">{label}</dt>
      <dd className="font-display mt-1 text-xl font-medium">{value}</dd>
      {event && (
        <dd className="caption mt-0.5">
          {CERTAINTY[event.certainty] ?? event.certainty}
          {event.confidence !== null ? `, confiance ${Math.round(event.confidence * 100)} %` : ""}
        </dd>
      )}
    </div>
  );
}

function Correction({ trackId, event, onSaved }: { trackId: string; event: TimelineEvent; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = String(event.payload.chord ?? "");
  const alternatives = (event.payload.alternatives as { chord: string; fit: number }[] | undefined) ?? [];

  const save = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await correctEvent(trackId, body);
      setText("");
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  // Le degré de l'ancien accord ne vaut plus pour le nouveau : il n'est pas repris.
  const replace = (chord: string) => save({ action: "replace", event_id: event.id, payload: { chord } });
  const submit = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    const chord = text.trim();
    if (chordPitchClass(chord) === null) {
      setError(`« ${chord} » n'est pas un accord reconnu. Exemples : Am7, F#m, Bb/D.`);
      return;
    }
    void replace(chord);
  };

  const editable = event.id.startsWith("e");
  return (
    <Panel title={`Accord de ${clock(event.start_ms)} à ${clock(event.end_ms)}`}>
      <p className="text-ivory-2">
        Lu comme <span className="font-display text-ivory">{name}</span>
        {typeof event.payload.roman === "string" ? ` (${event.payload.roman})` : ""}, {CERTAINTY[event.certainty] ?? event.certainty}
        {event.confidence !== null ? `, confiance ${Math.round(event.confidence * 100)} %` : ""}.
      </p>
      {!editable ? (
        <p className="caption mt-3">Accord ajouté à la main : il ne se corrige pas ici.</p>
      ) : (
        <>
          {alternatives.length > 0 && (
            <div className="mt-4">
              <p className="caption mb-2">Autres lectures possibles</p>
              <div className="flex flex-wrap gap-2">
                {alternatives.map((alternative) => (
                  <button
                    key={alternative.chord}
                    type="button"
                    disabled={busy}
                    onClick={() => void replace(alternative.chord)}
                    className="btn btn-ghost min-h-10 px-3.5"
                  >
                    <span className="font-display font-medium">{alternative.chord}</span>
                    <span className="caption">{Math.round(alternative.fit * 100)} %</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
              <span className="caption">Accord juste</span>
              <input
                value={text}
                onChange={(change) => setText(change.target.value)}
                placeholder="Am7"
                autoComplete="off"
                spellCheck={false}
                className="font-display min-h-11 rounded-xl border border-line bg-[var(--glass-bg)] px-3 outline-none focus:border-[var(--accent-line)]"
              />
            </label>
            <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary">
              Corriger
            </button>
            <button type="button" disabled={busy} onClick={() => void save({ action: "delete", event_id: event.id })} className="btn text-ivory-2 hover:bg-[var(--hover)]">
              Retirer cet accord
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
    </Panel>
  );
}

function Player({ data, onReload }: { data: Analysis; onReload: () => void }) {
  const analysis = data.analysis;
  const audio = useRef<HTMLAudioElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [selected, setSelected] = useState<TimelineEvent | null>(null);

  useEffect(() => {
    let url: string | null = null;
    getAudio(data.track.id)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSource(url);
      })
      .catch((error: unknown) => setAudioError((error as Error).message));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [data.track.id]);

  // Position lue à chaque image pendant la lecture.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audio.current) setPosition(audio.current.currentTime * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const events = analysis?.events ?? [];
  const find = (feature: string) => events.find((event) => event.feature === feature);
  const current = events.find((event) => event.feature === "chord" && position >= event.start_ms && position < event.end_ms);
  const currentName = current ? String(current.payload.chord) : null;
  const currentClass = currentName ? chordPitchClass(currentName) : null;
  const key = find("key");
  const tempo = find("tempo");
  const meter = find("meter");
  const duration = analysis?.summary?.duration_ms ?? data.track.duration_ms ?? 0;

  const seek = (ms: number) => {
    if (audio.current) audio.current.currentTime = ms / 1000;
    setPosition(ms);
  };
  const toggle = () => {
    const element = audio.current;
    if (!element) return;
    if (element.paused) void element.play();
    else element.pause();
  };

  if (!analysis) return null;
  return (
    <div className="flex flex-col gap-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-5 md:grid-cols-4">
        <Fact label="Tonalité" value={key ? keyLabel(String(key.payload.key)) : "non trouvée"} event={key} />
        <Fact
          label="Tempo"
          value={tempo ? `${Math.round(Number(tempo.payload.bpm))} BPM` : "non trouvé"}
          event={tempo}
        />
        <Fact label="Mesure" value={meter ? `${String(meter.payload.beats_per_bar)} temps` : "non trouvée"} event={meter} />
        <Fact
          label="Diapason"
          value={analysis.summary ? `La ${analysis.summary.tuning.a4_hz.toFixed(1).replace(".", ",")} Hz` : "inconnu"}
        />
      </dl>

      <section className="glass p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <button type="button" onClick={toggle} disabled={!source} className="btn btn-primary size-14 !p-0" aria-label={playing ? "Mettre en pause" : "Écouter"}>
            <Icon name={playing ? "stop" : "play"} className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="caption">{playing || position > 0 ? "En ce moment" : "Lancez la lecture pour suivre les accords"}</p>
            <p
              data-hue
              style={currentClass === null ? undefined : hueStyle(currentClass)}
              className={`font-display text-[clamp(2.4rem,9vw,5rem)] leading-none font-semibold tracking-[-0.02em] ${currentName ? "text-[var(--note)]" : "text-ivory-3"}`}
            >
              {currentName ?? "—"}
            </p>
          </div>
          <p className="caption tabular-nums">
            {clock(position)} / {clock(duration)}
          </p>
        </div>
        {!source && !audioError && <Loader label="Chargement du fichier audio" size={48} />}
        {audioError && <p className="mt-3 text-danger">{audioError}</p>}
        {source && (
          <audio
            ref={audio}
            src={source}
            preload="auto"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onSeeked={() => audio.current && setPosition(audio.current.currentTime * 1000)}
          />
        )}
        <div className="mt-6">
          <Timeline
            events={events}
            durationMs={duration}
            beatsMs={analysis.summary?.beats_ms ?? []}
            downbeatsMs={analysis.summary?.downbeats_ms ?? []}
            positionMs={position}
            playing={playing}
            selected={selected?.id ?? null}
            onSelect={(event) => {
              setSelected(event);
              seek(event.start_ms);
            }}
          />
        </div>
      </section>

      {selected && (
        <Correction
          trackId={data.track.id}
          event={selected}
          onSaved={() => {
            setSelected(null);
            onReload();
          }}
        />
      )}
    </div>
  );
}

function Content({ id }: { id: string }) {
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getAnalysis(id));
      setError(null);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const status = data?.track.status;
  useEffect(() => {
    if (status !== "queued" && status !== "running") return;
    const timer = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(timer);
  }, [status, load]);

  const title = useMemo(() => data?.track.title ?? "", [data]);
  if (error) return <p className="text-danger">{error}</p>;
  if (!data) return <Loader label="Chargement de l'analyse" />;

  return (
    <div className="flex flex-col gap-6">
      <section className="pt-4 sm:pt-8">
        <Link to="/bibliotheque" className="caption hover:text-ivory">
          Ma bibliothèque
        </Link>
        <h1 className="font-display engrave mt-2 text-[clamp(1.9rem,5vw,3.4rem)] leading-[1.06] font-semibold tracking-[-0.015em] break-words">
          {title}
        </h1>
        <p className="caption mt-2">{formatDuration(data.track.duration_ms)}</p>
      </section>

      {(status === "queued" || status === "running") && (
        <Panel>
          <AnalysisProgress status={status} stage={data.track.stage} progress={data.track.progress} />
          <p className="caption mt-4">
            {status === "queued"
              ? "L'analyse démarre dès qu'un analyseur est libre. Vous pouvez quitter cette page : le résultat vous attendra dans votre bibliothèque."
              : "Quelques dizaines de secondes à quelques minutes selon la durée du morceau. Cette page se met à jour toute seule."}
          </p>
        </Panel>
      )}
      {status === "failed" && (
        <Panel title="Analyse impossible">
          <p className="text-ivory-2">
            Harmonie n'a pas réussi à analyser ce fichier. Vérifiez qu'il se lit dans un lecteur audio, puis
            déposez-le de nouveau.
          </p>
        </Panel>
      )}
      {data.analysis && <Player data={data} onReload={() => void load()} />}
    </div>
  );
}

export function TrackPage() {
  const { id = "" } = useParams();
  return (
    <SignedIn>
      <Content id={id} />
    </SignedIn>
  );
}
