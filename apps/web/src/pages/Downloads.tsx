import { useEffect, useState } from "react";
import { Loader } from "../components/Loader";
import { Icon, Panel } from "../components/ui";
import { track } from "../state/loading";
import {
  type Asset,
  PLATFORMS,
  type PlatformId,
  RELEASES_PAGE,
  ReleasesError,
  fetchAssets,
  formatBytes,
  guessPlatform,
} from "../theory/releases";

type State =
  | { status: "loading" }
  | { status: "ready"; assets: Partial<Record<PlatformId, Asset>> }
  | { status: "error"; message: string; private: boolean };

export function Downloads() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [mine, setMine] = useState<PlatformId | null>(null);

  useEffect(() => {
    setMine(guessPlatform(navigator.userAgent));
    const controller = new AbortController();
    track("Recherche des installateurs", fetchAssets(controller.signal))
      .then((assets) => setState({ status: "ready", assets }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const isPrivate = error instanceof ReleasesError && error.reason === "private";
        setState({ status: "error", message: String((error as Error).message ?? error), private: isPrivate });
      });
    return () => controller.abort();
  }, []);

  const ordered = [...PLATFORMS].sort((a, b) => Number(b.id === mine) - Number(a.id === mine));

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <section className="pt-4 sm:pt-8">
        <h1 className="font-display engrave max-w-[18ch] text-[clamp(2rem,5.6vw,3.9rem)] leading-[1.06] font-semibold tracking-[-0.015em] text-balance">
          Harmonie sur votre ordinateur et votre téléphone.
        </h1>
        <p className="mt-5 max-w-[60ch] text-ivory-2">
          Les applications reprennent le même moteur de théorie que le site et fonctionnent sans connexion. Les fichiers
          viennent directement des publications du dépôt GitHub.
        </p>
      </section>

      {state.status === "loading" && (
        <Panel>
          <Loader label="Recherche des installateurs" />
        </Panel>
      )}

      {state.status === "error" && state.private && (
        <Panel title="Pas encore de téléchargement public">
          <p className="max-w-[62ch] text-ivory-2">
            Les installateurs sont publiés sur le dépôt GitHub du projet, qui n'est pas encore public. Les applications
            de bureau (Windows, macOS, Linux) sont prévues pour la version 1.6 et
            l'application Android pour la version 1.7 ; les fichiers apparaîtront ici dès
            leur publication.
          </p>
        </Panel>
      )}

      {state.status === "error" && !state.private && (
        <Panel title="Publications indisponibles">
          <p className="text-ivory-2">
            La liste des installateurs n'a pas pu être lue ({state.message}). Elle reste consultable sur GitHub.
          </p>
          <a href={RELEASES_PAGE} className="btn btn-ghost mt-4" rel="noopener">
            Ouvrir les publications
          </a>
        </Panel>
      )}

      {state.status === "ready" && (
        <div className="grid gap-4 sm:grid-cols-2">
          {ordered.map((platform) => {
            const asset = state.assets[platform.id];
            return (
              <section key={platform.id} className="glass flex flex-col p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-2xl font-semibold">{platform.name}</h2>
                    <p className="caption mt-1">{platform.detail}</p>
                  </div>
                  {platform.id === mine && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[0.8125rem] text-brass">
                      Votre appareil
                    </span>
                  )}
                </div>
                <div className="mt-6 flex flex-1 items-end">
                  {asset ? (
                    <div className="flex w-full flex-wrap items-center justify-between gap-3">
                      <a href={asset.url} className="btn btn-primary" download>
                        <Icon name="download" className="size-4" />
                        Télécharger {asset.version}
                      </a>
                      <span className="caption">
                        {asset.name}, {formatBytes(asset.bytes)}
                      </span>
                    </div>
                  ) : (
                    <p className="text-ivory-2">
                      Pas encore publié : prévu pour la version {platform.planned.replace("v", "")}. Cette
                      page proposera le fichier dès sa publication.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Panel title="Installer un APK sur Android" framed={false}>
        <ol className="flex max-w-[62ch] list-decimal flex-col gap-2 pl-5 text-ivory-2">
          <li>Téléchargez le fichier APK depuis votre téléphone.</li>
          <li>Ouvrez-le ; Android demande d'autoriser l'installation depuis votre navigateur : acceptez pour ce seul fichier.</li>
          <li>Une fois l'application installée, vous pouvez retirer cette autorisation dans les réglages.</li>
        </ol>
      </Panel>
    </div>
  );
}
