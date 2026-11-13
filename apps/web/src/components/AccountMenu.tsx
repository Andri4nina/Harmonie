import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { type StoredAccount, initials, useStoredAccount } from "../app/sessionHint";
import { type SyncStatus, useSync } from "../app/syncMeta";
import { Icon } from "./ui";

const ACCOUNTS = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

function syncText(status: SyncStatus, at: number | null): string {
  switch (status) {
    case "syncing":
      return "Synchronisation en cours…";
    case "synced":
      return at ? `Synchronisé à ${new Date(at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "Synchronisé";
    case "offline":
      return "Hors connexion : tout est gardé sur l'appareil et partira au retour du réseau.";
    case "error":
      return "Le serveur ne répond pas : tout est gardé sur l'appareil, nouvel essai dans une minute.";
    default:
      return "Gardé sur cet appareil.";
  }
}

/** Photo du compte, ou ses initiales. */
export function Avatar({ account, className = "size-9" }: { account: StoredAccount; className?: string }) {
  const [broken, setBroken] = useState(false);
  return account.avatar && !broken ? (
    <img src={account.avatar} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={`${className} shrink-0 rounded-full object-cover`} />
  ) : (
    <span className={`${className} font-display inline-flex shrink-0 items-center justify-center rounded-full bg-brass text-[0.8rem] font-semibold text-[var(--color-night)]`}>
      {initials(account)}
    </span>
  );
}

/**
 * Avatar du compte connecté, en haut à droite, avec l'état de la
 * synchronisation (pastille) et un menu. Sans compte : « Se connecter ».
 */
export function AccountMenu() {
  const account = useStoredAccount();
  const { status, at } = useSync();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!ACCOUNTS) return null;
  if (!account) {
    return (
      <Link to="/compte" className="btn btn-ghost min-h-10 px-4 text-sm">
        <Icon name="user" className="size-4" />
        Se connecter
      </Link>
    );
  }

  const dot: Record<SyncStatus, string> = {
    off: "bg-[var(--color-ivory-3)]",
    syncing: "bg-brass animate-pulse",
    synced: "bg-brass",
    offline: "bg-[var(--color-ivory-3)]",
    error: "bg-[var(--color-danger)]",
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Compte : ${account.name ?? account.email}`}
        className="relative block rounded-full ring-2 ring-[var(--accent-line)] ring-offset-2 ring-offset-[var(--color-night)] transition-transform duration-150 hover:scale-105 active:scale-95"
      >
        <Avatar account={account} className="pop-in size-9" />
        <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[var(--color-night)] ${dot[status]}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="dialog" aria-label="Compte" className="menu-in glass glass-raised absolute top-12 right-0 z-50 w-72 p-4">
          <div className="flex items-center gap-3">
            <Avatar account={account} className="size-11" />
            <div className="min-w-0">
              {account.name && <p className="truncate font-medium">{account.name}</p>}
              <p className="truncate text-sm text-ivory-2">{account.email}</p>
            </div>
          </div>
          <p className="caption mt-4" role="status">
            {syncText(status, at)}
          </p>
          <div className="mt-4 flex flex-col gap-1">
            <button
              type="button"
              onClick={() => void import("../app/sync").then((module) => module.syncNow())}
              disabled={status === "syncing"}
              className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left text-sm hover:bg-[var(--hover)] disabled:opacity-50"
            >
              <Icon name="loop" className="size-4" />
              Synchroniser maintenant
            </button>
            <Link to="/compte" className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm hover:bg-[var(--hover)]">
              <Icon name="user" className="size-4" />
              Compte et données
            </Link>
            <button
              type="button"
              onClick={() => void import("../app/session").then((module) => module.signOut())}
              className="flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-left text-sm text-ivory-2 hover:bg-[var(--hover)] hover:text-ivory"
            >
              <Icon name="close" className="size-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
