import { useEffect, useState } from "react";
import { type Available, findUpdate } from "../app/updates";

/** Bandeau des applications : une nouvelle version est publiée. */
export function UpdateNotice() {
  const [available, setAvailable] = useState<Available | null>(null);
  const [state, setState] = useState<"idle" | "installing" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Vérification discrète au lancement ; sans réseau, rien ne s'affiche.
    findUpdate()
      .then(setAvailable)
      .catch(() => setAvailable(null));
  }, []);

  if (!available || dismissed) return null;
  return (
    <div role="status" className="glass mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <p className="min-w-0 flex-1">
        La version <span className="font-display font-semibold">{available.version}</span> d'Harmonie est disponible.
        {state === "error" && <span className="text-danger"> L'installation a échoué ; réessayez plus tard.</span>}
      </p>
      {available.install ? (
        <button
          type="button"
          disabled={state === "installing"}
          onClick={() => {
            setState("installing");
            available.install?.().catch(() => setState("error"));
          }}
          className="btn btn-primary"
        >
          {state === "installing" ? "Installation…" : "Mettre à jour et redémarrer"}
        </button>
      ) : (
        <a href={available.url} className="btn btn-primary">
          Télécharger la nouvelle version
        </a>
      )}
      <button type="button" onClick={() => setDismissed(true)} className="btn text-ivory-2 hover:bg-[var(--hover)]">
        Plus tard
      </button>
    </div>
  );
}
