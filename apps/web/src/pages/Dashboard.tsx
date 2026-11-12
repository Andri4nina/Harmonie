import { CircleOfFifths } from "../components/CircleOfFifths";
import { SearchBox } from "../components/SearchBox";
import { NodeChip, Panel } from "../components/ui";
import { useSettings } from "../state/store";
import { nodeView } from "../theory/engine";

const STARTING_POINTS = [
  "note:C",
  "chord:Cmaj7",
  "key:A:minor",
  "scale:D:dorian",
  "chord:G7",
  "scale:A:blues",
  "progression:two-five-one:C:major",
  "progression:andalusian:A:minor",
];

const MODULES: { name: string; state: string; done: boolean }[] = [
  { name: "Moteur de théorie", state: "v1.1", done: true },
  { name: "Theory Explorer", state: "v1.2 · en cours", done: true },
  { name: "Song Analyzer", state: "v1.3", done: false },
  { name: "Ear Training", state: "v1.4", done: false },
  { name: "Learning · Music Generator", state: "v1.5", done: false },
  { name: "Desktop · Mobile", state: "v1.6 – v1.7", done: false },
];

function Chips({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => {
        const view = nodeView(id);
        return view ? <NodeChip key={id} id={id} pitchClass={view.pitchClass} /> : null;
      })}
    </div>
  );
}

export function Dashboard() {
  const history = useSettings((state) => state.history);
  return (
    <div className="flex flex-col gap-4">
      <section className="glass enter p-8">
        <div className="eyebrow !text-[var(--accent)]">Harmonia</div>
        <h1 className="mt-2 max-w-2xl text-5xl leading-[1.05] font-semibold tracking-tight">
          Voyez ce qui relie les notes.
        </h1>
        <p className="mt-4 max-w-xl text-fg-2">
          Chaque note, gamme, accord et tonalité est un point d'une même carte. Cherchez-en un, écoutez-le, puis suivez
          ses relations.
        </p>
        <div className="mt-6">
          <SearchBox autoFocus />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel title="Entrer par une tonalité">
          <CircleOfFifths />
        </Panel>
        <div className="flex flex-col gap-4">
          <Panel title="Points de départ">
            <Chips ids={STARTING_POINTS} />
          </Panel>
          {history.length > 0 && (
            <Panel title="Vus récemment">
              <Chips ids={history} />
            </Panel>
          )}
          <Panel title="État du projet">
            <ul className="flex flex-col gap-2 text-sm">
              {MODULES.map((module) => (
                <li key={module.name} className="flex items-center gap-3">
                  <span
                    className={`size-2 rounded-full ${module.done ? "bg-[var(--accent)]" : "border border-dashed border-fg-3"}`}
                  />
                  <span className={module.done ? "" : "text-fg-3"}>{module.name}</span>
                  <span className="ml-auto font-mono text-xs text-fg-3">{module.state}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
