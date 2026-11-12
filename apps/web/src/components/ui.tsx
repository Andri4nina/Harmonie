import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router";
import { explorerPath, hueOf, shortLabelOf } from "../theory/labels";

/** Style portant la teinte d'une classe de hauteur (à associer à data-hue). */
export function hueStyle(pitchClass: number): CSSProperties {
  return { "--h": hueOf(pitchClass) } as CSSProperties;
}

export function Panel({
  title,
  aside,
  children,
  className = "",
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass p-5 ${className}`}>
      {(title || aside) && (
        <header className="mb-4 flex min-h-7 items-center justify-between gap-3">
          {title && <h2 className="eyebrow">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

/** Pastille menant à un nœud de l'explorateur. */
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
      to={explorerPath(id)}
      data-hue
      style={hueStyle(pitchClass)}
      className={`group inline-flex items-baseline gap-2 rounded-xl border px-3 py-1.5 text-sm transition-colors duration-150 ${
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]"
          : "border-line bg-white/[0.03] hover:border-[var(--accent-line)] hover:bg-[var(--accent-soft)]"
      }`}
    >
      <span className="size-1.5 shrink-0 self-center rounded-full bg-[var(--accent)]" />
      <span className="font-mono font-medium">{shortLabelOf(id)}</span>
      {detail && <span className="text-xs text-fg-3 group-hover:text-fg-2">{detail}</span>}
    </Link>
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
};

export function Icon({ name, className = "size-5" }: { name: string; className?: string }) {
  const filled = name === "play" || name === "stop";
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
