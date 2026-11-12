import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";
import { Icon } from "./ui";

interface Entry {
  label: string;
  icon: string;
  /** Route si la section existe ; sinon version où elle arrive. */
  to?: string;
  arrives?: string;
}

const ENTRIES: Entry[] = [
  { label: "Accueil", icon: "dashboard", to: "/" },
  { label: "Explorer la théorie", icon: "explorer", to: "/explorer" },
  { label: "Analyser un morceau", icon: "analyzer", to: "/analyser" },
  { label: "Ma bibliothèque", icon: "library", to: "/bibliotheque" },
  { label: "Entraîner l'oreille", icon: "ear", to: "/oreille" },
  { label: "Télécharger", icon: "download", to: "/telecharger" },
  { label: "Réglages", icon: "settings", to: "/settings" },
  { label: "Apprendre", icon: "learning", arrives: "v1.5" },
  { label: "Composer", icon: "generator", arrives: "v1.5" },
];

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-3 rounded-xl" aria-label="Harmonie, accueil">
      <Logo className="size-10 shrink-0" />
      <span className="font-display text-[1.2rem] leading-none font-semibold">Harmonie</span>
    </NavLink>
  );
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const available = ENTRIES.filter((entry) => entry.to);
  const planned = ENTRIES.filter((entry) => !entry.to);
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-6">
      <ul className="flex flex-col gap-0.5">
        {available.map((entry) => (
          <li key={entry.label}>
            <NavLink
              to={entry.to ?? "/"}
              end={entry.to === "/"}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors duration-150 ${
                  isActive ? "bg-[var(--accent-soft)] text-brass" : "text-ivory-2 hover:bg-white/5 hover:text-ivory"
                }`
              }
            >
              <Icon name={entry.icon} />
              {entry.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <div>
        <p className="caption px-3 pb-1">À venir</p>
        <ul className="flex flex-col">
          {planned.map((entry) => (
            <li key={entry.label} className="flex min-h-9 items-center gap-3 px-3 text-[0.875rem] text-ivory-3">
              <Icon name={entry.icon} className="size-4" />
              <span className="min-w-0 flex-1">{entry.label}</span>
              <span className="text-xs">{entry.arrives}</span>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

function Credit() {
  return (
    <p className="text-[0.8125rem] leading-snug text-ivory-3">
      Conçu et développé par <span className="text-ivory-2">Andrianina Rasoamanana</span>
    </p>
  );
}

/** Barre latérale (écrans larges) et barre supérieure avec menu (en dessous de 1024 px). */
export function Sidebar() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <aside className="glass glass-frame sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 flex-col gap-8 p-4 lg:flex">
        <div className="px-1 pt-1">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto">
          <Navigation />
        </div>
        <div className="flex flex-col gap-4 px-2">
          <ThemeSwitch compact />
          <Credit />
        </div>
      </aside>

      <header className="glass glass-frame sticky top-3 z-30 flex items-center justify-between px-3 py-2 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="menu-principal"
          className="flex size-11 items-center justify-center rounded-full text-ivory hover:bg-white/5"
        >
          <Icon name="menu" />
          <span className="sr-only">Ouvrir le menu</span>
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu" id="menu-principal">
          <button
            type="button"
            className="absolute inset-0 bg-[rgb(10_12_24/0.6)]"
            onClick={() => setOpen(false)}
            aria-label="Fermer le menu"
          />
          <div className="glass glass-raised drawer absolute inset-y-3 right-3 flex w-[min(20rem,calc(100vw-1.5rem))] flex-col gap-6 overflow-y-auto p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-11 items-center justify-center rounded-full hover:bg-white/5"
              >
                <Icon name="close" />
                <span className="sr-only">Fermer le menu</span>
              </button>
            </div>
            <Navigation onNavigate={() => setOpen(false)} />
            <div className="mt-auto flex flex-col gap-4 px-2">
              <ThemeSwitch />
              <Credit />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
