import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { hueOf, shortLabelOf } from "../theory/labels";
import { pathOf } from "../theory/routes";

/** Style portant la teinte d'une classe de hauteur (à associer à data-hue). */
export function hueStyle(pitchClass: number): CSSProperties {
  return { "--h": hueOf(pitchClass) } as CSSProperties;
}

/**
 * Section de page. Le verre n'est employé que pour les instruments
 * (`framed`) ; une section de texte reste posée sur le fond.
 */
export function Panel({
  title,
  aside,
  children,
  className = "",
  framed = true,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  framed?: boolean;
}) {
  return (
    <section className={`${framed ? "glass p-4 sm:p-5" : ""} min-w-0 ${className}`}>
      {(title || aside) && (
        <header className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {title && <h2 className="section-title">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** Pastille menant à un nœud de l'explorateur, à la couleur de sa note. */
export function NodeChip({
  id,
  pitchClass,
  detail,
  active = false,
}: {
  id: string;
  pitchClass: number;
  detail?: string | null;
  active?: boolean;
}) {
  return (
    <Link
      to={pathOf(id)}
      data-hue
      style={hueStyle(pitchClass)}
      className={`group inline-flex min-h-9 items-baseline gap-2 rounded-[10px] border px-3 py-1.5 transition-colors duration-150 ${
        active
          ? "border-[var(--note)] bg-[var(--note-soft)]"
          : "border-line hover:border-[var(--note-line)] hover:bg-[var(--note-soft)]"
      }`}
    >
      <span className="size-1.5 shrink-0 self-center rounded-full bg-[var(--note)]" />
      <span className="font-display text-[0.9rem] leading-none font-medium">{shortLabelOf(id)}</span>
      {detail && <span className="text-[0.8125rem] text-ivory-3 group-hover:text-ivory-2">{detail}</span>}
    </Link>
  );
}

/**
 * Message d'état (serveur injoignable, hors connexion…) : ce qui se passe,
 * ce qu'on peut faire, et une action quand il y en a une.
 */
export function Notice({
  title,
  children,
  action,
  tone = "info",
}: {
  title: string;
  children?: ReactNode;
  action?: { label: string; onClick: () => void; busy?: boolean };
  tone?: "info" | "problem";
}) {
  return (
    <div role={tone === "problem" ? "alert" : "status"} className="rise-in flex gap-3 rounded-[14px] border border-line bg-[var(--glass-bg)] p-4">
      <span
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${tone === "problem" ? "bg-[var(--color-danger)]" : "bg-brass"}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-1 text-[0.9375rem] text-ivory-2">{children}</div>}
        {action && (
          <button type="button" onClick={action.onClick} disabled={action.busy} className="btn btn-ghost mt-3 min-h-10 px-4 text-sm">
            <Icon name="loop" className={`size-4 ${action.busy ? "animate-spin" : ""}`} />
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  dashboard: "M4 13h6V4H4zm10 7h6v-9h-6zM4 20h6v-4H4zm10-12h6V4h-6z",
  explorer: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zm3.5 5.5l-2 5l-5 2l2-5z",
  analyzer: "M4 12h2l2-6l3 12l3-9l2 5h4",
  ear: "M8 18c0 2 4 3 5 0c1-3 4-4 4-8a5 5 0 0 0-10 0m3 1a2 2 0 1 1 3-2",
  learning: "M3 8l9-4l9 4l-9 4zm4 3v5c3 2 7 2 10 0v-5",
  generator: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0zm10-2a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0z",
  library: "M5 4v16M9 4v16M13 5l5 15M4 20h16",
  settings: "M4 7h10m4 0h2M4 17h2m4 0h10M14 5v4M6 15v4",
  play: "M8 5v14l11-7z",
  stop: "M7 7h10v10H7z",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zm5 12l4 4",
  download: "M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 19h14",
  menu: "M4 7h16M4 12h16M4 17h16",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66l1.41-1.41M4.93 19.07l1.41-1.41m11.32 0l1.41 1.41M4.93 4.93l1.41 1.41M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8z",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  system: "M4 5h16v11H4zM9 20h6m-3-4v4",
  close: "M6 6l12 12M18 6L6 18",
  keyboard: "M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8",
  pencil: "M4 20l4-1l10-10l-3-3L5 16zm11-14l3 3",
  eraser: "M8 20h12M4 15l9-9l6 6l-6 6H8z",
  loop: "M17 3l3 3l-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3l3-3m13-2v2a3 3 0 0 1-3 3H4",
  record: "M12 7a5 5 0 1 0 0 10a5 5 0 0 0 0-10z",
  plus: "M12 5v14M5 12h14",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5l-5-5m5 5H10a6 6 0 0 0 0 12h3",
  trash: "M5 7h14M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  select: "M5 3l14 8l-6 2l-2 6z",
  user: "M12 4a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5",
};

export function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const filled = name === "play" || name === "stop" || name === "record";
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
