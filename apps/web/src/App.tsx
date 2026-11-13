import { lazy, Suspense, useEffect } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router";
import { useIsApp } from "./app/platform";
import { Loader, TopProgress } from "./components/Loader";
import { AccountMenu } from "./components/AccountMenu";
import { Sidebar } from "./components/Sidebar";
import { useStoredAccount } from "./app/sessionHint";
import { trackChanges } from "./app/syncMeta";
import { UpdateNotice } from "./components/UpdateNotice";
import { TopoBackground } from "./components/TopoBackground";
import { Composer } from "./pages/Composer";
import { Dashboard } from "./pages/Dashboard";
import { Downloads } from "./pages/Downloads";
import { LessonPage, LessonsIndex } from "./pages/Lessons";
import { EarTraining } from "./pages/EarTraining";
import { Explorer } from "./pages/Explorer";
import { Landing } from "./pages/Landing";
import { Settings } from "./pages/Settings";
import { useSettings } from "./state/store";
import { useTheme } from "./state/theme";
import { nodeView } from "./theory/engine";
import { applyHead, headFor } from "./theory/head";
import { hueOf } from "./theory/labels";
import { idOf, pathOf } from "./theory/routes";

// Pages d'application, chargées à la demande : le client Supabase et la frise
// n'alourdissent pas les pages publiques.
const Analyzer = lazy(() => import("./pages/Analyzer").then((module) => ({ default: module.Analyzer })));
const Library = lazy(() => import("./pages/Analyzer").then((module) => ({ default: module.Library })));
const Account = lazy(() => import("./pages/Account").then((module) => ({ default: module.Account })));
const TrackPage = lazy(() => import("./pages/TrackPage").then((module) => ({ default: module.TrackPage })));

function OnDemand({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loader label="Chargement de la page" />}>{children}</Suspense>;
}

/** Teinte d'une page : celle de l'élément exploré, sinon le vert de la marque. */
export function hueForPath(pathname: string): number {
  const id = idOf(pathname);
  return hueOf((id ? nodeView(id)?.pitchClass : undefined) ?? 0);
}

export function App() {
  const { pathname } = useLocation();
  const hue = hueForPath(pathname);
  const lite = useSettings((state) => state.lite);
  const theme = useTheme();
  const inApp = useIsApp();

  // Les réglages enregistrés ne sont relus qu'après l'hydratation.
  useEffect(() => {
    void Promise.resolve(useSettings.persist.rehydrate()).then(() => useSettings.setState({ ready: true }));
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--h", String(hue));
  }, [hue]);
  useEffect(() => {
    document.documentElement.dataset.lite = String(lite);
  }, [lite]);
  useEffect(() => {
    applyHead(headFor(pathname));
  }, [pathname]);
  // Hors connexion d'abord : chaque modification est notée sur l'appareil ;
  // la synchronisation avec le compte ne se charge qu'une fois connecté.
  const account = useStoredAccount();
  useEffect(trackChanges, []);
  useEffect(() => {
    if (account && import.meta.env.VITE_API_URL) void import("./app/sync").then((module) => module.startSync());
  }, [account]);

  // Sur le web, la racine est la page de présentation, sans barre latérale.
  // Dans une application, on arrive directement au tableau de bord.
  if ((pathname === "/" && !inApp) || pathname === "/presentation") {
    return (
      <>
        <TopProgress />
        <Landing />
      </>
    );
  }

  return (
    <>
      <TopProgress />
      <TopoBackground theme={theme} />
      <div className="mx-auto flex min-h-dvh max-w-[1440px] flex-col gap-4 p-3 sm:p-4 lg:flex-row lg:gap-6">
        <Sidebar />
        {/* Le pied de page reste en bas de l'écran, ou après le contenu s'il est plus long. */}
        <main id="contenu" className="relative flex min-w-0 flex-1 flex-col pb-6">
          <div className="absolute top-2 right-0 z-20 hidden lg:block">
            <AccountMenu />
          </div>
          {inApp && <UpdateNotice />}
          <Routes>
            <Route path="/" element={<Navigate to="/tableau-de-bord" replace />} />
            <Route path="/tableau-de-bord" element={<Dashboard />} />
            <Route path="/explorer" element={<Navigate to={pathOf("note:C")} replace />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/telecharger" element={<Downloads />} />
            <Route path="/oreille" element={<EarTraining />} />
            <Route path="/composer" element={<Composer />} />
            <Route path="/cours" element={<LessonsIndex />} />
            <Route path="/cours/:slug" element={<LessonPage />} />
            <Route path="/analyser" element={<OnDemand><Analyzer /></OnDemand>} />
            <Route path="/analyser/:id" element={<OnDemand><TrackPage /></OnDemand>} />
            <Route path="/bibliotheque" element={<OnDemand><Library /></OnDemand>} />
            <Route path="/compte" element={<OnDemand><Account /></OnDemand>} />
            <Route path="*" element={<Explorer />} />
          </Routes>
          <div className="min-h-16 flex-1" aria-hidden="true" />
          <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[0.8125rem] text-ivory-3">
            <span>
              Harmonie, conçu et développé par <span className="text-ivory-2">Andrianina Rasoamanana</span>
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-1">
              <a href="https://github.com/Andri4nina/Harmonie" rel="noopener" className="underline-offset-4 hover:text-ivory-2 hover:underline">
                Code source, licence AGPL-3.0
              </a>
              {!inApp && (
                <Link to="/telecharger" className="underline-offset-4 hover:text-ivory-2 hover:underline">
                  Télécharger l'application
                </Link>
              )}
            </span>
          </footer>
        </main>
      </div>
    </>
  );
}
