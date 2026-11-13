import { playNote } from "../audio/synth";
import { SoundPicker } from "../components/KeyboardControls";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { Icon, Panel } from "../components/ui";
import { A4_MAX, A4_MIN, useSettings } from "../state/store";

export function Settings() {
  const { lite, a4, sound, setLite, setA4, setSound } = useSettings();
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave text-[clamp(2.1rem,6vw,3.5rem)] leading-none font-semibold tracking-[-0.015em]">Réglages</h1>
        <p className="mt-3 text-ivory-2">Enregistrés sur cet appareil.</p>
      </section>

      <Panel title="Thème">
        <p className="mb-4 text-ivory-2">« Système » suit le réglage clair ou sombre de votre appareil.</p>
        <ThemeSwitch />
      </Panel>

      <Panel title="Affichage">
        <label className="flex cursor-pointer items-start gap-4">
          <input
            type="checkbox"
            checked={lite}
            onChange={(event) => setLite(event.target.checked)}
            className="mt-1 size-5 accent-[var(--color-brass)]"
          />
          <span>
            <span className="block font-medium">Mode léger</span>
            <span className="mt-1 block text-ivory-2">
              Remplace le verre par des aplats opaques et fige le relief. À activer sur une machine modeste ou si
              l'interface saccade.
            </span>
          </span>
        </label>
      </Panel>

      <Panel title="Instrument">
        <p className="mb-4 text-ivory-2">
          L'instrument qui joue les notes du piano, des accords et des exercices. Choisir un instrument sous le manche
          de l'explorateur le sélectionne aussi.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SoundPicker value={sound} onChange={setSound} />
          <button type="button" onClick={() => playNote(60)} className="btn btn-ghost">
            <Icon name="play" className="size-3.5" />
            Écouter
          </button>
        </div>
      </Panel>

      <Panel title="Diapason">
        <label htmlFor="a4" className="block font-medium">
          Fréquence du La4 : <span className="text-brass">{a4} Hz</span>
        </label>
        <p className="mt-1 text-ivory-2">
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
            className="min-w-0 flex-1 basis-48 accent-[var(--color-brass)]"
          />
          <button
            type="button"
            onClick={() => playNote(69)}
            className="btn btn-ghost"
          >
            <Icon name="play" className="size-3.5" />
            Écouter le La
          </button>
          <button
            type="button"
            onClick={() => setA4(440)}
            disabled={a4 === 440}
            className="btn text-ivory-2 hover:bg-white/5"
          >
            Revenir à 440
          </button>
        </div>
      </Panel>
    </div>
  );
}
