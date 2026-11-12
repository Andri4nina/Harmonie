import { NavLink } from "react-router";
import { Icon } from "./ui";

interface Entry {
  label: string;
  icon: string;
  /** Route si la section existe ; sinon version où elle arrive. */
  to?: string;
  arrives?: string;
}

const ENTRIES: Entry[] = [
  { label: "Dashboard", icon: "dashboard", to: "/" },
  { label: "Theory Explorer", icon: "explorer", to: "/explorer" },
  { label: "Song Analyzer", icon: "analyzer", arrives: "v1.3" },
  { label: "Ear Training", icon: "ear", arrives: "v1.4" },
  { label: "Learning", icon: "learning", arrives: "v1.5" },
  { label: "Music Generator", icon: "generator", arrives: "v1.5" },
  { label: "My Library", icon: "library", arrives: "v1.3" },
  { label: "Télécharger", icon: "download", to: "/telecharger" },
  { label: "Settings", icon: "settings", to: "/settings" },
];

export function Sidebar() {
  return (
    <aside className="glass sticky top-4 flex h-[calc(100vh-2rem)] w-60 shrink-0 flex-col p-4 max-lg:w-16 max-lg:p-2">
      <NavLink
        to="/"
        className="mb-6 flex items-center gap-3 rounded-xl px-2 pt-1 max-lg:justify-center max-lg:px-0"
        aria-label="Harmonie, accueil"
      >
        <img src="/favicon.svg" alt="" className="size-9 rounded-xl shadow-[0_0_24px_-6px_var(--accent)]" />
        <div className="max-lg:hidden">
          <div className="text-gradient text-lg leading-none font-semibold tracking-tight">Harmonie</div>
          <div className="eyebrow mt-1 !text-[9px]">la topographie du son</div>
        </div>
      </NavLink>

      <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-1">
        {ENTRIES.map((entry) =>
          entry.to ? (
            <NavLink
              key={entry.label}
              to={entry.to}
              end={entry.to === "/"}
              title={entry.label}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 max-lg:justify-center max-lg:px-0 ${
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--accent-strong)] shadow-[inset_0_0_0_1px_var(--accent-line)] before:absolute before:top-2 before:bottom-2 before:-left-4 before:w-1 before:rounded-full before:bg-[var(--accent)] before:shadow-[0_0_12px_var(--accent)] max-lg:before:-left-2"
                    : "text-fg-2 hover:translate-x-0.5 hover:bg-white/5 hover:text-fg"
                }`
              }
            >
              <Icon name={entry.icon} />
              <span className="max-lg:hidden">{entry.label}</span>
            </NavLink>
          ) : (
            <div
              key={entry.label}
              aria-disabled="true"
              title={`${entry.label} — prévu pour la ${entry.arrives}`}
              className="flex cursor-default items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fg-3 max-lg:justify-center max-lg:px-0"
            >
              <Icon name={entry.icon} />
              <span className="max-lg:hidden">{entry.label}</span>
              <span className="ml-auto rounded-md border border-dashed border-line px-1.5 py-0.5 font-mono text-[10px] max-lg:hidden">
                {entry.arrives}
              </span>
            </div>
          ),
        )}
      </nav>

      <div className="border-t border-line px-2 pt-3 max-lg:hidden">
        <div className="text-xs text-fg-2">Andrianina Rasoamanana</div>
        <div className="eyebrow mt-1 !text-[10px]">Harmonie · v1.2</div>
      </div>
    </aside>
  );
}
