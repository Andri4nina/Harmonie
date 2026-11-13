import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
import { useIsApp } from "../app/platform";
import { useStoredAccount } from "../app/sessionHint";
import { AccountMenu } from "./AccountMenu";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeSwitch";
import { Icon } from "./ui";

interface Entry {
  label: string;
  icon: string;
  to: string;
}

/** Entrées rangées par usage : le titre de groupe dit à quoi elles servent. */
const GROUPS: { title?: string; entries: Entry[] }[] = [
  { entries: [{ label: "Accueil", icon: "dashboard", to: "/tableau-de-bord" }] },
  {
    title: "Comprendre",
    entries: [
      { label: "Explorer la théorie", icon: "explorer", to: "/explorer" },
      { label: "Apprendre", icon: "learning", to: "/cours" },
    ],
  },
  {
    title: "Pratiquer",
    entries: [
      { label: "Entraîner l'oreille", icon: "ear", to: "/oreille" },
      { label: "Composer", icon: "generator", to: "/composer" },
    ],
  },
  {
    title: "Mes morceaux",
    entries: [
      { label: "Analyser un morceau", icon: "analyzer", to: "/analyser" },
      { label: "Ma bibliothèque", icon: "library", to: "/bibliotheque" },
    ],
  },
  {
    title: "Harmonie",
    entries: [
      { label: "Compte", icon: "user", to: "/compte" },
      { label: "Télécharger", icon: "download", to: "/telecharger" },
      { label: "Réglages", icon: "settings", to: "/settings" },
    ],
  },
];

/** Vrai si l'entrée correspond à la page : l'explorateur couvre toutes les pages de référence. */
function matches(to: string, pathname: string): boolean {
  if (to === "/explorer") return /^\/(notes|gammes|accords|tonalites|progressions)(\/|$)/.test(pathname);
  return pathname === to || pathname.startsWith(`${to}/`);
}

function Brand() {
  const inApp = useIsApp();
  return (
    <Link to={inApp ? "/presentation" : "/"} viewTransition className="flex items-center gap-3 rounded-xl" aria-label="Harmonie, présentation">
      <Logo className="size-10 shrink-0" />
      <span className="font-display text-[1.2rem] leading-none font-semibold">Harmonie</span>
    </Link>
  );
}

function Navigation({ onNavigate, mark = true }: { onNavigate?: () => void; mark?: boolean }) {
  // Dans une application (ordinateur, Android), inutile de proposer de la télécharger.
  const inApp = useIsApp();
  const { pathname } = useLocation();
  const account = useStoredAccount();
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-5">
      {GROUPS.map((group) => {
        const entries = group.entries.filter((entry) => !(inApp && entry.to === "/telecharger"));
        if (entries.length === 0) return null;
        return (
          <div key={group.title ?? "accueil"} className="flex flex-col gap-0.5">
            {group.title && <p className="px-3 pb-1 text-[0.75rem] font-medium text-ivory-3">{group.title}</p>}
            <ul className="flex flex-col gap-0.5">
              {entries.map((entry) => {
                const active = matches(entry.to, pathname);
                return (
                  <li key={entry.to}>
                    <Link
                      to={entry.to}
                      viewTransition
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-[0.9375rem] transition-colors duration-150 ${
                        active ? "text-brass" : "text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory"
                      }`}
                    >
                      {active && (
                        // Repère de la page courante : il glisse d'une entrée à l'autre.
                        <span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-xl border border-[var(--accent-line)] bg-[var(--accent-soft)]"
                          style={mark ? { viewTransitionName: "nav-mark" } : undefined}
                        />
                      )}
                      <Icon name={entry.icon} className="relative size-[1.15rem]" />
                      <span className="relative min-w-0 truncate">
                        {entry.to === "/compte" && account ? account.name ?? account.email : entry.label}
                      </span>
                      {entry.to === "/compte" && account && (
                        <span className="relative ml-auto size-2 shrink-0 rounded-full bg-brass" title="Connecté" aria-label="connecté" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
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
        <div className="flex flex-col gap-4 border-t border-line px-2 pt-4">
          <ThemeSwitch compact />
          <Credit />
        </div>
      </aside>

      <header className="glass glass-frame sticky top-3 z-30 flex items-center justify-between gap-2 px-3 py-2 lg:hidden">
        <Brand />
        <span className="ml-auto">
          <AccountMenu />
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="menu-principal"
          className="flex size-11 items-center justify-center rounded-full text-ivory hover:bg-[var(--hover)]"
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
                className="flex size-11 items-center justify-center rounded-full hover:bg-[var(--hover)]"
              >
                <Icon name="close" />
                <span className="sr-only">Fermer le menu</span>
              </button>
            </div>
            <Navigation onNavigate={() => setOpen(false)} mark={false} />
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
