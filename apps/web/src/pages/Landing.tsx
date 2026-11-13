import { type CSSProperties, type RefObject, useEffect, useRef, useState } from "react";
import { play, playNote } from "../audio/synth";
import { Link } from "react-router";
import { FIFTH_PATH, Logo } from "../components/Logo";
import { ThemeSwitch } from "../components/ThemeSwitch";
import { Icon } from "../components/ui";
import { circleOfFifths, nodeView } from "../theory/engine";
import "./landing.css";

/**
 * Chaque scène (`data-scene`) est plus haute que l'écran ; son contenu reste
 * collé pendant qu'on la traverse. Le défilement y est traduit en `--p`, de
 * 0 à l'entrée à 1 à la sortie, que le CSS transforme en zoom, en
 * translation ou en fermeture. Une seule écoute, sans rendu React.
 */
function useScenes(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const scenes = [...element.querySelectorAll<HTMLElement>("[data-scene]")];
    let frame = 0;
    const update = () => {
      frame = 0;
      const height = window.innerHeight;
      for (const scene of scenes) {
        const rect = scene.getBoundingClientRect();
        const span = Math.max(1, rect.height - height);
        const p = Math.min(1, Math.max(0, -rect.top / span));
        scene.style.setProperty("--p", p.toFixed(4));
        scene.dataset.done = String(p > 0.72);
      }
      element.style.setProperty("--scroll", String(window.scrollY));
    };
    const request = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
    };
  }, [root]);
}

const TITLE = "Harmonie";
const SCALE = [60, 62, 64, 65, 67, 69, 71, 72];

/** Joue l'accord d'un symbole (« Cmaj7 », « G ») s'il est connu du moteur. */
function playChord(symbol: string): void {
  const view = nodeView(`chord:${symbol}`);
  if (view) play(view.playback.steps, view.playback.mode, `landing:${symbol}`);
}

function Hero() {
  return (
    <section data-scene className="scene scene-hero" aria-label="Présentation">
      <div className="stage">
        {/* Le nœud de la quinte (3:2) : on plonge à travers en défilant. */}
        <svg viewBox="0 0 64 64" className="hero-knot" aria-hidden="true">
          <path d={FIFTH_PATH} pathLength={1} className="knot-line" />
          <path d={FIFTH_PATH} pathLength={1} className="knot-echo" />
          <circle r={1.6} className="knot-head">
            <animateMotion dur="5.4s" repeatCount="indefinite" path={FIFTH_PATH} />
          </circle>
        </svg>
        <div className="hero-copy">
          <h1 className="hero-title font-display" aria-label={TITLE}>
            {[...TITLE].map((letter, index) => (
              <span
                key={index}
                aria-hidden="true"
                style={{ "--i": index } as CSSProperties}
                // Chaque lettre est une note de la gamme de do : un appui la joue.
                onPointerDown={() => playNote(SCALE[index] ?? 60)}
              >
                {letter}
              </span>
            ))}
          </h1>
          <p className="hero-lede">
            La théorie musicale qu'on entend. Notes, accords et tonalités : on les joue, on les voit au clavier et sur le
            manche, et on comprend pourquoi ils vont ensemble.
          </p>
          <div className="hero-actions">
            <Link to="/tableau-de-bord" viewTransition className="btn btn-primary">
              Ouvrir Harmonie
            </Link>
            <Link to="/telecharger" className="btn btn-ghost">
              <Icon name="download" className="size-4" />
              Télécharger l'application
            </Link>
          </div>
        </div>
        <p className="scroll-cue" aria-hidden="true">
          <span />
          Défiler
        </p>
      </div>
    </section>
  );
}

/** Une seule note, puis le cercle entier : on recule pour voir les liens. */
function Circle() {
  const sectors = circleOfFifths();
  return (
    <section data-scene className="scene scene-circle" aria-labelledby="cercle-titre">
      <div className="stage">
        <svg viewBox="0 0 400 400" className="circle-art" aria-hidden="true">
          <g className="circle-ticks">
            {Array.from({ length: 60 }, (_, i) => (
              <line key={i} x1={200} y1={8} x2={200} y2={i % 5 === 0 ? 20 : 14} transform={`rotate(${i * 6} 200 200)`} />
            ))}
          </g>
          <circle cx={200} cy={200} r={150} className="circle-ring" />
          <circle cx={200} cy={200} r={96} className="circle-ring" />
          {sectors.map((sector, index) => {
            const angle = (index * 30 - 90) * (Math.PI / 180);
            const [x, y] = [200 + Math.cos(angle) * 150, 200 + Math.sin(angle) * 150];
            const [mx, my] = [200 + Math.cos(angle) * 96, 200 + Math.sin(angle) * 96];
            return (
              <g
                key={sector.major}
                className={`circle-hit ${index === 0 ? "circle-home" : "circle-key"}`}
                style={{ "--i": index, transformOrigin: `${x}px ${y}px` } as CSSProperties}
                onPointerDown={(event) => {
                  playChord(sector.major);
                  const group = event.currentTarget;
                  group.classList.remove("circle-played");
                  void group.getBoundingClientRect();
                  group.classList.add("circle-played");
                }}
              >
                <circle cx={x} cy={y} r={index === 0 ? 24 : 19} />
                <text x={x} y={y} dy="0.35em" textAnchor="middle" className="font-display">
                  {sector.major}
                </text>
                <text x={mx} y={my} dy="0.35em" textAnchor="middle" className="circle-minor">
                  {sector.minor}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="circle-copy">
          <h2 id="cercle-titre" className="font-display">Une note ne vit jamais seule.</h2>
          <p>
            Douze notes, vingt-quatre tonalités. Le cercle des quintes range chacune à côté de celles qui lui
            ressemblent ; l'explorateur suit ces liens d'une page à l'autre, de Do jusqu'aux accords les plus lointains.
          </p>
          <Link to="/explorer" viewTransition className="landing-link">
            Explorer le cercle
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Petits dessins animés propres à chaque partie de l'application. */
function Visual({ kind }: { kind: string }) {
  if (kind === "explorer") {
    const nodes = [[60, 60], [150, 40], [230, 90], [110, 130], [200, 160], [40, 150], [270, 40]];
    return (
      <svg viewBox="0 0 300 200" className="feature-art" aria-hidden="true">
        {[[0, 1], [1, 2], [0, 3], [3, 4], [2, 4], [3, 5], [1, 6], [2, 6]].map(([a, b], i) => (
          <line key={i} x1={nodes[a!]![0]} y1={nodes[a!]![1]} x2={nodes[b!]![0]} y2={nodes[b!]![1]} className="art-edge" />
        ))}
        {nodes.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === 3 ? 13 : 8} className="art-node" style={{ "--i": i } as CSSProperties} />
        ))}
      </svg>
    );
  }
  if (kind === "analyzer") {
    return (
      <svg viewBox="0 0 300 200" className="feature-art" aria-hidden="true">
        {Array.from({ length: 28 }, (_, i) => (
          <rect key={i} x={8 + i * 10.4} y={30} width={6} height={150} rx={3} className="art-bar" style={{ "--i": i } as CSSProperties} />
        ))}
      </svg>
    );
  }
  if (kind === "ear") {
    return (
      <svg viewBox="0 0 300 200" className="feature-art" aria-hidden="true">
        {[0, 1, 2].map((ring) => (
          <circle key={ring} cx={150} cy={100} r={30} className="art-ring" style={{ "--i": ring } as CSSProperties} />
        ))}
        <circle cx={150} cy={100} r={10} className="art-core" />
      </svg>
    );
  }
  if (kind === "composer") {
    const blocks = [[0, 3, 2], [2, 5, 1], [3, 1, 3], [6, 4, 2], [8, 2, 1], [9, 6, 3], [12, 3, 2], [14, 0, 1], [15, 5, 2], [17, 2, 3]];
    return (
      <svg viewBox="0 0 300 200" className="feature-art" aria-hidden="true">
        <g className="art-roll">
          {[...blocks, ...blocks.map(([x, y, w]) => [x! + 20, y!, w!])].map(([x, y, w], i) => (
            <rect key={i} x={x! * 15} y={30 + y! * 20} width={w! * 15 - 3} height={14} rx={3} className="art-block" />
          ))}
        </g>
        <line x1={150} y1={20} x2={150} y2={180} className="art-head" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 300 200" className="feature-art" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((line) => (
        <line key={line} x1={10} x2={290} y1={60 + line * 18} y2={60 + line * 18} className="art-edge" />
      ))}
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <ellipse key={i} cx={40 + i * 36} cy={132 - i * 9} rx={10} ry={7} transform={`rotate(-20 ${40 + i * 36} ${132 - i * 9})`} className="art-note" style={{ "--i": i } as CSSProperties} />
      ))}
    </svg>
  );
}

const FEATURES = [
  {
    kind: "explorer",
    title: "Explorer la théorie",
    text: "Chaque note, gamme, accord et tonalité a sa page : on l'écoute, on la voit au piano et sur le manche, puis on suit ses liens vers le reste.",
    to: "/explorer",
  },
  {
    kind: "analyzer",
    title: "Analyser un morceau",
    text: "Déposez un enregistrement : Harmonie estime la tonalité, le tempo et les accords, et dit à quel point elle en est sûre.",
    to: "/analyser",
  },
  {
    kind: "ear",
    title: "Entraîner l'oreille",
    text: "Intervalles, accords, gammes, rythmes et dictées sur vingt-cinq niveaux. Ce qui résiste revient plus souvent.",
    to: "/oreille",
  },
  {
    kind: "composer",
    title: "Composer",
    text: "Une grille, une mélodie, une basse, une batterie. Retouchez au rouleau de piano, jouez au clavier d'ordinateur, exportez en MIDI.",
    to: "/composer",
  },
  {
    kind: "lessons",
    title: "Apprendre",
    text: "Des cours courts à écouter et à vérifier à l'oreille, des notes jusqu'aux cadences.",
    to: "/cours",
  },
];

/** La portée défile de gauche à droite pendant qu'on descend. */
function Staff() {
  return (
    <section data-scene className="scene scene-staff" aria-label="Ce que fait Harmonie">
      <div className="stage">
        <div className="staff-lines" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((line) => (
            <span key={line} />
          ))}
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ "--i": i } as CSSProperties} />
          ))}
        </div>
        <ul className="staff-track">
          {FEATURES.map((feature) => (
            <li key={feature.kind} className="feature tilt">
              <Visual kind={feature.kind} />
              <h2 className="font-display">{feature.title}</h2>
              <p>{feature.text}</p>
              <Link to={feature.to} viewTransition className="landing-link">
                Ouvrir
              </Link>
              <span className="tilt-glow" aria-hidden="true" />
            </li>
          ))}
        </ul>
        <div className="staff-progress" aria-hidden="true">
          <span />
        </div>
      </div>
    </section>
  );
}

const CHORDS_A = ["Cmaj7", "Am7", "Dm7", "G7", "Fmaj7", "Bm7b5", "E7", "Am", "D9", "Gsus4", "C6", "F#m7b5"];
const CHORDS_B = ["ii – V – I", "Cadence andalouse", "Blues 12 mesures", "vi – IV – I – V", "Cycle des quintes", "Canon", "Trois accords"];

function Marquee() {
  return (
    <section className="marquee" aria-label="Accords et progressions">
      <div className="marquee-row">
        {[0, 1].map((copy) => (
          <span key={copy} aria-hidden={copy === 1}>
            {CHORDS_A.map((chord) => (
              <b key={chord} className="font-display marquee-chord" onPointerDown={() => playChord(chord)}>
                {chord}
              </b>
            ))}
          </span>
        ))}
      </div>
      <div className="marquee-row marquee-reverse">
        {[0, 1].map((copy) => (
          <span key={copy} aria-hidden={copy === 1}>
            {CHORDS_B.map((name) => (
              <b key={name}>{name}</b>
            ))}
          </span>
        ))}
      </div>
    </section>
  );
}

/** Un arpège court sur un clavier, que les portes viennent recouvrir. */
function Gates() {
  const whites = 22;
  return (
    <section data-scene className="scene scene-gates" aria-labelledby="portes-titre">
      <div className="stage">
        <div className="gates-keys" aria-hidden="true">
          {Array.from({ length: whites }, (_, i) => (
            <span key={i} className="key-white" style={{ "--i": i } as CSSProperties} />
          ))}
          {Array.from({ length: whites - 1 }, (_, i) =>
            [0, 1, 3, 4, 5].includes(i % 7) ? <span key={`b${i}`} className="key-black" style={{ "--x": i + 1 } as CSSProperties} /> : null,
          )}
        </div>
        <div className="gate gate-left" aria-hidden="true">
          <span className="font-display">Libre</span>
        </div>
        <div className="gate gate-right" aria-hidden="true">
          <span className="font-display">Gratuit</span>
        </div>
        <div className="gates-cta">
          <Logo className="size-16" moving />
          <h2 id="portes-titre" className="font-display">Harmonie est à vous.</h2>
          <p>
            Sur le web, sur Windows, macOS, Linux et Android. Code ouvert sous licence AGPL-3.0, sans compte pour
            explorer, apprendre et composer.
          </p>
          <div className="hero-actions">
            <Link to="/tableau-de-bord" viewTransition className="btn btn-primary">
              Ouvrir Harmonie
            </Link>
            <Link to="/telecharger" className="btn btn-ghost">
              Télécharger
            </Link>
          </div>
          <a href="https://github.com/Andri4nina/Harmonie" rel="noopener" className="landing-link">
            Lire le code source
          </a>
        </div>
      </div>
    </section>
  );
}

/** Croches qui flottent devant tout, à des vitesses différentes. */
function Drift() {
  return (
    <div className="drift" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => (
        <svg key={i} viewBox="0 0 24 36" style={{ "--i": i } as CSSProperties}>
          <ellipse cx={8} cy={28} rx={7} ry={5} transform="rotate(-20 8 28)" />
          <path d="M14.5 27V3c3 3 7 4 7 10" fill="none" strokeWidth={2} />
        </svg>
      ))}
    </div>
  );
}

const PREVIEWS = [
  {
    id: "explorer",
    tab: "Explorer",
    address: "accords/do-majeur-7",
    text: "Cmaj7 : ses notes, son graphe de relations et ses tonalités, à écouter.",
  },
  {
    id: "composer",
    tab: "Composer",
    address: "composer",
    text: "Le rouleau de piano, les pistes, la lecture en boucle et l'export MIDI.",
  },
  {
    id: "oreille",
    tab: "Oreille",
    address: "oreille",
    text: "Six exercices, vingt-cinq niveaux, et ce qui résiste revient plus souvent.",
  },
  {
    id: "cours",
    tab: "Cours",
    address: "cours/les-intervalles",
    text: "Des cours courts : on lit, on écoute, on vérifie à l'oreille.",
  },
];

/**
 * Aperçus de l'application : de vraies captures dans une fenêtre qui se
 * redresse au défilement, s'incline sous le pointeur et change au clic (ou
 * seule, toutes les six secondes, sauf au survol).
 */
function Previews() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(() => setActive((current) => (current + 1) % PREVIEWS.length), 6000);
    return () => window.clearTimeout(timer);
  }, [active, paused]);
  const current = PREVIEWS[active]!;
  return (
    <section data-scene className="scene scene-previews" aria-labelledby="apercus-titre">
      <div className="stage previews-stage">
        <div className="previews-head">
          <h2 id="apercus-titre" className="font-display">Voir avant d'ouvrir.</h2>
          <div role="tablist" aria-label="Aperçus" className="preview-tabs">
            {PREVIEWS.map((preview, index) => (
              <button
                key={preview.id}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-controls="apercu"
                onClick={() => setActive(index)}
                className="preview-tab"
              >
                {preview.tab}
                {index === active && <span className={`preview-timer ${paused ? "is-paused" : ""}`} key={active} />}
              </button>
            ))}
          </div>
        </div>
        <div className="preview-frame tilt" onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}>
          <div className="preview-chrome" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>harmonie / {current.address}</span>
          </div>
          <div id="apercu" role="tabpanel" aria-label={current.tab} className="preview-screens">
            {PREVIEWS.map((preview, index) => (
              <img
                key={preview.id}
                src={`/apercus/${preview.id}.jpg`}
                alt={index === active ? `Capture de la page ${preview.tab} d'Harmonie` : ""}
                loading="lazy"
                decoding="async"
                width={1440}
                height={900}
                className={index === active ? "is-active" : index < active ? "is-before" : ""}
              />
            ))}
          </div>
          <span className="tilt-glow" aria-hidden="true" />
        </div>
        <p className="preview-caption" aria-live="polite">
          {current.text}
        </p>
      </div>
    </section>
  );
}

/**
 * Réponses au pointeur sur toute la page : les éléments `.tilt` s'inclinent
 * vers lui et s'éclairent là où il passe ; un appui sur un bouton ou un lien
 * laisse une onde.
 */
function useInteractions(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let last: HTMLElement | null = null;
    const reset = (target: HTMLElement | null) => {
      target?.style.setProperty("--rx", "0deg");
      target?.style.setProperty("--ry", "0deg");
    };
    const move = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".tilt");
      if (target !== last) reset(last);
      last = target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      target.style.setProperty("--rx", `${(0.5 - y) * 8}deg`);
      target.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
      target.style.setProperty("--mx", `${x * 100}%`);
      target.style.setProperty("--my", `${y * 100}%`);
    };
    const out = () => {
      reset(last);
      last = null;
    };
    const ripple = (event: PointerEvent) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(".btn, .preview-tab, .landing-link");
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const wave = document.createElement("span");
      wave.className = "ripple";
      wave.style.left = `${event.clientX - rect.left}px`;
      wave.style.top = `${event.clientY - rect.top}px`;
      target.appendChild(wave);
      wave.addEventListener("animationend", () => wave.remove());
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", out);
    element.addEventListener("pointerdown", ripple);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", out);
      element.removeEventListener("pointerdown", ripple);
    };
  }, [root]);
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useScenes(root);
  useInteractions(root);
  return (
    <div ref={root} className="landing">
      <header className="landing-bar">
        <Link to="/" className="flex items-center gap-2.5" aria-label="Harmonie">
          <Logo className="size-9" moving />
          <span className="font-display text-[1.05rem] font-semibold">Harmonie</span>
        </Link>
        <nav aria-label="Pages" className="landing-nav">
          <Link to="/explorer">Explorer</Link>
          <Link to="/cours">Cours</Link>
          <Link to="/composer">Composer</Link>
        </nav>
        <div className="flex items-center gap-2">
          <span className="hidden sm:block">
            <ThemeSwitch compact />
          </span>
          <Link to="/compte" className="hidden min-h-10 items-center rounded-full px-3 text-sm text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory sm:inline-flex">
            Se connecter
          </Link>
          <Link to="/tableau-de-bord" viewTransition className="btn btn-primary min-h-10 px-4 text-sm">
            Ouvrir
          </Link>
        </div>
      </header>
      <Drift />
      <main id="contenu">
        <Hero />
        <Circle />
        <Staff />
        <Previews />
        <Marquee />
        <Gates />
      </main>
      <footer className="landing-footer">
        <span>
          Harmonie, conçu et développé par <span className="text-ivory-2">Andrianina Rasoamanana</span>
        </span>
        <a href="https://github.com/Andri4nina/Harmonie" rel="noopener">
          Code source, licence AGPL-3.0
        </a>
      </footer>
    </div>
  );
}
