import { useCurrentTask } from "../state/loading";

/**
 * Le loader de la marque : des lignes de niveau concentriques qui ondulent,
 * comme le relief du fond. Une ligne maîtresse continue, les autres tiretées.
 */
export function Loader({ label, size = 72 }: { label?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-6">
      <svg viewBox="0 0 100 100" width={size} height={size} className="topo-loader" aria-hidden="true">
        {[14, 24, 34, 44].map((radius, index) => (
          <ellipse
            key={radius}
            cx="50"
            cy="50"
            rx={radius}
            ry={radius * 0.82}
            className={index === 1 ? "topo-loader-master" : "topo-loader-line"}
            style={{ animationDelay: `${index * -0.35}s` }}
          />
        ))}
        <circle cx="50" cy="50" r="3.2" className="topo-loader-core" />
      </svg>
      {label && <span className="eyebrow">{label}</span>}
      {!label && <span className="sr-only">Chargement</span>}
    </div>
  );
}

/** Bloc de remplacement pendant un chargement, à la taille du contenu attendu. */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
}

/** Barre fine en haut de l'écran, visible tant qu'une opération réelle est en cours. */
export function TopProgress() {
  const task = useCurrentTask();
  return (
    <div
      className={`top-progress ${task ? "is-active" : ""}`}
      role="progressbar"
      aria-hidden={!task}
      aria-label={task ?? undefined}
    >
      <div className="top-progress-bar" />
    </div>
  );
}
