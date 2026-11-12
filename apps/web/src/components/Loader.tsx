import { useCurrentTask } from "../state/loading";
import { FIFTH_PATH } from "./Logo";

/**
 * Le loader de la marque : la note du logo parcourt la figure de la quinte.
 */
export function Loader({ label, size = 72 }: { label?: string; size?: number }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-6">
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <path d={FIFTH_PATH} fill="none" strokeWidth={2.4} strokeLinejoin="round" className="stroke-brass" strokeOpacity={0.55} />
        <circle r={4.6} className="fill-ivory">
          <animateMotion dur="2.4s" repeatCount="indefinite" path={FIFTH_PATH} />
        </circle>
      </svg>
      {label && <span className="caption">{label}</span>}
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
