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
  { name: "Moteur de théorie", state: "version 1.1", done: true },
  { name: "Explorer la théorie", state: "version 1.2", done: true },
  { name: "Analyser un morceau", state: "version 1.3", done: true },
  { name: "Entraîner l'oreille (six exercices)", state: "version 1.4", done: true },
  { name: "Composer : grilles, mélodies, MIDI, MusicXML", state: "version 1.5", done: true },
  { name: "Apprendre : cours interactifs", state: "version 1.5", done: true },
  { name: "Applications ordinateur et Android", state: "versions 1.6 et 1.7", done: false },
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
    <div className="flex flex-col gap-10 sm:gap-14">
      <section className="pt-6 sm:pt-12 lg:pt-16">
        <h1 className="font-display engrave max-w-[15ch] text-[clamp(2.1rem,6.2vw,4.4rem)] leading-[1.06] font-semibold tracking-[-0.015em] text-balance">
          Voyez ce qui relie les notes.
        </h1>
        <p className="mt-6 max-w-[58ch] text-[1.0625rem] text-ivory-2 sm:text-lg">
          Chaque note, gamme, accord et tonalité est un point d'une même carte. Cherchez-en un, écoutez-le, puis suivez
          ses relations.
        </p>
        <div className="mt-8">
          <SearchBox autoFocus />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:gap-8">
        <Panel title="Entrer par une tonalité">
          <div className="mx-auto max-w-[440px]">
            <CircleOfFifths />
          </div>
        </Panel>
        <div className="flex flex-col gap-10">
          <Panel title="Points de départ" framed={false}>
            <Chips ids={STARTING_POINTS} />
          </Panel>
          {history.length > 0 && (
            <Panel title="Vus récemment" framed={false}>
              <Chips ids={history} />
            </Panel>
          )}
          <Panel title="Où en est le projet" framed={false}>
            <ul className="flex flex-col">
              {MODULES.map((module) => (
                <li key={module.name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-line py-2.5">
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 translate-y-[-1px] rounded-full ${module.done ? "bg-brass" : "border border-ivory-3"}`}
                  />
                  <span className={module.done ? "" : "text-ivory-2"}>{module.name}</span>
                  <span className="caption ml-auto">{module.done ? `disponible, ${module.state}` : module.state}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
