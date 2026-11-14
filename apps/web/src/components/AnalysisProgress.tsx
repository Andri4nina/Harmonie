import type { JobStatus } from "../app/api";

/** Étapes de l'analyse, dans l'ordre où le worker les parcourt. */
export const STAGES: { id: string; label: string }[] = [
  { id: "decode", label: "Lecture du fichier" },
  { id: "features", label: "Mesure du signal" },
  { id: "interpret", label: "Lecture musicale" },
];

/**
 * Où en est l'analyse d'un morceau : un indicateur qui bouge tant qu'elle
 * avance, l'étape en cours et le pourcentage. `compact` pour une liste.
 */
export function AnalysisProgress({
  status,
  stage,
  progress,
  compact = false,
}: {
  status: JobStatus | null;
  stage: string | null;
  progress: number | null;
  compact?: boolean;
}) {
  if (status === "succeeded") {
    return <span className="inline-flex items-center gap-1.5 text-[0.8125rem] text-brass">● Analysé</span>;
  }
  if (status === "failed" || status === "cancelled") {
    return <span className="text-[0.8125rem] text-[var(--color-danger)]">{status === "failed" ? "Analyse impossible" : "Analyse annulée"}</span>;
  }
  if (status !== "queued" && status !== "running") {
    return <span className="caption">Sans analyse</span>;
  }

  const current = STAGES.findIndex((step) => step.id === stage);
  const percent = status === "running" && progress !== null ? Math.round(progress * 100) : null;
  const label = status === "queued" ? "En file d'attente" : `${STAGES[current]?.label ?? "Analyse en cours"}${percent !== null ? `, ${percent} %` : ""}`;

  if (compact) {
    return (
      <span className="flex min-w-36 flex-col gap-1" role="status" aria-label={label}>
        <span className="flex items-center gap-2 text-[0.8125rem] text-ivory-2">
          <span className="analysis-pulse" aria-hidden="true" />
          {label}
        </span>
        <span className="analysis-bar" aria-hidden="true">
          <span className={percent === null ? "is-waiting" : ""} style={percent === null ? undefined : { width: `${Math.max(4, percent)}%` }} />
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="analysis-pulse is-large" aria-hidden="true" />
        <p className="font-medium">{status === "queued" ? "Votre morceau attend son tour" : "Analyse en cours"}</p>
        {percent !== null && <span className="ml-auto font-display text-xl text-brass tabular-nums">{percent} %</span>}
      </div>
      <span className="analysis-bar is-large" aria-hidden="true">
        <span className={percent === null ? "is-waiting" : ""} style={percent === null ? undefined : { width: `${Math.max(3, percent)}%` }} />
      </span>
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-[0.875rem]">
        {STAGES.map((step, index) => {
          const done = status === "running" && index < current;
          const active = status === "running" && index === current;
          return (
            <li key={step.id} className={`flex items-center gap-2 ${active ? "text-ivory" : done ? "text-brass" : "text-ivory-3"}`}>
              <span
                className={`size-2 rounded-full ${active ? "analysis-pulse-dot bg-brass" : done ? "bg-brass" : "bg-[var(--color-line)]"}`}
                aria-hidden="true"
              />
              {step.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
