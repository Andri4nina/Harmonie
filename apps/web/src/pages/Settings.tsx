import { playNote } from "../audio/synth";
import { Icon, Panel } from "../components/ui";
import { A4_MAX, A4_MIN, useSettings } from "../state/store";

export function Settings() {
  const { lite, a4, setLite, setA4 } = useSettings();
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <section className="glass enter p-6">
        <div className="eyebrow !text-[var(--accent)]">Settings</div>
        <h1 className="mt-1 text-4xl font-semibold tracking-tight">Réglages</h1>
        <p className="mt-2 text-sm text-fg-2">Enregistrés sur cet appareil.</p>
      </section>

      <Panel title="Affichage">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            checked={lite}
            onChange={(event) => setLite(event.target.checked)}
            className="mt-1 size-4 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-medium">Mode léger</span>
            <span className="mt-1 block text-sm text-fg-2">
              Remplace le verre par des aplats opaques et fige le relief. À activer sur une machine modeste ou si
              l'interface saccade.
            </span>
          </span>
        </label>
      </Panel>

      <Panel title="Diapason">
        <label htmlFor="a4" className="block font-medium">
          Fréquence du La4 : <span className="font-mono text-[var(--accent)]">{a4} Hz</span>
        </label>
        <p className="mt-1 text-sm text-fg-2">
          Toutes les notes jouées sont accordées sur cette référence. 440 Hz est le standard actuel ; 415 Hz correspond
          au diapason baroque.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <input
            id="a4"
            type="range"
            min={A4_MIN}
            max={A4_MAX}
            step={1}
            value={a4}
            onChange={(event) => setA4(Number(event.target.value))}
            className="min-w-48 flex-1 accent-[var(--accent)]"
          />
          <button
            type="button"
            onClick={() => playNote(69)}
            className="flex items-center gap-2 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)] px-4 py-2 text-sm hover:border-[var(--accent)]"
          >
            <Icon name="play" className="size-3.5" />
            Écouter le La
          </button>
          <button
            type="button"
            onClick={() => setA4(440)}
            disabled={a4 === 440}
            className="rounded-xl px-3 py-2 text-sm text-fg-2 hover:bg-white/5 disabled:opacity-40"
          >
            Revenir à 440
          </button>
        </div>
      </Panel>
    </div>
  );
}
